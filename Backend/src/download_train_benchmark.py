import os
import sys
import time
import shutil
import random
import hashlib
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Set offline mode for fast huggingface loading once cached
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# Add src to python path
src_dir = Path(__file__).resolve().parent
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

import numpy as np
import joblib
from huggingface_hub import HfApi, hf_hub_download
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

DATASET_REPO = "garystafford/deepfake-audio-detection"
BENCHMARK_DIR = Path("dataset/downloaded_benchmark")
CACHE_DIR = Path("cache/benchmark")
MODEL_DIR = Path("models/voiceshield_benchmark")

# Balanced sample target: 120 real, 120 fake = 240 total
SAMPLES_PER_CLASS = 120
TRAIN_RATIO = 0.70  # 84 per class = 168 total
VAL_RATIO = 0.15    # 18 per class = 36 total
TEST_RATIO = 0.15   # 18 per class = 36 total


def download_single_file(filename: str, dest_dir: Path) -> Path:
    dest_path = dest_dir / Path(filename).name
    if dest_path.exists() and dest_path.stat().st_size > 1000:
        return dest_path
    
    cached_path = hf_hub_download(
        repo_id=DATASET_REPO,
        filename=filename,
        repo_type="dataset",
    )
    shutil.copy2(cached_path, dest_path)
    return dest_path


def download_and_split_dataset():
    print(f"\n========================================================")
    print(f"STEP 1: Downloading benchmark dataset from Hugging Face")
    print(f"Repo: {DATASET_REPO}")
    print(f"Target: {SAMPLES_PER_CLASS} Real + {SAMPLES_PER_CLASS} Fake files")
    print(f"========================================================")

    api = HfApi()
    all_files = api.list_repo_files(repo_id=DATASET_REPO, repo_type="dataset")
    
    real_files = sorted([f for f in all_files if f.startswith("real/") and f.endswith(".flac")])
    fake_files = sorted([f for f in all_files if f.startswith("fake/") and f.endswith(".flac")])
    
    random.seed(42)
    selected_real = random.sample(real_files, SAMPLES_PER_CLASS)
    selected_fake = random.sample(fake_files, SAMPLES_PER_CLASS)
    
    splits = {
        "training": {
            "real": selected_real[:int(SAMPLES_PER_CLASS * TRAIN_RATIO)],
            "fake": selected_fake[:int(SAMPLES_PER_CLASS * TRAIN_RATIO)],
        },
        "validation": {
            "real": selected_real[int(SAMPLES_PER_CLASS * TRAIN_RATIO):int(SAMPLES_PER_CLASS * (TRAIN_RATIO + VAL_RATIO))],
            "fake": selected_fake[int(SAMPLES_PER_CLASS * TRAIN_RATIO):int(SAMPLES_PER_CLASS * (TRAIN_RATIO + VAL_RATIO))],
        },
        "testing": {
            "real": selected_real[int(SAMPLES_PER_CLASS * (TRAIN_RATIO + VAL_RATIO)):],
            "fake": selected_fake[int(SAMPLES_PER_CLASS * (TRAIN_RATIO + VAL_RATIO)):],
        }
    }
    
    tasks = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        for split_name, class_dict in splits.items():
            for label, file_list in class_dict.items():
                split_dest = BENCHMARK_DIR / split_name / label
                split_dest.mkdir(parents=True, exist_ok=True)
                for f in file_list:
                    tasks.append(executor.submit(download_single_file, f, split_dest))
        
        completed = 0
        total = len(tasks)
        for t in as_completed(tasks):
            t.result()
            completed += 1
            if completed % 30 == 0 or completed == total:
                print(f"Downloaded and verified {completed}/{total} audio files...")

    print(f"Dataset preparation complete:")
    print(f" - Training:   {len(splits['training']['real'])} Real, {len(splits['training']['fake'])} Fake")
    print(f" - Validation: {len(splits['validation']['real'])} Real, {len(splits['validation']['fake'])} Fake")
    print(f" - Testing:    {len(splits['testing']['real'])} Real, {len(splits['testing']['fake'])} Fake")


def extract_features_for_split(extractor: WavLMFeatureExtractor, split: str):
    X = []
    y = []
    file_paths = []
    
    split_dir = BENCHMARK_DIR / split
    cache_split_dir = CACHE_DIR / split
    cache_split_dir.mkdir(parents=True, exist_ok=True)
    
    items = []
    for label_name, label_val in [("real", 0), ("fake", 1)]:
        folder = split_dir / label_name
        for p in supported_audio_files(folder):
            items.append((p, label_val))
            
    print(f"\nExtracting WavLM features for [{split}] split ({len(items)} audio files)...")
    start_time = time.time()
    for idx, (audio_path, label) in enumerate(items, 1):
        emb, _, hit = cached_embedding(extractor, audio_path, cache_split_dir)
        X.append(emb)
        y.append(label)
        file_paths.append(str(audio_path))
        if idx % 25 == 0 or idx == len(items):
            elapsed = time.time() - start_time
            print(f" [{split}] Processed {idx}/{len(items)} items ({elapsed:.1f}s)")
            
    return np.vstack(X), np.asarray(y, dtype=np.int64), file_paths


