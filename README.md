# AureliaX Unified

This folder combines the existing AureliaX frontend with the integrated VoiceShield backend and the regional and two-speaker model assets.

## Layout

- `Frontend/`: the existing AureliaX2.0 React/Vite frontend. It was copied without source changes.
- `Backend/`: FastAPI API, inference code, training/evaluation scripts, datasets, and model artifacts.
- `Backend/models/voiceshield_wavlm/`: single-speaker runtime classifier used by `/api/analyze`.
- `Backend/models/two_speaker/voiceshield_wavlm/`: dedicated classifier used by `/api/analyze/multispeaker`.
- `Backend/models/regional/`: regional/AureliaX model artifacts and research models.
- `Backend/dataset/`: the FLEURS regional dataset and manifests.

## Run the backend

From this directory:

```powershell
cd Backend
python -m pip install -r requirements.txt
python api\main.py
```

The API runs at `http://localhost:8000`.

Useful endpoints:

- `GET /api/health`
- `GET /api/capabilities`
- `POST /api/analyze` with multipart field `file`
- `POST /api/analyze/multispeaker` with multipart field `file`
- WebSocket `/api/ws/analyze` for PCM16 live chunks

Two-speaker diarization requires a Hugging Face token and access to `pyannote/speaker-diarization-3.1`:

```powershell
$env:HF_TOKEN = "your_token"
```

Without that token, the multispeaker endpoint uses the detector's documented chunk-analysis fallback.

## Run the frontend

In a second terminal from this directory:

```powershell
cd Frontend
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

For the real backend upload workflow, set `Frontend/.env.local` before starting Vite if needed:

```text
VITE_API_BASE_URL=http://localhost:8000
```

## Tests and checks

```powershell
cd Backend
python -m unittest discover -s src -p "test_*.py"

cd ..\Frontend
npm run build
npm run lint
```

## Important model/data status

The FLEURS report contains 14,000 human regional recordings split 700/150/150 per language. It is a human-only dataset, so it is not by itself a real/fake training set. The merged report records `training_performed: false`; the unified API reports regional training as unavailable until an explicitly labeled fake/synthetic counterpart is trained and evaluated.

See `FEATURE_STATUS.md` for the remaining inactive or externally gated frontend features.
