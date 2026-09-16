import json
import os
import shutil
import time
from pathlib import Path
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from api.schemas import AnalyzeResultWrapper

router = APIRouter(prefix="/audio-logs", tags=["Audio Logs"])

BACKEND_DIR = Path(__file__).resolve().parents[2]
STORAGE_DIR = BACKEND_DIR / "storage" / "audio_logs"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def get_log_file_path(log_id: str) -> Optional[Path]:
    for p in STORAGE_DIR.glob(f"{log_id}.*"):
        if p.suffix != ".json":
            return p
    return None


def get_meta_file_path(log_id: str) -> Path:
    return STORAGE_DIR / f"{log_id}.json"


def save_audio_log(
    temp_audio_path: Path,
    filename: str,
    analysis_result: dict,
    audio_duration: float = 0.0,
) -> dict:
    """Save an audio file and its analysis result in the persistent storage."""
    log_id = f"log_{int(time.time() * 1000)}_{os.urandom(4).hex()}"
    suffix = Path(filename).suffix.lower() or ".wav"
    dest_audio = STORAGE_DIR / f"{log_id}{suffix}"

    shutil.copy2(temp_audio_path, dest_audio)

    meta = {
        "id": log_id,
        "filename": filename,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "duration": round(audio_duration, 2),
        "size_bytes": dest_audio.stat().st_size,
        "audio_url": f"/api/audio-logs/{log_id}/audio",
        "risk_score": analysis_result.get("analysis", {}).get("overallRiskScore", 0),
        "risk_level": analysis_result.get("analysis", {}).get("riskLevel", "SAFE"),
        "detected_language": analysis_result.get("analysis", {}).get("detectedLanguage", "Unknown"),
        "synthetic_probability": analysis_result.get("analysis", {}).get("syntheticProbability", 0),
        "analysis_result": analysis_result,
    }

    meta_file = get_meta_file_path(log_id)
    meta_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


@router.get("", response_model=List[dict])
async def list_audio_logs():
    """List all stored audio test logs sorted from newest to oldest."""
    logs = []
    for meta_file in sorted(STORAGE_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(meta_file.read_text(encoding="utf-8"))
            audio_path = get_log_file_path(data.get("id", ""))
            if audio_path and audio_path.exists():
                logs.append(data)
        except Exception:
            continue
    return logs


@router.get("/{log_id}/audio")
async def stream_audio_log(log_id: str):
    """Serve the stored audio file for browser playback and re-testing."""
    audio_path = get_log_file_path(log_id)
    if not audio_path or not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found.")

    suffix = audio_path.suffix.lower()
    media_types = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".webm": "audio/webm",
    }
    media_type = media_types.get(suffix, "application/octet-stream")
    return FileResponse(
        path=str(audio_path),
        media_type=media_type,
        filename=f"{log_id}{suffix}",
    )


@router.post("/{log_id}/retest", response_model=AnalyzeResultWrapper)
async def retest_audio_log(log_id: str):
    """Re-run VoiceShield detection on a stored audio log using the active model."""
    audio_path = get_log_file_path(log_id)
    meta_file = get_meta_file_path(log_id)
    if not audio_path or not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found for re-testing.")

    from api.main import get_shared_model
    from api.adapter import format_ml_result_to_analysis
    from audio_preprocessing import load_audio
    from live_chunk_detector import split_into_chunks, risk_level_from_fake_score, aggregate_chunk_results

    model = get_shared_model()
    if model is None:
        raise HTTPException(status_code=500, detail="VoiceShield model is not initialized.")

    try:
        audio = load_audio(audio_path)
        if not audio.valid:
            raise ValueError(audio.warning or "Audio file invalid.")

        raw_chunks, messages = split_into_chunks(audio.samples, audio.sample_rate)
        if not raw_chunks:
            raise ValueError("At least 0.75 seconds of usable audio required.")

        analyzed_chunks = []
        for chunk in raw_chunks:
            samples = chunk["samples"]
            res = model.predict_samples(
                samples,
                audio.sample_rate,
                audio_info={
                    "duration_seconds": len(samples) / audio.sample_rate,
                    "start": chunk["start"],
                    "end": chunk["end"],
                },
            )
            r_level = risk_level_from_fake_score(res["fake_score"], res["thresholds"])
            analyzed_chunks.append({
                "start": float(chunk["start"]),
                "end": float(chunk["end"]),
                "real_score": float(res["real_score"]),
                "fake_score": float(res["fake_score"]),
                "risk_score": float(res["risk_score"]),
                "risk_level": r_level,
                "binary_prediction": res["binary_prediction"],
                "model_verdict": res["verdict"],
            })

        thresholds = model.metadata["decision_thresholds"]
        summary = aggregate_chunk_results(analyzed_chunks, thresholds)

        raw_result = {
            "audio_path": str(audio_path),
            "total_duration": audio.duration_seconds,
            "sample_rate": audio.sample_rate,
            "thresholds": thresholds,
            "messages": messages,
            "overall_risk_score": summary["overall_risk_score"],
            "risk_level": summary["risk_level"],
            "average_fake_score": summary["average_fake_score"],
            "maximum_fake_score": summary["maximum_fake_score"],
            "suspicious_chunks": summary["suspicious_chunks"],
            "high_risk_chunks": summary["high_risk_chunks"],
            "suspicious_chunk_percent": summary["suspicious_chunk_percent"],
            "high_risk_chunk_percent": summary["high_risk_chunk_percent"],
            "chunks": analyzed_chunks,
        }

        updated_result = format_ml_result_to_analysis(raw_result)

        # Update metadata file
        if meta_file.exists():
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
                meta["timestamp"] = time.strftime("%Y-%m-%d %H:%M:%S")
                meta["risk_score"] = updated_result.get("analysis", {}).get("overallRiskScore", 0)
                meta["risk_level"] = updated_result.get("analysis", {}).get("riskLevel", "SAFE")
                meta["synthetic_probability"] = updated_result.get("analysis", {}).get("syntheticProbability", 0)
                meta["analysis_result"] = updated_result
                meta_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")
            except Exception:
                pass

        return updated_result

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retest failed: {str(exc)}")


@router.delete("/{log_id}")
async def delete_audio_log(log_id: str):
    """Delete a stored audio test log."""
    audio_path = get_log_file_path(log_id)
    meta_file = get_meta_file_path(log_id)

    deleted = False
    if audio_path and audio_path.exists():
        audio_path.unlink()
        deleted = True
    if meta_file.exists():
        meta_file.unlink()
        deleted = True

    if not deleted:
        raise HTTPException(status_code=404, detail="Audio log not found.")
    return {"status": "success", "message": f"Audio log {log_id} deleted."}
