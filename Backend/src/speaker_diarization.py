import argparse
import os
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch


DEFAULT_DIARIZATION_MODEL = "pyannote/speaker-diarization-3.1"
HF_TOKEN_ENV_VARS = ("HF_TOKEN", "HUGGINGFACE_TOKEN", "HUGGINGFACE_HUB_TOKEN")


class DiarizationSetupError(RuntimeError):
    """Raised when pyannote diarization is not available or not configured."""


def _hf_token() -> Optional[str]:
    for name in HF_TOKEN_ENV_VARS:
        token = os.getenv(name)
        if token:
            return token

    # Check for .env file in Backend or project root
    search_dirs = [
        Path(__file__).resolve().parent.parent,
        Path(__file__).resolve().parent.parent.parent,
    ]
    for directory in search_dirs:
        env_file = directory / ".env"
        if env_file.is_file():
            try:
                for line in env_file.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key in HF_TOKEN_ENV_VARS and val:
                        return val
            except Exception:
                pass

    return None


@lru_cache(maxsize=1)
def load_diarization_pipeline(
    model_name: str = DEFAULT_DIARIZATION_MODEL,
    device: Optional[str] = None,
):
    """Load the pyannote pipeline once per process."""
    try:
        from pyannote.audio import Pipeline
    except ImportError as exc:
        raise DiarizationSetupError(
            "pyannote.audio is not installed. Install it with: pip install pyannote.audio"
        ) from exc

    token = _hf_token()
    if not token:
        raise DiarizationSetupError(
            "Hugging Face token not found. Set HF_TOKEN after accepting access to "
            f"{model_name} on Hugging Face."
        )

    try:
        pipeline = Pipeline.from_pretrained(model_name, token=token)
    except TypeError:
        pipeline = Pipeline.from_pretrained(model_name, use_auth_token=token)
    except Exception as exc:
        raise DiarizationSetupError(
            "Could not load the pyannote diarization model. Make sure your Hugging Face "
            f"account has accepted the gated model conditions for {model_name}, and "
            "that HF_TOKEN is set to a token with read access."
        ) from exc

    target_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    if hasattr(pipeline, "to"):
        pipeline.to(torch.device(target_device))
    return pipeline


def acoustic_diarize_audio(
    audio_input: str | Path | np.ndarray,
    n_speakers: int = 2,
    target_sr: int = 16000,
) -> List[Dict[str, object]]:
    """Fast, offline acoustic diarization using voice activity splitting,

    MFCC spectral clustering, and agglomerative linkage. Does not require
    external Hugging Face tokens or gated models.
    Supports audio files, video containers (e.g. mp4, m4a), and in-memory numpy arrays.
    """
    import librosa
    from sklearn.cluster import AgglomerativeClustering, KMeans

    if isinstance(audio_input, np.ndarray):
        y = np.asarray(audio_input, dtype=np.float32)
        sr = target_sr
    else:
        from audio_preprocessing import load_audio
        audio_data = load_audio(audio_input)
        y = audio_data.samples
        sr = audio_data.sample_rate

    if len(y) < sr * 0.5:
        return []

    # Detect speech intervals using non-silent regions
    intervals = librosa.effects.split(y, top_db=25, frame_length=2048, hop_length=512)

    # Subdivide into 1.5s - 2.5s candidate segments for accurate turn resolution
    sub_segments = []
    min_len = int(0.35 * sr)
    max_chunk = int(2.0 * sr)

    if len(intervals) == 0:
        step = int(1.5 * sr)
        for st in range(0, len(y), step):
            en = min(st + max_chunk, len(y))
            if en - st >= min_len:
                sub_segments.append((st, en))
    else:
        for start_idx, end_idx in intervals:
            duration = end_idx - start_idx
            if duration < min_len:
                continue
            if duration > max_chunk:
                cur = start_idx
                while cur < end_idx:
                    nxt = min(cur + max_chunk, end_idx)
                    if nxt - cur >= min_len:
                        sub_segments.append((cur, nxt))
                    cur = nxt
            else:
                sub_segments.append((start_idx, end_idx))

    if not sub_segments:
        return []

    features = []
    valid_segments = []
    for st, en in sub_segments:
        chunk = y[st:en]
        if np.max(np.abs(chunk)) < 1e-4:
            continue
        # Extract 20 MFCCs (mean + std) + spectral centroid + zero crossing rate
        mfcc = librosa.feature.mfcc(y=chunk, sr=sr, n_mfcc=20)
        mfcc_mean = np.mean(mfcc, axis=1)
        mfcc_std = np.std(mfcc, axis=1)
        cent = librosa.feature.spectral_centroid(y=chunk, sr=sr)
        cent_mean = np.mean(cent)
        cent_std = np.std(cent)
        zcr = np.mean(librosa.feature.zero_crossing_rate(chunk))

        feat = np.hstack([mfcc_mean, mfcc_std, [cent_mean / 1000.0, cent_std / 1000.0, zcr]])
        features.append(feat)
        valid_segments.append((st, en))

    if not features:
        return []

    X = np.array(features)
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    X_norm = X / norms

    if len(valid_segments) >= n_speakers:
        try:
            clustering = AgglomerativeClustering(n_clusters=n_speakers, metric="cosine", linkage="average")
            labels = clustering.fit_predict(X_norm)
        except Exception:
            clustering = KMeans(n_clusters=n_speakers, random_state=42, n_init=5)
            labels = clustering.fit_predict(X_norm)
    else:
        labels = [0] * len(valid_segments)

    raw_turns = []
    for (st, en), label in zip(valid_segments, labels):
        raw_turns.append({
            "speaker": f"SPEAKER_{label:02d}",
            "start": round(st / sr, 3),
            "end": round(en / sr, 3),
        })

    # Merge consecutive turns belonging to the same speaker if separated by small silence
    merged = []
    for turn in raw_turns:
        if not merged:
            merged.append(turn)
            continue
        last = merged[-1]
        if last["speaker"] == turn["speaker"] and (turn["start"] - last["end"]) <= 0.6:
            last["end"] = turn["end"]
        else:
            merged.append(turn)

    return merged


