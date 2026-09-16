import os
import subprocess
import tempfile
from pathlib import Path
from fastapi import APIRouter, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from api.adapter import format_ml_result_to_analysis
from api.schemas import AnalyzeResultWrapper

# Import existing backend detectors
from live_chunk_detector import analyze_audio_file, split_into_chunks, risk_level_from_fake_score, aggregate_chunk_results
from audio_preprocessing import load_audio, TARGET_SAMPLE_RATE, _get_ffmpeg_executable
from multispeaker_detector import analyze_multispeaker_call
import numpy as np

router = APIRouter(tags=["Analysis"])

SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".flac", ".m4a", ".ogg", ".aac", ".webm", ".mp4", ".mov", ".mkv", ".m4v"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}


async def _save_upload(file: UploadFile) -> Path:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded or file has no filename.")

    suffix = Path(file.filename).suffix.lower() or ".wav"
    raw_temp_path = Path(tempfile.gettempdir()) / f"voiceshield_upload_{os.urandom(8).hex()}{suffix}"
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")
    raw_temp_path.write_bytes(contents)

    # If the upload is a video container, immediately demux the audio track to 16kHz PCM WAV
    if suffix in VIDEO_EXTENSIONS:
        wav_temp_path = Path(tempfile.gettempdir()) / f"voiceshield_audio_{os.urandom(8).hex()}.wav"
        try:
            ffmpeg_bin = _get_ffmpeg_executable()
            cmd = [
                ffmpeg_bin, "-y", "-i", str(raw_temp_path),
                "-vn", "-acodec", "pcm_s16le", "-ar", str(TARGET_SAMPLE_RATE), "-ac", "1",
                str(wav_temp_path)
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
            if res.returncode != 0 or not wav_temp_path.exists() or wav_temp_path.stat().st_size == 0:
                err_msg = res.stderr.decode("utf-8", errors="ignore") if res.stderr else "Unknown error"
                if "does not contain any stream" in err_msg or "Output file is empty" in err_msg:
                    raise HTTPException(status_code=400, detail=f"The video file '{file.filename}' contains no audio track.")
                raise HTTPException(status_code=400, detail=f"Failed to extract audio track from '{file.filename}': {err_msg[:200]}")
            return wav_temp_path
        finally:
            if raw_temp_path.exists():
                try:
                    raw_temp_path.unlink()
                except OSError:
                    pass

    return raw_temp_path


@router.post("/analyze", response_model=AnalyzeResultWrapper)
async def analyze_audio(request: Request, file: UploadFile = File(...)):
    temp_path = await _save_upload(file)

    try:
        # Retrieve shared model instance (pre-loaded on server startup)
        from api.main import get_shared_model
        model = get_shared_model()

        # Run chunked analysis using backend ML code
        try:
            if model is not None:
                audio = load_audio(temp_path)
                if not audio.valid:
                    raise ValueError(audio.warning or "Audio file could not be parsed or is invalid.")

                raw_chunks, messages = split_into_chunks(audio.samples, audio.sample_rate)
                if not raw_chunks:
                    raise ValueError('At least 0.75 seconds of usable audio is required')
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
                    analyzed_chunks.append(
                        {
                            "start": float(chunk["start"]),
                            "end": float(chunk["end"]),
                            "real_score": float(res["real_score"]),
                            "fake_score": float(res["fake_score"]),
                            "risk_score": float(res["risk_score"]),
                            "risk_level": r_level,
                            "binary_prediction": res["binary_prediction"],
                            "model_verdict": res["verdict"],
                        }
                    )

                thresholds = model.metadata["decision_thresholds"]
                summary = aggregate_chunk_results(analyzed_chunks, thresholds)

                raw_result = {
                    "audio_path": str(temp_path),
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
            else:
                raw_result = analyze_audio_file(temp_path)

        except ValueError as val_err:
            raise HTTPException(status_code=400, detail=f"Audio analysis failed: {str(val_err)}")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Internal inference error during audio processing: {str(exc)}")

        # Convert raw ML output to frontend data contract
        response_data = format_ml_result_to_analysis(raw_result)

        # Persist test audio log for future re-testing and playback
        try:
            from api.routes.audio_logs import save_audio_log
            duration = float(response_data.get("backend", {}).get("durationSeconds", 0.0))
            log_meta = save_audio_log(temp_path, file.filename or "uploaded_audio.wav", response_data, duration)
            response_data["audioUrl"] = log_meta["audio_url"]
            response_data["logId"] = log_meta["id"]
            if "backend" in response_data:
                response_data["backend"]["audioUrl"] = log_meta["audio_url"]
                response_data["backend"]["logId"] = log_meta["id"]
                response_data["backend"]["fileName"] = file.filename or "uploaded_audio.wav"
        except Exception as save_err:
            print(f"[AudioLogs] Warning: Failed to save audio log: {save_err}")

        return response_data

    finally:
        # Clean up temporary file safely
        if temp_path.exists():
            try:
                os.remove(temp_path)
            except OSError:
                pass


@router.post("/analyze/multispeaker", response_model=AnalyzeResultWrapper)
async def analyze_multispeaker_audio(file: UploadFile = File(...)):
    """Run speaker diarization plus per-speaker VoiceShield deepfake analysis.

    Separates individual callers to eliminate conversational turn-taking false positives.
    """
    temp_path = await _save_upload(file)
    try:
        from api.main import get_multispeaker_model

        raw_result = analyze_multispeaker_call(temp_path, model=get_multispeaker_model())
        response_data = format_ml_result_to_analysis(raw_result)

        try:
            from api.routes.audio_logs import save_audio_log
            duration = float(response_data.get("backend", {}).get("durationSeconds", 0.0))
            log_meta = save_audio_log(temp_path, file.filename or "multispeaker_audio.wav", response_data, duration)
            response_data["audioUrl"] = log_meta["audio_url"]
            response_data["logId"] = log_meta["id"]
            if "backend" in response_data:
                response_data["backend"]["audioUrl"] = log_meta["audio_url"]
                response_data["backend"]["logId"] = log_meta["id"]
                response_data["backend"]["fileName"] = file.filename or "multispeaker_audio.wav"
        except Exception as save_err:
            print(f"[AudioLogs] Warning: Failed to save multispeaker audio log: {save_err}")

        return response_data
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Audio analysis failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Multispeaker analysis failed: {exc}") from exc
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


@router.websocket("/ws/analyze")
async def websocket_live_analyze(websocket: WebSocket):
    await websocket.accept()
    from api.main import get_shared_model
    model = get_shared_model()

    try:
        while True:
            data = await websocket.receive_bytes()
            if not data or len(data) < 1600:
                continue

            samples = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0

            if model is not None and len(samples) > 8000:
                res = model.predict_samples(samples, TARGET_SAMPLE_RATE)
                fake_score = float(res.get("fake_score", 0.0))
                verdict = res.get("verdict", "REAL")

                await websocket.send_json({
                    "syntheticProbability": round(fake_score * 100.0, 1),
                    "riskLevel": verdict,
                    "samplesProcessed": len(samples)
                })
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close()
