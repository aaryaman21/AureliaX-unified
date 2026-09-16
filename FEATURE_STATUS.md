# Feature status

## Functional

- Single-speaker uploaded-file inference through `POST /api/analyze`.
- Chunked temporal analysis and risk aggregation.
- Dedicated two-speaker classifier through `POST /api/analyze/multispeaker`.
- Speaker diarization when the Hugging Face gated pyannote model is available.
- Chunk-analysis fallback when diarization is unavailable.
- PCM16 WebSocket inference through `/api/ws/analyze`.
- Health and capability reporting through `/api/health` and `/api/capabilities`.
- Regional dataset preparation, integrity, manifest, and training/evaluation scripts are included.

## Left inactive or limited

- The frontend `Microphone` source button does not capture microphone audio; it only analyzes a selected file when one is already present, otherwise it falls back to a demo scenario.
- The frontend `Live Presets`/`API` source uses local mock scenarios rather than a backend API call.
- The frontend preset selector and generated transcript are demo data, not model-generated transcription or language detection.
- The frontend WebSocket live-analysis route is present in the backend but is not connected to a browser microphone stream by the unchanged frontend.
- Emotion, prosody, pause, language, speaker similarity, and transcript values in the upload response are adapter-derived estimates/defaults; the current classifier does not directly produce those modalities.
- Two-speaker diarization is externally gated by Hugging Face access, `HF_TOKEN`, and the downloaded pyannote model. The endpoint remains functional through fallback chunk analysis without it.
- The regional FLEURS collection is human-only. No regional real/fake classifier was trained from it, and `/api/capabilities` reports `regional_data.trained: false`.
- Contacts, analytics, records, settings, notifications, and command-palette interactions remain frontend-local state/demo behavior unless separately backed by a persistence or identity service.
