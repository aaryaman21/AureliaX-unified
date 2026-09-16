from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

import librosa
import numpy as np


TARGET_SAMPLE_RATE = 16000
PREPROCESSING_VERSION = "audio-preprocess-v3-quality-check"


@dataclass
class AudioConfig:
    sample_rate: int = TARGET_SAMPLE_RATE
    trim_top_db: float = 35.0
    min_duration_seconds: float = 0.75
    near_silent_rms: float = 1e-4
    peak_normalize_to: float = 0.95


@dataclass
class AudioData:
    samples: np.ndarray
    sample_rate: int
    duration_seconds: float
    rms: float
    peak: float
    was_trimmed: bool
    valid: bool
    warning: Optional[str] = None


def preprocess_samples(
    samples: np.ndarray,
    input_sample_rate: int,
    config: AudioConfig | None = None,
) -> AudioData:
    """Apply the shared VoiceShield preprocessing to already-loaded audio samples."""
    config = config or AudioConfig()
    samples = np.asarray(samples, dtype=np.float32)
    if input_sample_rate <= 0 or not np.isfinite(samples).all():
        raise ValueError('Audio must have a positive sample rate and finite samples')
    if samples.ndim > 1:
        samples = np.mean(samples, axis=1)

    if input_sample_rate != config.sample_rate and samples.size > 0:
        samples = librosa.resample(
            samples,
            orig_sr=input_sample_rate,
            target_sr=config.sample_rate,
        ).astype(np.float32, copy=False)

    if samples.size == 0:
        return AudioData(
            samples=samples,
            sample_rate=config.sample_rate,
            duration_seconds=0.0,
            rms=0.0,
            peak=0.0,
            was_trimmed=False,
            valid=False,
            warning="empty audio",
        )

    original_length = len(samples)
    trimmed, index = librosa.effects.trim(
        samples,
        top_db=config.trim_top_db,
        frame_length=2048,
        hop_length=512,
    )
    if trimmed.size > 0:
        samples = trimmed.astype(np.float32, copy=False)

    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    original_rms = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
    if peak > 1e-8:
        samples = (samples / peak * config.peak_normalize_to).astype(np.float32)

    rms = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
    duration = float(samples.size / config.sample_rate)
    warning = None
    valid = True

    if duration < config.min_duration_seconds:
        valid = False
        warning = f"audio too short after preprocessing ({duration:.2f}s)"
    elif original_rms < config.near_silent_rms:
        valid = False
        warning = f"audio is near silent before normalization (rms={original_rms:.6f})"

    return AudioData(
        samples=samples,
        sample_rate=config.sample_rate,
        duration_seconds=duration,
        rms=rms,
        peak=peak,
        was_trimmed=bool(index[0] > 0 or index[1] < original_length),
        valid=valid,
        warning=warning,
    )


def _get_ffmpeg_executable() -> str:
    """Resolve a modern FFmpeg binary, prioritizing bundled imageio-ffmpeg over legacy system binaries."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        import shutil
        found = shutil.which("ffmpeg")
        return found or "ffmpeg"


def _extract_audio_with_ffmpeg(input_path: str | Path, target_sr: int = TARGET_SAMPLE_RATE) -> tuple[np.ndarray, int]:
    """Extract audio track from video files (mp4, mov, mkv, etc.) or unsupported containers using modern ffmpeg."""
    import subprocess
    import tempfile
    import os

    ffmpeg_bin = _get_ffmpeg_executable()
    temp_wav = Path(tempfile.gettempdir()) / f"voiceshield_extracted_{os.urandom(8).hex()}.wav"
    try:
        cmd = [
            ffmpeg_bin, "-y", "-i", str(input_path),
            "-vn", "-acodec", "pcm_s16le", "-ar", str(target_sr), "-ac", "1",
            str(temp_wav)
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if result.returncode != 0 or not temp_wav.exists() or temp_wav.stat().st_size == 0:
            err_msg = result.stderr.decode("utf-8", errors="ignore") if result.stderr else "Unknown error"
            if "does not contain any stream" in err_msg or "Output file is empty" in err_msg:
                raise ValueError(f"Uploaded video '{Path(input_path).name}' does not contain an audio track.")
            raise RuntimeError(f"FFmpeg failed to extract audio from '{Path(input_path).name}': {err_msg[:250]}")

        samples, sr = librosa.load(str(temp_wav), sr=None, mono=True)
        return samples, sr
    finally:
        if temp_wav.exists():
            try:
                temp_wav.unlink()
            except OSError:
                pass


def load_audio(path: str | Path, config: AudioConfig | None = None) -> AudioData:
    """Load audio exactly once for both training and inference, with full video container support."""
    config = config or AudioConfig()
    path_obj = Path(path)
    suffix = path_obj.suffix.lower()
    video_extensions = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}

    if suffix in video_extensions:
        # For video containers, always use modern FFmpeg to extract audio; never feed video directly to soundfile
        samples, sr = _extract_audio_with_ffmpeg(path, config.sample_rate)
    else:
        try:
            samples, sr = librosa.load(str(path), sr=None, mono=True)
        except Exception:
            # If librosa/soundfile fails on an unexpected container/codec, attempt FFmpeg extraction
            samples, sr = _extract_audio_with_ffmpeg(path, config.sample_rate)

    return preprocess_samples(samples, sr, config)


def augment_audio(samples: np.ndarray, sample_rate: int, rng: np.random.Generator) -> np.ndarray:
    """Conservative training-only augmentation for microphone/phone variation."""
    augmented = np.asarray(samples, dtype=np.float32).copy()

    if rng.random() < 0.70:
        gain = float(rng.uniform(0.80, 1.15))
        augmented *= gain

    if rng.random() < 0.45:
        rms = float(np.sqrt(np.mean(np.square(augmented)))) if augmented.size else 0.0
        noise_level = rms * float(rng.uniform(0.002, 0.010))
        augmented += rng.normal(0.0, noise_level, size=augmented.shape).astype(np.float32)

    if rng.random() < 0.25 and augmented.size > sample_rate:
        degraded_sr = int(rng.choice([8000, 11025, 12000]))
        degraded = librosa.resample(augmented, orig_sr=sample_rate, target_sr=degraded_sr)
        augmented = librosa.resample(degraded, orig_sr=degraded_sr, target_sr=sample_rate)

    peak = float(np.max(np.abs(augmented))) if augmented.size else 0.0
    if peak > 1.0:
        augmented = augmented / peak

    return augmented.astype(np.float32, copy=False)


def audio_config_dict(config: AudioConfig | None = None) -> Dict[str, float | int | str]:
    config = config or AudioConfig()
    return {
        "version": PREPROCESSING_VERSION,
        "sample_rate": config.sample_rate,
        "trim_top_db": config.trim_top_db,
        "min_duration_seconds": config.min_duration_seconds,
        "near_silent_rms": config.near_silent_rms,
        "peak_normalize_to": config.peak_normalize_to,
    }
