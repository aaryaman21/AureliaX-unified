import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure the backend src directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
src_dir = backend_dir / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from voiceshield_inference import VoiceShieldModel, get_runtime_model_dir
from api.routes import health, analysis, audio_logs

_model_instance = None
_multispeaker_model_instance = None
_model_lock = threading.Lock()


def get_shared_model() -> VoiceShieldModel:
    global _model_instance
    if _model_instance is None:
        with _model_lock:
            if _model_instance is None:
                model_dir = get_runtime_model_dir()
                print(f"[VoiceShield API] Loading unified robust model instance from: {model_dir}")
                _model_instance = VoiceShieldModel(model_dir=model_dir)
                print("[VoiceShield API] VoiceShield Unified WavLM Model successfully loaded into memory!")
    return _model_instance


def get_multispeaker_model() -> VoiceShieldModel:
    # Speaker turns and solo chunks use the same evaluated classifier.
    return get_shared_model()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[VoiceShield API] Server starting up. Pre-warming VoiceShield model...")
    # Pre-warm model in background thread so server starts instantly
    threading.Thread(target=get_shared_model, daemon=True).start()
    yield
    print("[VoiceShield API] Server shutting down.")


app = FastAPI(
    title="VoiceShield AI Inference API",
    description="Backend web API connecting React frontend to VoiceShield AI deepfake audio detection model.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for local development and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers under /api
app.include_router(health.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(audio_logs.router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
