// ============================================================
// AureliaX — Shared Type Definitions
// ============================================================
// These interfaces define the data contract between the UI
// and the service layer. Mock implementations and future
// REST/WebSocket responses must conform to these types.
// ============================================================

// --- Supported Languages ---
export type SupportedLanguage =
  | 'Hindi'
  | 'Punjabi'
  | 'Gujarati'
  | 'Kannada'
  | 'Tamil'
  | 'Telugu'
  | 'English'
  | 'German'
  | 'Japanese';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  'Hindi', 'Punjabi', 'Gujarati', 'Kannada', 'Tamil', 'Telugu',
  'English', 'German', 'Japanese',
];

export const INDIAN_LANGUAGES: SupportedLanguage[] = [
  'Hindi', 'Punjabi', 'Gujarati', 'Kannada', 'Tamil', 'Telugu',
];

export const OTHER_LANGUAGES: SupportedLanguage[] = [
  'English', 'German', 'Japanese',
];

// --- Risk Levels ---
export type RiskLevel = 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK';

export const RISK_THRESHOLDS = {
  SAFE: { min: 0, max: 30 },
  SUSPICIOUS: { min: 31, max: 70 },
  HIGH_RISK: { min: 71, max: 100 },
} as const;

export function getRiskLevel(score: number): RiskLevel {
  if (score <= 30) return 'SAFE';
  if (score <= 70) return 'SUSPICIOUS';
  return 'HIGH_RISK';
}

export function getRiskLabel(level: RiskLevel): string {
  switch (level) {
    case 'SAFE': return 'Safe';
    case 'SUSPICIOUS': return 'Suspicious';
    case 'HIGH_RISK': return 'High Risk';
  }
}

// --- Anomaly Levels ---
export type AnomalyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

// --- Emotion Labels ---
export type EmotionLabel =
  | 'Neutral' | 'Calm' | 'Happy' | 'Angry'
  | 'Fearful' | 'Stressed' | 'Uncertain';

// --- Recommendation Actions ---
export type RecommendationAction = 'CONTINUE' | 'VERIFY_CALLER' | 'END_CALL';

// --- Audio Source Types ---
export type AudioSourceType = 'MICROPHONE' | 'UPLOAD' | 'API';

// --- Analysis Stage ---
export interface AnalysisStage {
  id: string;
  label: string;
  description: string;
  durationMs: number;
}

// --- Core Analysis Object ---
// TODO: This interface maps to the ML inference backend response.
// Replace mock implementations in analysisService.ts with
// actual API/WebSocket responses that conform to this type.
export interface Analysis {
  metricsSource?: 'classifier_only' | 'demo';
  id: string;
  callId: string;
  timestamp: string;
  syntheticProbability: number;        // 0–100: probability of AI/synthetic origin
  speakerSimilarity: number;           // 0–100: similarity to trusted voice profile
  emotion: EmotionLabel;
  emotionalConsistency: number;        // 0–100: consistency of emotion across call
  prosodyScore: number;                // 0–100 (higher = more natural prosody)
  pitchVariation: number;              // 0–100
  speakingRate: number;                // 0–100 (relative to expected)
  vocalEnergy: number;                 // 0–100
  rhythm: number;                      // 0–100
  stressPattern: number;               // 0–100
  hesitationIndex: number;             // 0–100
  pauseAnomaly: AnomalyLevel;
  pauseFrequency: number;              // pauses per minute
  avgPauseDuration: number;            // ms
  abruptPauses: number;                // count
  temporalConsistency: number;         // 0–100
  avgResponseLatency: number;          // ms
  turnTakingConsistency: number;       // 0–100
  detectedLanguage: SupportedLanguage | 'Unknown';
  languageConfidence: number;          // 0–100
  overallRiskScore: number;            // 0–100
  riskLevel: RiskLevel;
  riskFactors: string[];
  recommendation: RecommendationAction;
  recommendationReason: string;
}

export interface SpeakerAnalysis {
  speaker_id: string;
  speaker_label?: string;
  speech_duration: number;
  usable_speech_duration?: number;
  segment_count: number;
  reliable_segment_count: number;
  real_score: number | null;
  fake_score: number | null;
  risk_score: number | null;
  risk_level: string;
  status?: string;
  classification?: string;
  classification_label?: string;
  binary_prediction?: string;
  high_risk_segments?: number;
  reason?: string;
}

export interface DiarizationSegment {
  speaker: string;
  start: number;
  end: number;
}

// --- Transcript Segment ---
export interface TranscriptSegment {
  id: string;
  timestamp: string;           // e.g. "00:42"
  speaker: 'CALLER' | 'AGENT' | 'SYSTEM';
  text: string;
  isSuspicious: boolean;
  anomalyNote?: string;        // e.g. "Contextual risk indicator detected"
}

