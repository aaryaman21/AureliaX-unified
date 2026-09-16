import json
from pathlib import Path
from typing import Dict, Optional

import joblib
import numpy as np

from wavlm_features import MODEL_ID, WavLMFeatureExtractor, cached_embedding


MODEL_ROOT = Path(__file__).resolve().parents[1] / 'models'
MODEL_DIR = MODEL_ROOT / 'voiceshield_wavlm'
CLASSIFIER_PATH = MODEL_DIR / "classifier.joblib"
METADATA_PATH = MODEL_DIR / "metadata.json"


def get_runtime_model_dir() -> Path:
    selection = MODEL_ROOT / 'active_model.json'
    if not selection.exists():
        return MODEL_DIR
    name = json.loads(selection.read_text(encoding='utf-8'))['model_directory']
    path = (MODEL_ROOT / name).resolve()
    if not path.is_relative_to(MODEL_ROOT.resolve()) or not (path / 'classifier.joblib').is_file():
        raise ValueError('Invalid active model selection')
    return path


def load_metadata(model_dir: str | Path = MODEL_DIR) -> Dict[str, object]:
    metadata_path = Path(model_dir) / "metadata.json"
    if metadata_path.exists():
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    return {
        "label_mapping": {"REAL": 0, "FAKE": 1},
        "decision_thresholds": {
            "real_if_fake_score_at_or_below": 0.40,
            "fake_if_fake_score_at_or_above": 0.60,
            "suspicious_between_thresholds": True,
        },
        "warning": "metadata.json not found; using fallback thresholds",
    }


class VoiceShieldModel:
    def __init__(self, model_dir: str | Path | None = None, extractor: Optional[WavLMFeatureExtractor] = None) -> None:
        self.model_dir = Path(model_dir) if model_dir is not None else get_runtime_model_dir()
        self.classifier = joblib.load(self.model_dir / "classifier.joblib")
        self.metadata = load_metadata(self.model_dir)
        self.extractor = extractor or WavLMFeatureExtractor(model_id=MODEL_ID)

    def predict_file(self, audio_path: str | Path, cache_dir: Optional[str | Path] = None) -> Dict[str, object]:
        if cache_dir is None:
            embedding, audio_info = self.extractor.extract_from_path(audio_path)
        else:
            embedding, metadata, _ = cached_embedding(self.extractor, audio_path, cache_dir)
            audio_info = metadata["audio_info"]
        embedding = embedding.reshape(1, -1)
        temp = float(self.metadata.get("temperature", 1.0))
        logit_bias = float(self.metadata.get("logit_bias", 0.0))
        if (temp != 1.0 or logit_bias != 0.0) and hasattr(self.classifier, "decision_function"):
            raw_logit = float(self.classifier.decision_function(embedding)[0])
            scaled_logit = (raw_logit + logit_bias) / temp
            fake_score = float(1.0 / (1.0 + np.exp(-scaled_logit)))
            real_score = float(1.0 - fake_score)
        else:
            probabilities = self.classifier.predict_proba(embedding)[0]
            classes = list(self.classifier.named_steps["classifier"].classes_)
            probability_map = dict(zip(classes, probabilities))
            real_score = float(probability_map[0])
            fake_score = float(probability_map[1])

        thresholds = self.metadata["decision_thresholds"]
        real_threshold = float(thresholds["real_if_fake_score_at_or_below"])
        fake_threshold = float(thresholds["fake_if_fake_score_at_or_above"])

        if fake_score >= fake_threshold:
            verdict = "FAKE"
            confidence = fake_score
            binary_prediction = 1
        elif fake_score <= real_threshold:
            verdict = "REAL"
            confidence = real_score
            binary_prediction = 0
        else:
            verdict = "SUSPICIOUS"
            confidence = max(real_score, fake_score)
            binary_prediction = 1 if fake_score >= 0.5 else 0

        return {
            "audio_path": str(audio_path),
            "verdict": verdict,
            "binary_prediction": "FAKE" if binary_prediction == 1 else "REAL",
            "binary_label": binary_prediction,
            "real_score": real_score,
            "fake_score": fake_score,
            "risk_score": fake_score,
            "confidence": confidence,
            "thresholds": thresholds,
            "audio_info": audio_info,
        }

    def predict_samples(self, samples: np.ndarray, sample_rate: int, audio_info: Optional[Dict[str, object]] = None) -> Dict[str, object]:
        embedding = self.extractor.extract_from_samples(samples, sample_rate).reshape(1, -1)
        temp = float(self.metadata.get("temperature", 1.0))
        logit_bias = float(self.metadata.get("logit_bias", 0.0))
        if (temp != 1.0 or logit_bias != 0.0) and hasattr(self.classifier, "decision_function"):
            raw_logit = float(self.classifier.decision_function(embedding)[0])
            scaled_logit = (raw_logit + logit_bias) / temp
            fake_score = float(1.0 / (1.0 + np.exp(-scaled_logit)))
            real_score = float(1.0 - fake_score)
        else:
            probabilities = self.classifier.predict_proba(embedding)[0]
            classes = list(self.classifier.named_steps["classifier"].classes_)
            probability_map = dict(zip(classes, probabilities))
            real_score = float(probability_map[0])
            fake_score = float(probability_map[1])

        thresholds = self.metadata["decision_thresholds"]
        real_threshold = float(thresholds["real_if_fake_score_at_or_below"])
        fake_threshold = float(thresholds["fake_if_fake_score_at_or_above"])

        if fake_score >= fake_threshold:
            verdict = "FAKE"
            confidence = fake_score
            binary_prediction = 1
        elif fake_score <= real_threshold:
            verdict = "REAL"
            confidence = real_score
            binary_prediction = 0
        else:
            verdict = "SUSPICIOUS"
            confidence = max(real_score, fake_score)
            binary_prediction = 1 if fake_score >= 0.5 else 0

        return {
            "verdict": verdict,
            "binary_prediction": "FAKE" if binary_prediction == 1 else "REAL",
            "binary_label": binary_prediction,
            "real_score": real_score,
            "fake_score": fake_score,
            "risk_score": fake_score,
            "confidence": confidence,
            "thresholds": thresholds,
            "audio_info": audio_info or {},
        }
