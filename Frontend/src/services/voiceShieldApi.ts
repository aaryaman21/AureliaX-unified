import type { Analysis, DiarizationSegment, SpeakerAnalysis } from '../types';

export interface ApiBackendMeta {
  model: string;
  analysisType: string;
  durationSeconds: number;
  totalChunksAnalyzed: number;
  highRiskChunkCount: number;
  suspiciousChunkCount: number;
}

export interface AnalyzeApiResponse {
  success: boolean;
  analysis: Analysis;
  backend: ApiBackendMeta;
  detectedSpeakers?: number;
  speakers?: SpeakerAnalysis[];
  diarizationSegments?: DiarizationSegment[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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