def diarize_audio(
    audio_path: str | Path,
    *,
    model_name: str = DEFAULT_DIARIZATION_MODEL,
    device: Optional[str] = None,
    samples: Optional[np.ndarray] = None,
    sample_rate: int = 16000,
) -> List[Dict[str, object]]:
    """Return speaker turns for an audio file.

    Use a real speaker diarizer on the same waveform used for classification.
    Unavailable diarization raises an explicit error so callers can fall back
    to whole-recording chunk analysis without inventing two speaker identities.
    """
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")

    if samples is None:
        from audio_preprocessing import load_audio
        audio = load_audio(path)
        if not audio.valid:
            raise ValueError(audio.warning or 'Unusable audio')
        samples, sample_rate = audio.samples, audio.sample_rate

    token = _hf_token()
    if token:
        try:
            pipeline = load_diarization_pipeline(model_name=model_name, device=device)
            output = pipeline({'waveform': torch.from_numpy(np.asarray(samples, dtype=np.float32)).unsqueeze(0),
                               'sample_rate': sample_rate})
            diarization = getattr(output, 'speaker_diarization', output)
            segments: List[Dict[str, object]] = []
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                start = float(turn.start)
                end = float(turn.end)
                if end <= start:
                    continue
                segments.append({
                    "speaker": str(speaker),
                    "start": round(start, 3),
                    "end": round(end, 3),
                })
            if segments:
                return sorted(segments, key=lambda item: (float(item["start"]), float(item["end"]), str(item["speaker"])))
        except Exception as pyannote_err:
            raise DiarizationSetupError('Speaker diarization unavailable; analyzing recording without speaker identities.') from pyannote_err

    raise DiarizationSetupError('Speaker diarization requires a configured pyannote model and HF_TOKEN.')


def print_diarization(segments: List[Dict[str, object]]) -> None:
    if not segments:
        print("No speech segments detected.")
        return

    for segment in segments:
        print(f"{segment['speaker']}: {segment['start']:.2f}s - {segment['end']:.2f}s")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run speaker diarization on an audio file.")
    parser.add_argument("audio_file")
    parser.add_argument("--model", default=DEFAULT_DIARIZATION_MODEL)
    args = parser.parse_args()

    segments = diarize_audio(args.audio_file, model_name=args.model)
    print_diarization(segments)


if __name__ == "__main__":
    main()