// --- Call Record ---
export interface Call {
  id: string;
  caller: string;
  callerPhone?: string;
  contactId?: string;
  startTime: string;
  endTime?: string;
  duration?: number;           // seconds
  language: SupportedLanguage | 'Unknown';
  audioSource: AudioSourceType;
  riskScore: number;
  riskLevel: RiskLevel;
  voiceIntegrity: number;      // 0–100
  status: 'ACTIVE' | 'COMPLETED' | 'ENDED' | 'BLOCKED';
  analysisId?: string;
  analysis?: Analysis;
  transcript?: TranscriptSegment[];
  tags?: string[];
  speakers?: SpeakerAnalysis[];
  diarizationSegments?: DiarizationSegment[];
  audioUrl?: string;
  fileName?: string;
}

// --- Risk Event ---
export interface RiskEvent {
  id: string;
  callId?: string;
  timestamp: string;
  type: 'SYNTHETIC_VOICE' | 'SPEAKER_MISMATCH' | 'PAUSE_ANOMALY' | 'HIGH_RISK' | 'VERIFICATION_REQUIRED';
  severity: RiskLevel;
  message: string;
  acknowledged: boolean;
}

// --- Contact ---
export interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  organization?: string;
  trustStatus: 'TRUSTED' | 'NEUTRAL' | 'BLOCKED';
  voiceProfileStatus: 'ENROLLED' | 'PENDING' | 'NONE';
  lastInteraction?: string;
  riskHistory: Array<{ date: string; riskScore: number }>;
  totalCalls: number;
  createdAt: string;
  isAuthorized?: boolean;
  authorizedAt?: string;
  authorizedBy?: string;
  securityClearance?: 'HIGH' | 'STANDARD' | 'RESTRICTED';
}

// --- Analytics Metric ---
export interface AnalyticsMetric {
  date: string;
  callsAnalyzed: number;
  safeCalls: number;
  suspiciousCalls: number;
  highRiskCalls: number;
  syntheticDetections: number;
  verificationRequests: number;
}

export interface LanguageDistribution {
  language: SupportedLanguage;
  count: number;
  percentage: number;
}

export interface SignalDistribution {
  signal: string;
  contribution: number;
}

// --- User & Authentication ---
export interface User {
  id: string;
  fullName: string;
  email: string;
  organization?: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
  createdAt: string;
  lastLogin?: string;
}

// --- Notification ---
export interface Notification {
  id: string;
  type: 'ALERT' | 'INFO' | 'WARNING' | 'SUCCESS';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  callId?: string;
}

// --- Security Event ---
export interface SecurityEvent {
  id: string;
  type: 'LOGIN' | 'LOGOUT' | 'SETTINGS_CHANGE' | 'ANALYSIS_START' | 'VERIFICATION' | 'SESSION_EXPIRED';
  description: string;
  timestamp: string;
  ipAddress?: string;
  device?: string;
}

// --- Settings ---
export interface AppSettings {
  account: {
    fullName: string;
    email: string;
    organization: string;
  };
  language: {
    interfaceLanguage: string;
    enabledAnalysisLanguages: SupportedLanguage[];
  };
  notifications: {
    highRiskAlerts: boolean;
    suspiciousCallAlerts: boolean;
    verificationRequests: boolean;
    emailNotifications: boolean;
  };
  security: {
    mfaEnabled: boolean;
    sessionTimeoutMinutes: number;
  };
  privacy: {
    audioRetentionDays: number;
    transcriptRetentionDays: number;
    allowDataProcessing: boolean;
  };
  ai: {
    riskSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    alertThreshold: number;       // 0–100
    speakerVerificationThreshold: number; // 0–100
    realtimeAnalysisMode: boolean;
  };
}

// --- Demo Scenario ---
export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  language: SupportedLanguage;
  expectedRiskLevel: RiskLevel;
  expectedRiskScore: number;
  keySignals: string[];
}

// --- Auth ---
export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignUpData {
  fullName: string;
  email: string;
  password: string;
  organization?: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

// --- Analysis Session (live) ---
export interface AnalysisSession {
  id: string;
  source: AudioSourceType;
  startedAt: string;
  currentStageIndex: number;
  stages: AnalysisStage[];
  isComplete: boolean;
  analysis?: Analysis;
  liveMetrics: LiveMetrics;
}

export interface LiveMetrics {
  waveformData: number[];
  currentRiskScore: number;
  syntheticProbability: number;
  speakerSimilarity: number;
  detectedLanguage: SupportedLanguage | null;
  languageConfidence: number;
  emotion: EmotionLabel;
  prosodyScore: number;
  pauseAnomaly: AnomalyLevel;
  temporalConsistency: number;
}
