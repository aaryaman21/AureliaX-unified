import type { Analysis, DiarizationSegment, SpeakerAnalysis } from '../types';

export interface ApiBackendMeta {
  model: string;
  analysisType: string;
  durationSeconds: number;
  totalChunksAnalyzed: number;
  highRiskChunkCount: number;
  suspiciousChunkCount: number;
  audioUrl?: string;
  logId?: string;
  fileName?: string;
}

export interface AnalyzeApiResponse {
  success: boolean;
  analysis: Analysis;
  backend: ApiBackendMeta;
  detectedSpeakers?: number;
  speakers?: SpeakerAnalysis[];
  diarizationSegments?: DiarizationSegment[];
  audioUrl?: string;
  logId?: string;
}

export interface SavedAudioLog {
  id: string;
  filename: string;
  timestamp: string;
  duration: number;
  size_bytes: number;
  audio_url: string;
  risk_score: number;
  risk_level: string;
  detected_language: string;
  synthetic_probability: number;
  analysis_result?: AnalyzeApiResponse;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Fetch all stored audio logs from the backend.
 */
export async function fetchAudioLogs(): Promise<SavedAudioLog[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/audio-logs`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

/**
 * Re-run VoiceShield detection on a stored audio log using the active model.
 */
export async function retestAudioLog(logId: string): Promise<AnalyzeApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/audio-logs/${logId}/retest`, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    let msg = `Retest failed (${response.status})`;
    try {
      const d = await response.json();
      if (d.detail) msg = d.detail;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

/**
 * Delete a stored audio log from the backend.
 */
export async function deleteAudioLog(logId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/audio-logs/${logId}`, {
    method: 'DELETE',
  });
}

/**
 * Download a saved audio file as a File object so it can be re-run in the UI.
 */
export async function fetchAudioAsFile(audioUrl: string, filename: string): Promise<File> {
  const fullUrl = audioUrl.startsWith('http') ? audioUrl : `${API_BASE_URL}${audioUrl}`;
  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`Failed to load audio from ${audioUrl}`);
  }
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'audio/wav' });
}

/**
 * Health check endpoint to verify backend connectivity.
 */
export async function checkHealth(): Promise<{ status: string; service: string }> {
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`);
  }

  return response.json();
}

/**
 * Sends real uploaded audio file to VoiceShield FastAPI backend for ML deepfake classification (Single-Speaker).
 */
export async function analyzeAudioFile(file: File): Promise<AnalyzeApiResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = `Server error (${response.status})`;
    try {
      const errData = await response.json();
      if (errData.detail) {
        errorMessage = typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Sends real call recording to VoiceShield FastAPI backend for multi-speaker diarization + per-speaker deepfake classification.
 */
export async function analyzeMultispeakerAudioFile(file: File): Promise<AnalyzeApiResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/analyze/multispeaker`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = `Server error (${response.status})`;
    try {
      const errData = await response.json();
      if (errData.detail) {
        errorMessage = typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