def calculate_eer(y_true, y_scores):
    fpr, tpr, thresholds = roc_curve(y_true, y_scores)
    fnr = 1 - tpr
    eer_threshold_idx = np.nanargmin(np.absolute(fnr - fpr))
    eer = fpr[eer_threshold_idx]
    return float(eer), float(thresholds[eer_threshold_idx])


def main():
    start_overall = time.time()
    
    # 1. Download and organize dataset
    download_and_split_dataset()
    
    # 2. Extract features
    print(f"\n========================================================")
    print(f"STEP 2: Extracting WavLM Audio Embeddings (microsoft/wavlm-base)")
    print(f"========================================================")
    extractor = WavLMFeatureExtractor()
    
    X_train, y_train, _ = extract_features_for_split(extractor, "training")
    X_val, y_val, _ = extract_features_for_split(extractor, "validation")
    X_test, y_test, _ = extract_features_for_split(extractor, "testing")
    
    # 3. Train models
    print(f"\n========================================================")
    print(f"STEP 3: Training & Validating Classifiers")
    print(f"Feature Dimension: {X_train.shape[1]}")
    print(f"========================================================")
    
    models = {
        "logistic_regression": Pipeline([
            ("scaler", StandardScaler()),
            ("classifier", LogisticRegression(max_iter=3000, class_weight="balanced", random_state=42))
        ]),
        "calibrated_svm": Pipeline([
            ("scaler", StandardScaler()),
            ("classifier", CalibratedClassifierCV(
                estimator=LinearSVC(class_weight="balanced", random_state=42, max_iter=5000),
                cv=3
            ))
        ])
    }
    
    results = {}
    best_model_name = "logistic_regression"
    best_val_f1 = -1.0
    
    for name, model in models.items():
        model.fit(X_train, y_train)
        train_preds = model.predict(X_train)
        val_preds = model.predict(X_val)
        
        train_acc = accuracy_score(y_train, train_preds)
        val_acc = accuracy_score(y_val, val_preds)
        val_f1 = precision_recall_fscore_support(y_val, val_preds, average="macro")[2]
        
        print(f"Model [{name}]:")
        print(f"  Train Accuracy: {train_acc * 100:.2f}%")
        print(f"  Val   Accuracy: {val_acc * 100:.2f}% | Val Macro F1: {val_f1 * 100:.2f}%")
        
        results[name] = {
            "model": model,
            "train_acc": train_acc,
            "val_acc": val_acc,
            "val_f1": val_f1
        }
        
        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            best_model_name = name
            
    selected_pipeline = results[best_model_name]["model"]
    print(f"\nSelected Best Classifier: {best_model_name} (Val Macro F1: {best_val_f1 * 100:.2f}%)")
    
    # 4. Comprehensive Evaluation on Test Set
    print(f"\n========================================================")
    print(f"STEP 4: Testing & Calculating Complete Accuracy Metrics")
    print(f"========================================================")
    
    # Probabilities
    classes = list(selected_pipeline.named_steps["classifier"].classes_)
    fake_idx = classes.index(1)
    
    train_probs = selected_pipeline.predict_proba(X_train)[:, fake_idx]
    val_probs = selected_pipeline.predict_proba(X_val)[:, fake_idx]
    test_probs = selected_pipeline.predict_proba(X_test)[:, fake_idx]
    
    train_preds = (train_probs >= 0.5).astype(int)
    val_preds = (val_probs >= 0.5).astype(int)
    test_preds = (test_probs >= 0.5).astype(int)
    
    # Metrics
    train_acc = accuracy_score(y_train, train_preds)
    val_acc = accuracy_score(y_val, val_preds)
    test_acc = accuracy_score(y_test, test_preds)
    test_balanced_acc = balanced_accuracy_score(y_test, test_preds)
    
    # Precision, Recall, F1 for Test
    p_real, r_real, f1_real, _ = precision_recall_fscore_support(y_test, test_preds, pos_label=0, average="binary")
    p_fake, r_fake, f1_fake, _ = precision_recall_fscore_support(y_test, test_preds, pos_label=1, average="binary")
    macro_f1 = precision_recall_fscore_support(y_test, test_preds, average="macro")[2]
    weighted_f1 = precision_recall_fscore_support(y_test, test_preds, average="weighted")[2]
    
    # Confusion Matrix
    cm = confusion_matrix(y_test, test_preds, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()
    
    # ROC AUC & EER
    roc_auc = roc_auc_score(y_test, test_probs)
    eer, eer_threshold = calculate_eer(y_test, test_probs)
    test_log_loss = log_loss(y_test, test_probs)
    
    # Save Model
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_save_path = MODEL_DIR / "classifier.joblib"
    joblib.dump(selected_pipeline, model_save_path)
    
    metadata = {
        "dataset_name": DATASET_REPO,
        "selected_classifier": best_model_name,
        "sample_counts": {
            "training_real": int((y_train == 0).sum()),
            "training_fake": int((y_train == 1).sum()),
            "validation_real": int((y_val == 0).sum()),
            "validation_fake": int((y_val == 1).sum()),
            "testing_real": int(tn + fp),
            "testing_fake": int(fn + tp),
            "total_samples": len(y_train) + len(y_val) + len(y_test)
        },
        "accuracy_scores": {
            "train_accuracy": round(float(train_acc), 4),
            "validation_accuracy": round(float(val_acc), 4),
            "test_accuracy": round(float(test_acc), 4),
            "test_balanced_accuracy": round(float(test_balanced_acc), 4),
            "test_roc_auc": round(float(roc_auc), 4),
            "test_equal_error_rate_eer": round(float(eer), 4),
            "test_log_loss": round(float(test_log_loss), 4),
            "macro_f1": round(float(macro_f1), 4),
            "weighted_f1": round(float(weighted_f1), 4),
            "real_class": {
                "precision": round(float(p_real), 4),
                "recall": round(float(r_real), 4),
                "f1_score": round(float(f1_real), 4)
            },
            "fake_class": {
                "precision": round(float(p_fake), 4),
                "recall": round(float(r_fake), 4),
                "f1_score": round(float(f1_fake), 4)
            }
        },
        "confusion_matrix": {
            "true_real_tn": int(tn),
            "false_fake_fp": int(fp),
            "false_real_fn": int(fn),
            "true_fake_tp": int(tp)
        },
        "feature_extractor": "microsoft/wavlm-base",
        "feature_dim": int(X_train.shape[1]),
        "total_elapsed_seconds": round(time.time() - start_overall, 2)
    }
    
    meta_path = MODEL_DIR / "metadata.json"
    with meta_path.open("w") as f:
        json.dump(metadata, f, indent=2)
        
    print("\n" + "=" * 60)
    print("                MODEL PERFORMANCE REPORT                ")
    print("=" * 60)
    print(f"Dataset:                    {DATASET_REPO}")
    print(f"Feature Extractor:          microsoft/wavlm-base (6,144-d)")
    print(f"Selected Classifier:        {best_model_name}")
    print("-" * 60)
    print(f"TRAIN ACCURACY:             {train_acc * 100:.2f}%")
    print(f"VALIDATION ACCURACY:        {val_acc * 100:.2f}%")
    print(f"TEST ACCURACY:              {test_acc * 100:.2f}%")
    print(f"TEST BALANCED ACCURACY:     {test_balanced_acc * 100:.2f}%")
    print(f"TEST MACRO F1 SCORE:        {macro_f1 * 100:.2f}%")
    print(f"TEST ROC-AUC SCORE:         {roc_auc * 100:.2f}%")
    print(f"EQUAL ERROR RATE (EER):     {eer * 100:.2f}% (Threshold: {eer_threshold:.4f})")
    print("-" * 60)
    print("DETAILED PER-CLASS METRICS (TEST SET):")
    print(f"  REAL Audio  -> Precision: {p_real * 100:.2f}% | Recall: {r_real * 100:.2f}% | F1: {f1_real * 100:.2f}%")
    print(f"  FAKE Audio  -> Precision: {p_fake * 100:.2f}% | Recall: {r_fake * 100:.2f}% | F1: {f1_fake * 100:.2f}%")
    print("-" * 60)
    print("CONFUSION MATRIX (TEST SET):")
    print(f"  True Real  (Correct Human):     {tn} / {tn + fp}")
    print(f"  False Fake (Human marked Fake): {fp} / {tn + fp}")
    print(f"  False Real (Fake marked Human): {fn} / {fn + tp}")
    print(f"  True Fake  (Correct Deepfake):  {tp} / {fn + tp}")
    print("=" * 60)
    print(f"Artifacts saved to: {MODEL_DIR}")
    print(f"Total pipeline execution time: {time.time() - start_overall:.2f} seconds\n")

if __name__ == "__main__":
    main()
