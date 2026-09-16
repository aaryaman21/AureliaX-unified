import os
import sys
import time
import io
import json
import random
from pathlib import Path
import soundfile as sf
import numpy as np
import joblib
import pyarrow.parquet as pq

# Add src to sys.path
src_dir = Path(__file__).resolve().parent
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix,
    roc_auc_score,
    roc_curve,
    log_loss,
)

from wavlm_features import WavLMFeatureExtractor, cached_embedding, supported_audio_files

PARQUET_PATH = Path(
    r"C:\Users\Aaryaman Singh\.cache\huggingface\hub\datasets--SpeechAntiSpoofingBenchmarks--ASVspoof2021_LA\snapshots\46df9e62a71f74d0597cd84e3814784b86c6de83\data\test-00000-of-00024.parquet"
)
DEST_DIR = Path("dataset/telephony_calls")
CACHE_DIR = Path("cache/telephony")
MODEL_DIR = Path("models/voiceshield_telephony")

SAMPLES_PER_CLASS = 120
TRAIN_RATIO = 0.70  # 84 real, 84 fake = 168 total
VAL_RATIO = 0.15    # 18 real, 18 fake = 36 total
TEST_RATIO = 0.15   # 18 real, 18 fake = 36 total


def extract_and_organize_calls():
    print("\n" + "=" * 60)
    print("STEP 1: Extracting Telephony Call Audio (ASVspoof 2021 LA)")
    print("Codecs: Real-world telephone transmission (PSTN/VoIP/Cellular)")
    print(f"Target: {SAMPLES_PER_CLASS} Human Calls + {SAMPLES_PER_CLASS} AI Calls")
    print("=" * 60)

    table = pq.read_table(PARQUET_PATH)
    labels = table["label"].to_pylist()
    paths = table["path"].to_pylist()
    audio_col = table["audio"]

    real_indices = [i for i, l in enumerate(labels) if l == 0]
    fake_indices = [i for i, l in enumerate(labels) if l == 1]

    random.seed(42)
    selected_real = random.sample(real_indices, SAMPLES_PER_CLASS)
    selected_fake = random.sample(fake_indices, SAMPLES_PER_CLASS)

    splits = {
        "training": {
            "real": selected_real[: int(SAMPLES_PER_CLASS * TRAIN_RATIO)],
            "fake": selected_fake[: int(SAMPLES_PER_CLASS * TRAIN_RATIO)],
        },
        "validation": {
            "real": selected_real[int(SAMPLES_PER_CLASS * TRAIN_RATIO) : int(SAMPLES_PER_CLASS * (TRAIN_RATIO + VAL_RATIO))],
            "fake": selected_fake[int(SAMPLES_PER_CLASS * TRAIN_RATIO) : int(SAMPLES_PER_CLASS * (TRAIN_RATIO + VAL_RATIO))],
        },
        "testing": {
            "real": selected_real[int(SAMPLES_PER_CLASS * (TRAIN_RATIO + VAL_RATIO)) :],
            "fake": selected_fake[int(SAMPLES_PER_CLASS * (TRAIN_RATIO + VAL_RATIO)) :],
        },
    }

    count = 0
    for split_name, class_dict in splits.items():
        for label_name, idx_list in class_dict.items():
            out_folder = DEST_DIR / split_name / label_name
            out_folder.mkdir(parents=True, exist_ok=True)
            for idx in idx_list:
                audio_bytes = audio_col[idx]["bytes"].as_py()
                filename = paths[idx]
                target_path = out_folder / filename
                if not target_path.exists():
                    with open(target_path, "wb") as f:
                        f.write(audio_bytes)
                count += 1

    print(f"Extracted and saved {count} telephone call files to {DEST_DIR}")
    print(f" - Training:   {len(splits['training']['real'])} Human Calls, {len(splits['training']['fake'])} AI Calls")
    print(f" - Validation: {len(splits['validation']['real'])} Human Calls, {len(splits['validation']['fake'])} AI Calls")
    print(f" - Testing:    {len(splits['testing']['real'])} Human Calls, {len(splits['testing']['fake'])} AI Calls")


def extract_features(extractor: WavLMFeatureExtractor, split: str):
    X = []
    y = []
    split_dir = DEST_DIR / split
    cache_split_dir = CACHE_DIR / split
    cache_split_dir.mkdir(parents=True, exist_ok=True)

    items = []
    for label_name, label_val in [("real", 0), ("fake", 1)]:
        folder = split_dir / label_name
        for p in supported_audio_files(folder):
            items.append((p, label_val))

    print(f"\nExtracting WavLM features for [{split}] split ({len(items)} call recordings)...")
    start = time.time()
    for idx, (audio_path, label) in enumerate(items, 1):
        emb, _, hit = cached_embedding(extractor, audio_path, cache_split_dir)
        X.append(emb)
        y.append(label)
        if idx % 25 == 0 or idx == len(items):
            print(f" [{split}] Processed {idx}/{len(items)} calls ({time.time() - start:.1f}s)")

    return np.vstack(X), np.asarray(y, dtype=np.int64)


def calculate_eer(y_true, y_scores):
    fpr, tpr, thresholds = roc_curve(y_true, y_scores)
    fnr = 1 - tpr
    idx = np.nanargmin(np.absolute(fnr - fpr))
    return float(fpr[idx]), float(thresholds[idx])


