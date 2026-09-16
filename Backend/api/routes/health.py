from pathlib import Path

from fastapi import APIRouter
from api.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok", service="VoiceShield AI")


@router.get("/capabilities")
async def capabilities():
    backend_dir = Path(__file__).resolve().parents[2]
    regional_report = backend_dir / "dataset" / "fleurs_report.json"
    regional_model = backend_dir / "models" / "regional" / "voiceshield_regularized_candidate"
    two_speaker_model = backend_dir / "models" / "two_speaker" / "voiceshield_wavlm"
    runtime_model = backend_dir / "models" / "voiceshield_wavlm"

    return {
        "single_speaker": {
            "available": (runtime_model / "classifier.joblib").exists(),
            "model_path": str(runtime_model),
        },
        "two_speaker": {
            "available": (two_speaker_model / "classifier.joblib").exists(),
            "model_path": str(two_speaker_model),
            "requires_huggingface_token": True,
        },
        "regional_data": {
            "available": regional_report.exists(),
            "trained": False,
            "report_path": str(regional_report),
            "model_path": str(regional_model),
            "note": "FLEURS contains human speech only and cannot train a real/fake classifier by itself.",
        },
    }
