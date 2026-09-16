import json
import os
import sys
import zlib
import tarfile
import requests
from pathlib import Path

# Setup paths
src_dir = Path(__file__).resolve().parent
backend_dir = src_dir.parent
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from live_chunk_detector import analyze_audio_file
from voiceshield_inference import VoiceShieldModel

KAGGLE_DATASET = "jacobeis99/md3en"
DATASET_LOCAL_DIR = backend_dir / "dataset" / "md3en_samples"
DATASET_LOCAL_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_KAGGLE_TOKEN = "KGAT_e14a2b69779591bbd11b8dca2ef940f0"


class ZipGzipTarStreamPipe:
    def __init__(self, response):
        self.response = response
        self.iter = response.iter_content(chunk_size=65536)
        self.d_zip = zlib.decompressobj(-15)
        self.d_gz = zlib.decompressobj(16 + zlib.MAX_WBITS)
        self.buffer = bytearray()
        self.header_skipped = False

    def readable(self):
        return True

    def readinto(self, b):
        while len(self.buffer) < len(b):
            try:
                chunk = next(self.iter)
            except StopIteration:
                break
            if not self.header_skipped:
                chunk = chunk[65:]
                self.header_skipped = True
            try:
                gz_chunk = self.d_zip.decompress(chunk)
                if gz_chunk:
                    tar_chunk = self.d_gz.decompress(gz_chunk)
                    if tar_chunk:
                        self.buffer.extend(tar_chunk)
            except Exception:
                break
        if not self.buffer:
            return 0
        n = min(len(b), len(self.buffer))
        b[:n] = self.buffer[:n]
        del self.buffer[:n]
        return n

    def read(self, size=-1):
        if size is None or size < 0:
            size = 65536
        b = bytearray(size)
        n = self.readinto(b)
        return bytes(b[:n])


def download_md3en_samples(count: int = 12):
    existing = list(DATASET_LOCAL_DIR.glob("*.wav"))
    if len(existing) >= count:
        print(f"[*] Found {len(existing)} pre-extracted MD3-EN audio files.")
        return sorted(existing)[:count]

    token = os.getenv("KAGGLE_API_TOKEN", DEFAULT_KAGGLE_TOKEN)
    os.environ["KAGGLE_API_TOKEN"] = token

    print(f"[*] Connecting to Kaggle API for dataset: {KAGGLE_DATASET}...")
    from kaggle.api.kaggle_api_extended import KaggleApi
    from kagglesdk.datasets.types.dataset_api_service import ApiDownloadDatasetRequest

    api = KaggleApi()
    api.authenticate()
    kaggle = api.build_kaggle_client()

    req = ApiDownloadDatasetRequest()
    req.owner_slug = "jacobeis99"
    req.dataset_slug = "md3en"
    req.file_name = "audio_en_in.tgz"

    print("[*] Generating secure pre-signed stream URL for Indian English (en-in)...")
    res = kaggle.datasets.dataset_api_client.download_dataset(req)
    url = res.request.url

    print(f"[*] Streaming and extracting {count} dialogue audio turns...")
    r = requests.get(url, stream=True)
    pipe = ZipGzipTarStreamPipe(r)
    tf = tarfile.TarFile.open(mode="r|", fileobj=pipe)

    extracted_files = []
    for member in tf:
        if member.isfile() and member.name.endswith(".wav"):
            f = tf.extractfile(member)
            if f:
                target = DATASET_LOCAL_DIR / Path(member.name).name
                target.write_bytes(f.read())
                extracted_files.append(target)
                print(f"    [{len(extracted_files)}/{count}] Extracted: {target.name} ({round(target.stat().st_size / 1024, 1)} KB)")
                if len(extracted_files) >= count:
                    break
    r.close()
    return extracted_files