def main():
    start_total = time.time()
    extract_and_organize_calls()

    print("\n" + "=" * 60)
    print("STEP 2: Extracting WavLM Audio Embeddings for Telephony Audio")
    print("=" * 60)
    extractor = WavLMFeatureExtractor()

    X_train, y_train = extract_features(extractor, "training")
    X_val, y_val = extract_features(extractor, "validation")
    X_test, y_test = extract_features(extractor, "testing")

    print("\n" + "=" * 60)
    print("STEP 3: Training Call Forensics Classifier")
    print(f"Feature Dimension: {X_train.shape[1]}")
    print("=" * 60)

    pipeline = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("classifier", LogisticRegression(max_iter=3000, class_weight="balanced", random_state=42)),
        ]
    )

    pipeline.fit(X_train, y_train)

    classes = list(pipeline.named_steps["classifier"].classes_)
    fake_idx = classes.index(1)

    train_probs = pipeline.predict_proba(X_train)[:, fake_idx]
    val_probs = pipeline.predict_proba(X_val)[:, fake_idx]
    test_probs = pipeline.predict_proba(X_test)[:, fake_idx]

    train_preds = (train_probs >= 0.5).astype(int)
    val_preds = (val_probs >= 0.5).astype(int)
    test_preds = (test_probs >= 0.5).astype(int)

    train_acc = accuracy_score(y_train, train_preds)
    val_acc = accuracy_score(y_val, val_preds)
    test_acc = accuracy_score(y_test, test_preds)
    test_balanced_acc = balanced_accuracy_score(y_test, test_preds)

    p_real, r_real, f1_real, _ = precision_recall_fscore_support(y_test, test_preds, pos_label=0, average="binary")
    p_fake, r_fake, f1_fake, _ = precision_recall_fscore_support(y_test, test_preds, pos_label=1, average="binary")
    macro_f1 = precision_recall_fscore_support(y_test, test_preds, average="macro")[2]
    weighted_f1 = precision_recall_fscore_support(y_test, test_preds, average="weighted")[2]

    cm = confusion_matrix(y_test, test_preds, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()

    roc_auc = roc_auc_score(y_test, test_probs)
    eer, eer_thresh = calculate_eer(y_test, test_probs)
    test_loss = log_loss(y_test, test_probs)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_DIR / "classifier.joblib")

    meta = {
        "dataset_name": "ASVspoof2021_LA_Telephony",
        "codec_environment": "Simulated and real-world telephone networks (PSTN, VoIP, G.711, AMR)",
        "accuracy_scores": {
            "train_accuracy": round(float(train_acc), 4),
            "validation_accuracy": round(float(val_acc), 4),
            "test_accuracy": round(float(test_acc), 4),
            "test_balanced_accuracy": round(float(test_balanced_acc), 4),
            "test_roc_auc": round(float(roc_auc), 4),
            "test_equal_error_rate_eer": round(float(eer), 4),
            "test_log_loss": round(float(test_loss), 4),
            "macro_f1": round(float(macro_f1), 4),
            "weighted_f1": round(float(weighted_f1), 4),
            "human_call_class": {
                "precision": round(float(p_real), 4),
                "recall": round(float(r_real), 4),
                "f1_score": round(float(f1_real), 4),
            },
            "ai_call_class": {
                "precision": round(float(p_fake), 4),
                "recall": round(float(r_fake), 4),
                "f1_score": round(float(f1_fake), 4),
            },
        },
        "confusion_matrix": {
            "true_human_calls_tn": int(tn),
            "false_ai_calls_fp": int(fp),
            "false_human_calls_fn": int(fn),
            "true_ai_calls_tp": int(tp),
        },
        "total_elapsed_seconds": round(time.time() - start_total, 2),
    }

    with open(MODEL_DIR / "metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    print("\n" + "=" * 60)
    print("        TELEPHONY CALL FORENSICS ACCURACY REPORT        ")
    print("=" * 60)
    print("Dataset:                    ASVspoof 2021 LA (Telephony Transmission)")
    print("Channel:                    PSTN / VoIP / Telephone Codecs")
    print("Feature Extractor:          microsoft/wavlm-base")
    print("-" * 60)
    print(f"TRAIN ACCURACY:             {train_acc * 100:.2f}%")
    print(f"VALIDATION ACCURACY:        {val_acc * 100:.2f}%")
    print(f"TEST ACCURACY:              {test_acc * 100:.2f}%")
    print(f"TEST BALANCED ACCURACY:     {test_balanced_acc * 100:.2f}%")
    print(f"TEST MACRO F1 SCORE:        {macro_f1 * 100:.2f}%")
    print(f"TEST ROC-AUC SCORE:         {roc_auc * 100:.2f}%")
    print(f"EQUAL ERROR RATE (EER):     {eer * 100:.2f}% (Threshold: {eer_thresh:.4f})")
    print("-" * 60)
    print("DETAILED PER-CLASS METRICS (PHONE CALL TEST SET):")
    print(f"  HUMAN Calls -> Precision: {p_real * 100:.2f}% | Recall: {r_real * 100:.2f}% | F1: {f1_real * 100:.2f}%")
    print(f"  AI Calls    -> Precision: {p_fake * 100:.2f}% | Recall: {r_fake * 100:.2f}% | F1: {f1_fake * 100:.2f}%")
    print("-" * 60)
    print("CONFUSION MATRIX (TEST SET):")
    print(f"  True Human Calls  (Correct):     {tn} / {tn + fp}")
    print(f"  False AI Calls    (Marked Fake): {fp} / {tn + fp}")
    print(f"  False Human Calls (Marked Real): {fn} / {fn + tp}")
    print(f"  True AI Calls     (Correct):     {tp} / {fn + tp}")
    print("=" * 60)
    print(f"Artifacts saved to: {MODEL_DIR}")
    print(f"Total pipeline execution time: {time.time() - start_total:.2f} seconds\n")


if __name__ == "__main__":
    main()
