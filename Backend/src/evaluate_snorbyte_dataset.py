import json
import os
import sys
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

HF_REPO = "snorbyte/world-audio-natural-conversations-sample"
DATASET_LOCAL_DIR = backend_dir / "dataset" / "snorbyte_samples"


def evaluate_samples():
    audio_files = sorted([f for f in DATASET_LOCAL_DIR.glob("turn_*.wav") if f.is_file()])
    if not audio_files:
        print("[!] No audio files found in", DATASET_LOCAL_DIR)
        return

    print("\n" + "=" * 78)
    print(" EVALUATION ON: snorbyte/world-audio-natural-conversations-sample")
    print(" Ground Truth: Authentic Human Natural Conversations (Class 0: REAL)")
    print("=" * 78)

    model = VoiceShieldModel()

    results = []
    total_evaluated = 0
    correct_real = 0
    false_positives = 0
    suspicious_count = 0
    total_chunks = 0
    correct_chunks = 0

    print(f"\n{'#':<3} | {'Audio File':<36} | {'Dur(s)':<6} | {'Synth Prob':<10} | {'Verdict':<10} | {'Accuracy'}")
    print("-" * 78)

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
            # Accuracy: correct if verdict is SAFE
            if overall_verdict in ("SAFE", "REAL", "LOW"):
                correct_real += 1
                result_str = "CORRECT [PASS]"
            elif overall_verdict in ("SUSPICIOUS", "MEDIUM"):
                suspicious_count += 1
                result_str = "SUSPICIOUS [BORDERLINE]"
            else:
                false_positives += 1
                result_str = "FALSE ALARM [FAIL]"

            # Chunk-level count
            for c in chunks:
                c_level = str(c.get("risk_level", "SAFE")).upper()
                if c_level in ("SAFE", "REAL", "LOW"):
                    correct_chunks += 1

            file_display = audio_path.name[:34] + ".." if len(audio_path.name) > 36 else audio_path.name
            print(f"{idx:<3} | {file_display:<36} | {duration_sec:<6.2f} | {synthetic_prob_pct:<9.2f}% | {overall_verdict:<10} | {result_str}", flush=True)

            results.append({
                "file": audio_path.name,
                "duration_seconds": duration_sec,
                "chunks_count": len(chunks),
                "synthetic_probability_percent": synthetic_prob_pct,
                "verdict": overall_verdict,
                "is_correct": overall_verdict in ("SAFE", "REAL", "LOW"),
            })

        except Exception as e:
            print(f"{idx:<3} | {audio_path.name:<36} | ERROR: {e}")

    # Summary Statistics
    accuracy_pct = round((correct_real / total_evaluated) * 100.0, 2) if total_evaluated else 0.0
    chunk_accuracy_pct = round((correct_chunks / total_chunks) * 100.0, 2) if total_chunks else 0.0
    fpr_pct = round((false_positives / total_evaluated) * 100.0, 2) if total_evaluated else 0.0
    suspicious_rate_pct = round((suspicious_count / total_evaluated) * 100.0, 2) if total_evaluated else 0.0
    avg_synthetic_score = round(sum(r["synthetic_probability_percent"] for r in results) / len(results), 2) if results else 0.0

    print("\n" + "=" * 78)
    print(" FINAL ACCURACY & PERFORMANCE METRICS")
    print("=" * 78)
    print(f" Total Natural Conversation Turns Tested: {total_evaluated}")
    print(f" Total Audio Chunks Evaluated:           {total_chunks}")
    print(f" Ground Truth:                            Authentic Human Speech (Class: 0 - REAL)")
    print(f" Correct Predictions (Safe/Authentic):    {correct_real} / {total_evaluated}")
    print(f" False Positives (False Alarms / FAKE):   {false_positives} / {total_evaluated} ({fpr_pct}%)")
    print(f" Borderline / Suspicious Flags:           {suspicious_count} / {total_evaluated} ({suspicious_rate_pct}%)")
    print(f" Conversation Turn Accuracy:              {accuracy_pct}%")
    print(f" Chunk-Level Accuracy:                    {chunk_accuracy_pct}%")
    print(f" Average Synthetic Speech Score:          {avg_synthetic_score}% (Confidence: {round(100 - avg_synthetic_score, 2)}% Real)")
    print("=" * 78)

    # Save report
    report_file = backend_dir / "dataset" / "snorbyte_evaluation_report.json"
    report_data = {
        "dataset": HF_REPO,
        "ground_truth": "Authentic Human Natural Conversations",
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
    evaluate_samples()
