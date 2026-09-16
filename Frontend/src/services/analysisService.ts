import type {
  Analysis,
  AnalysisStage,
  AudioSourceType,
  Call,
  RiskLevel,
  SupportedLanguage,
  TranscriptSegment,
} from '../types';
import { DEMO_SCENARIOS } from './mockData';
import {
  analyzeAudioFile as analyzeAudioFileApi,
  analyzeMultispeakerAudioFile as analyzeMultispeakerAudioFileApi,
} from './voiceShieldApi';

export async function analyzeRealAudioFile(
  file: File,
  source: AudioSourceType = 'UPLOAD',
  mode: 'single' | 'multispeaker' = 'single'
): Promise<{ call: Call; analysis: Analysis; transcript: TranscriptSegment[] }> {
  const result = mode === 'multispeaker'
    ? await analyzeMultispeakerAudioFileApi(file)
    : await analyzeAudioFileApi(file);

  const { analysis } = result;

  const isHighRisk = analysis.riskLevel === 'HIGH_RISK';
  const isSuspicious = analysis.riskLevel === 'SUSPICIOUS';

  let transcript: TranscriptSegment[] = [];

  if (result.diarizationSegments && result.diarizationSegments.length > 0) {
    transcript = result.diarizationSegments.map((seg, idx) => {
      const min = Math.floor(seg.start / 60);
      const sec = Math.floor(seg.start % 60);
      const timeStr = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
      const spkObj = result.speakers?.find((s) => s.speaker_id === seg.speaker);
      const spkLabel = spkObj?.speaker_label || (seg.speaker === 'SPEAKER_00' ? 'Speaker 1' : 'Speaker 2');
      const isSpkRisk = spkObj?.risk_level === 'HIGH RISK' || spkObj?.risk_level === 'SUSPICIOUS';
      return {
        id: `turn-${idx}-${Date.now()}`,
        timestamp: timeStr,
        speaker: (seg.speaker === 'SPEAKER_00' ? 'CALLER' : 'AGENT') as 'CALLER' | 'AGENT',
        text: `[${spkLabel} turn: ${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s]`,
        isSuspicious: Boolean(isSpkRisk),
        anomalyNote: isSpkRisk
          ? `${spkLabel} flagged as ${spkObj?.risk_level} (${Math.round((spkObj?.fake_score || 0) * 100)}% fake risk)`
          : undefined,
      };
    });
  } else {
    transcript = [
      {
        id: `t1-${Date.now()}`,
        timestamp: '00:02',
        speaker: 'CALLER',
        text: `[Analyzed Audio File: ${file.name}]`,
        isSuspicious: isHighRisk || isSuspicious,
        anomalyNote: isHighRisk
          ? `Neural deepfake anomaly detected (${analysis.syntheticProbability}% synthetic probability)`
          : isSuspicious
          ? `Elevated acoustic anomaly score (${analysis.syntheticProbability}%)`
          : 'Low synthetic-speech score; caller identity is not verified',
      },
    ];
  }

  const call: Call = {
    id: analysis.callId,
    caller: file.name.replace(/\.[^/.]+$/, ''),
    callerPhone: '+91 Live Audio',
    startTime: analysis.timestamp,
    duration: Math.round(result.backend.durationSeconds) || 30,
    language: analysis.detectedLanguage || 'Unknown',
    audioSource: source,
    riskScore: analysis.overallRiskScore,
    riskLevel: analysis.riskLevel,
    voiceIntegrity: Math.max(0, Math.round(100 - analysis.overallRiskScore)),
    status: 'COMPLETED',
    analysisId: analysis.id,
    analysis,
    transcript,
    tags: [
      analysis.detectedLanguage || 'Unknown',
      analysis.riskLevel,
      mode === 'multispeaker' ? 'Multi-Speaker Call' : 'Solo Voice',
      'Real VoiceShield AI'
    ],
    speakers: result.speakers,
    diarizationSegments: result.diarizationSegments,
  };

  return { call, analysis, transcript };
}

export const ANALYSIS_STAGES: AnalysisStage[] = [
  {
    id: 'stage-1',
    label: 'Acoustic & Spectral Feature Extraction',
    description: 'Decomposing vocal frequency spectrum, mel-spectrogram, and Formant distributions.',
    durationMs: 1200,
  },
  {
    id: 'stage-2',
    label: 'Prosody & Temporal Cadence Analysis',
    description: 'Evaluating pitch contours, speaking rhythm, pauses, and turn-taking latency.',
    durationMs: 1500,
  },
  {
    id: 'stage-3',
    label: 'Language & Dialect Identification',
    description: 'Classifying phonetic tokens against Indian regional & international language models.',
    durationMs: 1000,
  },
  {
    id: 'stage-4',
    label: 'Deepfake & Vocoder Neural Network Inspection',
    description: 'Scanning high-frequency phase alignment and neural TTS artifacts.',
    durationMs: 1800,
  },
  {
    id: 'stage-5',
    label: 'Speaker Verification & Risk Scoring',
    description: 'Cross-referencing enrolled voice embedding signature and synthesizing final risk index.',
    durationMs: 1000,
  },
];

export function generateWaveform(count: number = 40): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 85) + 15);
}