def evaluate_samples(audio_files):
    print("\n" + "=" * 80)
    print(" EVALUATION ON: MD3-EN (Multi-Dialect Dataset of Dialogues - Indian English)")
    print(" Kaggle Ref:   jacobeis99/md3en (Locale: en_in - Spontaneous Indian English)")
    print(" Ground Truth: Authentic Human Dialectal Dialogues (Class 0: REAL)")
    print("=" * 80)

    model = VoiceShieldModel()

    results = []
    total_evaluated = 0
    correct_real = 0
    false_positives = 0
    suspicious_count = 0
    total_chunks = 0
    correct_chunks = 0

    print(f"\n{'#':<3} | {'Audio File':<32} | {'Dur(s)':<6} | {'Chunks':<6} | {'Synth Prob':<10} | {'Verdict':<10} | {'Result'}")
    print("-" * 80)

    for idx, audio_path in enumerate(audio_files, 1):
        try:
            res = analyze_audio_file(audio_path, model=model)
            avg_fake_score = float(res.get("average_fake_score", 0.0))
            overall_verdict = str(res.get("risk_level", "SAFE")).upper()
            synthetic_prob_pct = round(avg_fake_score * 100.0, 2)
            duration_sec = round(float(res.get("total_duration", 0.0)), 2)
            chunks = res.get("chunks", [])

            total_evaluated += 1
            total_chunks += len(chunks)

            # Ground truth is REAL (0)
            if overall_verdict in ("SAFE", "REAL", "LOW"):
                correct_real += 1
                result_str = "CORRECT [PASS]"
            elif overall_verdict in ("SUSPICIOUS", "MEDIUM"):
                suspicious_count += 1
                result_str = "SUSPICIOUS [BORDERLINE]"
            else:
                false_positives += 1
                result_str = "FALSE ALARM [FAIL]"

            for c in chunks:
                c_level = str(c.get("risk_level", "SAFE")).upper()
                if c_level in ("SAFE", "REAL", "LOW"):
                    correct_chunks += 1

            file_display = audio_path.name[:30] + ".." if len(audio_path.name) > 32 else audio_path.name
            print(f"{idx:<3} | {file_display:<32} | {duration_sec:<6.2f} | {len(chunks):<6} | {synthetic_prob_pct:<9.2f}% | {overall_verdict:<10} | {result_str}", flush=True)

            results.append({
                "file": audio_path.name,
                "duration_seconds": duration_sec,
                "chunks_count": len(chunks),
                "synthetic_probability_percent": synthetic_prob_pct,
                "verdict": overall_verdict,
                "is_correct": overall_verdict in ("SAFE", "REAL", "LOW"),
            })

        except Exception as e:
            print(f"{idx:<3} | {audio_path.name:<32} | ERROR: {e}", flush=True)

    accuracy_pct = round((correct_real / total_evaluated) * 100.0, 2) if total_evaluated else 0.0
    chunk_accuracy_pct = round((correct_chunks / total_chunks) * 100.0, 2) if total_chunks else 0.0
    fpr_pct = round((false_positives / total_evaluated) * 100.0, 2) if total_evaluated else 0.0
    suspicious_rate_pct = round((suspicious_count / total_evaluated) * 100.0, 2) if total_evaluated else 0.0
    avg_synthetic_score = round(sum(r["synthetic_probability_percent"] for r in results) / len(results), 2) if results else 0.0

    print("\n" + "=" * 80)
    print(" FINAL ACCURACY & PERFORMANCE METRICS (MD3-EN INDIAN ENGLISH)")
    print("=" * 80)
    print(f" Total Indian English Dialogues Evaluated:  {total_evaluated}")
    print(f" Total Audio Chunks Evaluated:              {total_chunks}")
    print(f" Ground Truth:                               Authentic Human Speech (Class: 0 - REAL)")
    print(f" Correct Predictions (Safe/Authentic):       {correct_real} / {total_evaluated}")
    print(f" False Positives (False Alarms / FAKE):      {false_positives} / {total_evaluated} ({fpr_pct}%)")
    print(f" Borderline / Suspicious Flags:              {suspicious_count} / {total_evaluated} ({suspicious_rate_pct}%)")
    print(f" Dialogue Turn Accuracy:                     {accuracy_pct}%")
    print(f" Chunk-Level Accuracy:                       {chunk_accuracy_pct}%")
    print(f" Average Synthetic Speech Score:             {avg_synthetic_score}% (Confidence: {round(100 - avg_synthetic_score, 2)}% Real)")
    print("=" * 80)

    report_file = backend_dir / "dataset" / "md3en_evaluation_report.json"
    report_data = {
        "dataset": KAGGLE_DATASET,
        "dialect": "Indian English (en-in)",
        "ground_truth": "Authentic Human Dialectal Dialogues",
        "total_samples": total_evaluated,
        "total_chunks": total_chunks,
        "correct_samples": correct_real,
        "false_positives": false_positives,
        "suspicious_count": suspicious_count,
        "accuracy_percent": accuracy_pct,
        "chunk_accuracy_percent": chunk_accuracy_pct,
        "false_positive_rate_percent": fpr_pct,
        "suspicious_rate_percent": suspicious_rate_pct,
        "average_synthetic_probability_percent": avg_synthetic_score,
        "details": results
    }
    report_file.write_text(json.dumps(report_data, indent=2), encoding="utf-8")
    print(f"[*] Full evaluation report saved to: {report_file.resolve()}\n")

    return report_data


if __name__ == "__main__":
    audio_files = download_md3en_samples(count=12)
    evaluate_samples(audio_files)