export function createAnalysisFromScenario(
  scenarioId: string,
  source: AudioSourceType = 'MICROPHONE'
): { call: Call; analysis: Analysis; transcript: TranscriptSegment[] } {
  const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId) || DEMO_SCENARIOS[0];
  const isHighRisk = scenario.expectedRiskLevel === 'HIGH_RISK';
  const isSuspicious = scenario.expectedRiskLevel === 'SUSPICIOUS';

  const syntheticProbability = isHighRisk ? 92 : isSuspicious ? 52 : 6;
  const speakerSimilarity = isHighRisk ? 15 : isSuspicious ? 58 : 94;
  const overallRiskScore = scenario.expectedRiskScore;
  const riskLevel = scenario.expectedRiskLevel;

  const analysis: Analysis = {
    id: `an-${Date.now()}`,
    callId: `call-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    syntheticProbability,
    speakerSimilarity,
    emotion: isHighRisk ? 'Stressed' : isSuspicious ? 'Uncertain' : 'Calm',
    emotionalConsistency: isHighRisk ? 38 : isSuspicious ? 64 : 94,
    prosodyScore: isHighRisk ? 28 : isSuspicious ? 60 : 92,
    pitchVariation: isHighRisk ? 22 : isSuspicious ? 56 : 86,
    speakingRate: isHighRisk ? 86 : isSuspicious ? 70 : 66,
    vocalEnergy: isHighRisk ? 75 : isSuspicious ? 62 : 70,
    rhythm: isHighRisk ? 32 : isSuspicious ? 60 : 90,
    stressPattern: isHighRisk ? 40 : isSuspicious ? 58 : 88,
    hesitationIndex: isHighRisk ? 76 : isSuspicious ? 42 : 12,
    pauseAnomaly: isHighRisk ? 'HIGH' : isSuspicious ? 'MEDIUM' : 'LOW',
    pauseFrequency: isHighRisk ? 14 : isSuspicious ? 8 : 4,
    avgPauseDuration: isHighRisk ? 1800 : isSuspicious ? 1050 : 580,
    abruptPauses: isHighRisk ? 5 : isSuspicious ? 2 : 0,
    temporalConsistency: isHighRisk ? 42 : isSuspicious ? 65 : 95,
    avgResponseLatency: isHighRisk ? 1400 : isSuspicious ? 880 : 450,
    turnTakingConsistency: isHighRisk ? 40 : isSuspicious ? 66 : 94,
    detectedLanguage: scenario.language,
    languageConfidence: 97,
    overallRiskScore,
    riskLevel,
    riskFactors: scenario.keySignals,
    recommendation: isHighRisk ? 'END_CALL' : isSuspicious ? 'VERIFY_CALLER' : 'CONTINUE',
    recommendationReason: isHighRisk
      ? 'Critical deepfake neural voice artifacts detected. Terminate communication immediately.'
      : isSuspicious
      ? 'Acoustic anomalies detected. Issue out-of-band verification prompt.'
      : 'Authentic vocal dynamics matching verified speaker fingerprint.',
  };

  const transcript: TranscriptSegment[] = getSampleTranscript(scenario.language, riskLevel);

  const call: Call = {
    id: analysis.callId,
    caller: scenario.name,
    callerPhone: isHighRisk ? '+91 99001 88219' : '+91 98765 43210',
    startTime: analysis.timestamp,
    duration: 120,
    language: scenario.language,
    audioSource: source,
    riskScore: overallRiskScore,
    riskLevel,
    voiceIntegrity: 100 - overallRiskScore,
    status: isHighRisk ? 'BLOCKED' : 'COMPLETED',
    analysisId: analysis.id,
    analysis,
    transcript,
    tags: [scenario.language, riskLevel, 'Interactive Analysis'],
  };

  return { call, analysis, transcript };
}

function getSampleTranscript(lang: SupportedLanguage, riskLevel: RiskLevel): TranscriptSegment[] {
  const isHighRisk = riskLevel === 'HIGH_RISK';
  if (lang === 'Hindi') {
    return [
      { id: 't1', timestamp: '00:04', speaker: 'CALLER', text: 'नमस्ते, बैंक सुरक्षा अधिकारी बोल रहा हूँ।', isSuspicious: false },
      { id: 't2', timestamp: '00:16', speaker: 'CALLER', text: 'आपका क्रेडिट कार्ड ब्लॉक किया जा रहा है, ओटीपी दर्ज करें।', isSuspicious: isHighRisk, anomalyNote: isHighRisk ? 'Neural phase artifact in card phrase' : undefined },
    ];
  }
  if (lang === 'Punjabi') {
    return [
      { id: 't1', timestamp: '00:03', speaker: 'CALLER', text: 'ਸਤਿ ਸ਼੍ਰੀ ਅਕਾਲ! ਕੀ ਤੁਸੀਂ ਮੈਨੂੰ ਸੁਣ ਸਕਦੇ ਹੋ?', isSuspicious: false },
      { id: 't2', timestamp: '00:15', speaker: 'CALLER', text: 'ਮੈਨੂੰ ਤੁਰੰਤ ਮਦਦ ਦੀ ਲੋੜ ਹੈ।', isSuspicious: isHighRisk, anomalyNote: isHighRisk ? 'Synthetic cadence detected' : undefined },
    ];
  }
  return [
    { id: 't1', timestamp: '00:05', speaker: 'CALLER', text: 'Hello, I am calling regarding your account authorization.', isSuspicious: false },
    { id: 't2', timestamp: '00:18', speaker: 'CALLER', text: 'Please confirm your security code immediately.', isSuspicious: isHighRisk, anomalyNote: isHighRisk ? 'Vocoder spectral alignment distortion' : undefined },
  ];
}
