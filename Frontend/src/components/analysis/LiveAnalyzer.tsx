import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Upload,
  Play,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Globe,
  Radio,
  Clock,
  Sparkles,
  Info,
  FileAudio,
  Users,
  User,
  History,
  RotateCcw,
} from 'lucide-react';
import type {
  Analysis,
  AudioSourceType,
  Call,
  TranscriptSegment,
  SpeakerAnalysis,
  DiarizationSegment,
} from '../../types';
import { getRiskLabel } from '../../types';
import { DEMO_SCENARIOS } from '../../services/mockData';
import {
  ANALYSIS_STAGES,
  createAnalysisFromScenario,
  generateWaveform,
  analyzeRealAudioFile,
} from '../../services/analysisService';
import {
  fetchAudioLogs,
  fetchAudioAsFile,
} from '../../services/voiceShieldApi';
import type { SavedAudioLog } from '../../services/voiceShieldApi';
import { RiskBadge } from '../ui/RiskBadge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import styles from './LiveAnalyzer.module.css';

interface LiveAnalyzerProps {
  onCallAnalyzed?: (newCall: Call) => void;
  audioToRetest?: { url: string; filename: string } | null;
  onClearAudioToRetest?: () => void;
}

export const LiveAnalyzer: React.FC<LiveAnalyzerProps> = ({
  onCallAnalyzed,
  audioToRetest,
  onClearAudioToRetest,
}) => {
  const [selectedSource, setSelectedSource] = useState<AudioSourceType | 'SAVED_LIBRARY'>('UPLOAD');
  const [analysisMode, setAnalysisMode] = useState<'single' | 'multispeaker'>('single');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(DEMO_SCENARIOS[0].id);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(-1);
  const [waveformData, setWaveformData] = useState<number[]>(generateWaveform(36));
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [savedLogs, setSavedLogs] = useState<SavedAudioLog[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<string>('');

  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null);
  const [activeTranscript, setActiveTranscript] = useState<TranscriptSegment[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<SpeakerAnalysis[]>([]);
  const [activeDiarization, setActiveDiarization] = useState<DiarizationSegment[]>([]);

  // Waveform animation loop during analysis
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAnalyzing) {
      interval = setInterval(() => {
        setWaveformData(generateWaveform(36));
      }, 150);
    } else {
      setWaveformData(generateWaveform(36).map((val) => Math.floor(val * 0.3)));
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setAudioPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioPreviewUrl(null);
    }
  }, [selectedFile]);

  const refreshSavedLogs = async () => {
    try {
      const logs = await fetchAudioLogs();
      setSavedLogs(logs);
    } catch (e) {
      console.error('Failed to fetch audio logs:', e);
    }
  };

  useEffect(() => {
    refreshSavedLogs();
  }, []);

  useEffect(() => {
    if (audioToRetest) {
      setSelectedSource('UPLOAD');
      fetchAudioAsFile(audioToRetest.url, audioToRetest.filename)
        .then((file) => {
          setSelectedFile(file);
          setAnalysisError(null);
          onClearAudioToRetest?.();
        })
        .catch((err) => {
          console.error('Failed to load audio to retest:', err);
        });
    }
  }, [audioToRetest, onClearAudioToRetest]);

  const handleSourceChange = (source: AudioSourceType | 'SAVED_LIBRARY') => {
    setSelectedSource(source);
    setAnalysisError(null);
    if (source === 'UPLOAD') {
      setTimeout(() => fileInputRef.current?.click(), 100);
    } else if (source === 'SAVED_LIBRARY') {
      refreshSavedLogs();
    }
  };

  const handleSelectSavedLog = async (logId: string) => {
    setSelectedLogId(logId);
    const log = savedLogs.find((l) => l.id === logId);
    if (!log) return;
    try {
      const file = await fetchAudioAsFile(log.audio_url, log.filename);
      setSelectedFile(file);
      setAnalysisError(null);
    } catch (err: any) {
      setAnalysisError(`Failed to load saved audio file: ${err.message}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setAnalysisError(null);
    }
  };

  const handleStartAnalysis = async () => {
    setIsAnalyzing(true);
    setCurrentStageIndex(0);
    setActiveAnalysis(null);
    setActiveTranscript([]);
    setActiveSpeakers([]);
    setActiveDiarization([]);
    setAnalysisError(null);

    // If Audio File mode is selected but no file has been chosen yet, trigger picker
    if ((selectedSource === 'UPLOAD' || selectedSource === 'SAVED_LIBRARY') && !selectedFile) {
      if (selectedSource === 'UPLOAD') {
        fileInputRef.current?.click();
      } else {
        setAnalysisError('Please choose a saved audio file from the dropdown first.');
      }
      setIsAnalyzing(false);
      return;
    }

    // Pipeline stage step animation helper
    let stage = 0;
    const stageInterval = setInterval(() => {
      stage += 1;
      if (stage < ANALYSIS_STAGES.length) {
        setCurrentStageIndex(stage);
      }
    }, 900);

    try {
      let callResult: Call;
      let analysisResult: Analysis;
      let transcriptResult: TranscriptSegment[];

      if (selectedFile && (selectedSource === 'UPLOAD' || selectedSource === 'MICROPHONE')) {
        // Execute REAL backend inference via FastAPI
        const res = await analyzeRealAudioFile(selectedFile, selectedSource, analysisMode);
        callResult = res.call;
        analysisResult = res.analysis;
        transcriptResult = res.transcript;
        if (res.call.speakers) {
          setActiveSpeakers(res.call.speakers);
        }
        if (res.call.diarizationSegments) {
          setActiveDiarization(res.call.diarizationSegments);
        }
      } else {
        // Fallback / Preset demo scenario mode
        const res = createAnalysisFromScenario(
          selectedScenarioId,
          selectedSource === 'SAVED_LIBRARY' ? 'UPLOAD' : selectedSource
        );
        callResult = res.call;
        analysisResult = res.analysis;
        transcriptResult = res.transcript;
      }

      // Finish stage progression
      clearInterval(stageInterval);
      setCurrentStageIndex(ANALYSIS_STAGES.length - 1);
      
      setTimeout(() => {
        setActiveAnalysis(analysisResult);
        setActiveTranscript(transcriptResult);
        setIsAnalyzing(false);
        if (onCallAnalyzed) {
          onCallAnalyzed(callResult);
        }
      }, 500);

    } catch (err: any) {
      clearInterval(stageInterval);
      setIsAnalyzing(false);
      const errMsg = err?.message || 'Failed to analyze audio with VoiceShield AI backend.';
      setAnalysisError(errMsg);
    }
  };

  const currentScenario = DEMO_SCENARIOS.find((s) => s.id === selectedScenarioId) || DEMO_SCENARIOS[0];

  return (
    <div className={styles.container}>
      {/* Top Banner / Scenario Control Bar */}
      <Card className={styles.controlCard}>
        <div className={styles.controlHeader}>
          <div className={styles.titleArea}>
            <Radio className={styles.pulseRadio} size={20} />
            <div>
              <h2 className={styles.workbenchTitle}>Real-time Voice Analysis Workbench</h2>
              <p className={styles.workbenchSub}>
                Test deepfake detection neural models, acoustic prosody, and language verification
              </p>
            </div>
          </div>

          <div className={styles.actionButtonGroup}>
            {!isAnalyzing ? (
              <Button
                variant="primary"
                size="md"
                onClick={handleStartAnalysis}
                leftIcon={<Play size={18} />}
              >
                Run Voice Analysis
              </Button>
            ) : (
              <Button variant="danger" size="md" disabled leftIcon={<Zap size={18} />}>
                Analyzing Audio Stream...
              </Button>
            )}
          </div>
        </div>

        {/* Hidden File Input for Real Audio & Video Analysis */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="audio/*,video/mp4,video/*,.mp4,.mov,.m4a,.wav,.mp3,.flac,.aac,.ogg,.webm"
          style={{ display: 'none' }}
        />

        {/* Input Source & Preset Selector */}
        <div className={styles.inputSelectionGrid}>
          <div className={styles.sourceToggleGroup}>
            <button
              className={`${styles.sourceBtn} ${selectedSource === 'MICROPHONE' ? styles.sourceActive : ''}`}
              onClick={() => handleSourceChange('MICROPHONE')}
            >
              <Mic size={16} />
              <span>Microphone Demo</span>
            </button>
            <button
              className={`${styles.sourceBtn} ${selectedSource === 'UPLOAD' ? styles.sourceActive : ''}`}
              onClick={() => handleSourceChange('UPLOAD')}
            >
              <Upload size={16} />
              <span>Audio / Video File</span>
            </button>
            <button
              className={`${styles.sourceBtn} ${selectedSource === 'SAVED_LIBRARY' ? styles.sourceActive : ''}`}
              onClick={() => handleSourceChange('SAVED_LIBRARY')}
            >
              <History size={16} />
              <span>Saved Audio Logs ({savedLogs.length})</span>
            </button>
            <button
              className={`${styles.sourceBtn} ${selectedSource === 'API' ? styles.sourceActive : ''}`}
              onClick={() => handleSourceChange('API')}
            >
              <Globe size={16} />
              <span>Demo Presets</span>
            </button>
          </div>

          {selectedSource === 'SAVED_LIBRARY' ? (
            <div className={styles.presetSelectorGroup}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <label className={styles.presetLabel}>Pick Stored Test Audio:</label>
                <button
                  type="button"
                  onClick={refreshSavedLogs}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#38bdf8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                  }}
                  title="Refresh audio logs"
                >
                  <RotateCcw size={12} /> Refresh
                </button>
              </div>
              <select
                className={styles.presetSelect}
                value={selectedLogId}
                onChange={(e) => handleSelectSavedLog(e.target.value)}
                disabled={isAnalyzing}
              >
                <option value="">-- Choose past test audio ({savedLogs.length} saved) --</option>
                {savedLogs.map((log) => (
                  <option key={log.id} value={log.id}>
                    {log.filename} — {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({log.risk_level} risk, {(log.synthetic_probability * 100).toFixed(0)}% AI)
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={styles.presetSelectorGroup}>
              <label className={styles.presetLabel}>Test Scenario Preset:</label>
              <select
                className={styles.presetSelect}
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                disabled={isAnalyzing}
              >
                {DEMO_SCENARIOS.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name} ({sc.language} — {getRiskLabel(sc.expectedRiskLevel)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Audio Separation Pipeline Selector */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            marginTop: '12px',
            padding: '10px 14px',
            background: 'rgba(15, 23, 42, 0.65)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={16} color="#38bdf8" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>
              Voice Separation Pipeline:
            </span>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              {analysisMode === 'multispeaker'
                ? 'Speaker turns when available; otherwise analyzes the recording without speaker identities'
                : 'Sequential sliding chunk analysis for single-speaker voice notes / solo audio'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setAnalysisMode('single')}
              disabled={isAnalyzing}
              style={{
                padding: '6px 12px',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: analysisMode === 'single' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                background: analysisMode === 'single' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                color: analysisMode === 'single' ? '#38bdf8' : '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
              }}
            >
              <User size={13} />
              Single Speaker (Solo)
            </button>
            <button
              type="button"
              onClick={() => setAnalysisMode('multispeaker')}
              disabled={isAnalyzing}
              style={{
                padding: '6px 12px',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: analysisMode === 'multispeaker' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                background: analysisMode === 'multispeaker' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                color: analysisMode === 'multispeaker' ? '#10b981' : '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
              }}
            >
              <Users size={13} />
              Speaker Analysis (Requires Diarization)
            </button>
          </div>
        </div>

        {/* Selected Audio File Status Bar with Inline Audio Preview */}
        {selectedFile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '12px',
              fontSize: '0.82rem',
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.08)',
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(56, 189, 248, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
              <FileAudio size={16} />
              <span>
                Loaded: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </span>
            </div>

            {audioPreviewUrl && (
              <audio
                controls
                src={audioPreviewUrl}
                style={{ height: '30px', maxWidth: '280px', flex: '0 0 auto' }}
              />
            )}

            <button
              onClick={() => {
                setSelectedFile(null);
                setSelectedLogId('');
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f87171',
                padding: '4px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 500,
              }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Backend API Analysis Error Alert Banner */}
        {analysisError && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '8px',
              padding: '12px 16px',
              color: '#fca5a5',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '12px',
            }}
          >
            <AlertTriangle size={18} />
            <span>{analysisError}</span>
          </div>
        )}
      </Card>

      {/* Main Grid: Waveform & Pipeline Stages on left, Live Metrics on right */}
      <div className={styles.mainGrid}>
        {/* Left Column: Visualizer & Stage Pipeline */}
        <div className={styles.leftCol}>
          {/* Audio Waveform Card */}
          <Card className={styles.visualizerCard}>
            <div className={styles.cardHeaderSmall}>
              <span className={styles.sectionHeading}>Acoustic Waveform Telemetry</span>
              <span className={styles.activeScenarioTag}>{currentScenario.language} Voice Stream</span>
            </div>

            <div className={styles.waveformBarsContainer}>
              {waveformData.map((height, i) => (
                <div
                  key={i}
                  className={`${styles.waveBar} ${isAnalyzing ? styles.waveBarActive : ''}`}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>

            <div className={styles.visualizerFooter}>
              <span className={styles.timeTicker}>
                <Clock size={14} /> 00:{isAnalyzing ? '08' : activeAnalysis ? '45' : '00'} / 02:00
              </span>
              <span className={styles.sampleRate}>48.0 kHz • 24-bit PCM</span>
            </div>
          </Card>

          {/* 5-Stage Neural Pipeline */}
          <Card className={styles.pipelineCard}>
            <h3 className={styles.sectionHeading}>AI Multi-Stage Neural Pipeline</h3>
            <div className={styles.stagesList}>
              {ANALYSIS_STAGES.map((stage, idx) => {
                const isComplete = currentStageIndex > idx || activeAnalysis !== null;
                const isCurrent = isAnalyzing && currentStageIndex === idx;

                return (
                  <div
                    key={stage.id}
                    className={`${styles.stageRow} ${
                      isCurrent ? styles.stageActive : isComplete ? styles.stageDone : ''
                    }`}
                  >
                    <div className={styles.stageStatusIcon}>
                      {isComplete ? (
                        <CheckCircle2 size={18} className={styles.doneIcon} />
                      ) : isCurrent ? (
                        <div className={styles.spinner} />
                      ) : (
                        <div className={styles.idleDot} />
                      )}
                    </div>
                    <div className={styles.stageContent}>
                      <div className={styles.stageTitleRow}>
                        <span className={styles.stageLabel}>{stage.label}</span>
                        <span className={styles.stageDuration}>{stage.durationMs}ms</span>
                      </div>
                      <p className={styles.stageDesc}>{stage.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Live Transcript Pane */}
          {activeTranscript.length > 0 && (
            <Card className={styles.transcriptCard}>
              <h3 className={styles.sectionHeading}>Streamed Call Transcript & Flagged Segments</h3>
              <div className={styles.transcriptList}>
                {activeTranscript.map((segment) => (
                  <div
                    key={segment.id}
                    className={`${styles.transcriptItem} ${
                      segment.isSuspicious ? styles.suspiciousItem : ''
                    }`}
                  >
                    <div className={styles.transcriptMeta}>
                      <span className={styles.speakerTag}>{segment.speaker}</span>
                      <span className={styles.timestampTag}>{segment.timestamp}</span>
                      {segment.isSuspicious && (
                        <span className={styles.anomalyFlag}>
                          <AlertTriangle size={12} /> Suspicious Vocal Artifact
                        </span>
                      )}
                    </div>
                    <p className={styles.transcriptText}>"{segment.text}"</p>
                    {segment.anomalyNote && (
                      <div className={styles.anomalyNoteText}>
                        <Info size={13} /> {segment.anomalyNote}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Multi-Speaker Diarization Card */}
          {activeSpeakers && activeSpeakers.length > 0 && (
            <Card style={{ marginTop: '16px', border: '1px solid rgba(56, 189, 248, 0.25)', background: 'rgba(15, 23, 42, 0.75)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={18} color="#38bdf8" />
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600, color: '#f8fafc' }}>
                    Multi-Speaker Voice Separation & Diarization
                  </h3>
                </div>
                <span style={{ fontSize: '0.78rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                  {activeSpeakers.length} Speakers Isolated {activeDiarization.length > 0 ? `• ${activeDiarization.length} Conversational Turns` : ''}
                </span>
              </div>

              {/* Dual-Caller Diagnostic Banner */}
              {activeSpeakers.length >= 2 && (
                <div
                  style={{
                    background: activeSpeakers.some((s) => s.classification === 'AI_DEEPFAKE' || s.risk_level === 'HIGH RISK')
                      ? 'rgba(239, 68, 68, 0.12)'
                      : 'rgba(16, 185, 129, 0.12)',
                    border: activeSpeakers.some((s) => s.classification === 'AI_DEEPFAKE' || s.risk_level === 'HIGH RISK')
                      ? '1px solid rgba(239, 68, 68, 0.35)'
                      : '1px solid rgba(16, 185, 129, 0.35)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  {activeSpeakers.some((s) => s.classification === 'AI_DEEPFAKE' || s.risk_level === 'HIGH RISK') ? (
                    <AlertTriangle size={18} color="#ef4444" />
                  ) : (
                    <CheckCircle2 size={18} color="#10b981" />
                  )}
                  <span
                    style={{
                      fontSize: '0.84rem',
                      color: activeSpeakers.some((s) => s.classification === 'AI_DEEPFAKE' || s.risk_level === 'HIGH RISK')
                        ? '#fca5a5'
                        : '#6ee7b7',
                      fontWeight: 500,
                    }}
                  >
                    <strong>Caller Verification Diagnosis: </strong>
                    {activeSpeakers
                      .map((s, i) => {
                        const lbl = s.speaker_label || `Speaker ${i + 1}`;
                        const isAi = s.classification === 'AI_DEEPFAKE' || s.risk_level === 'HIGH RISK';
                        const isHuman = s.classification === 'HUMAN' || s.risk_level === 'SAFE';
                        const tag = isAi ? 'AI Deepfake (Clone)' : isHuman ? 'Human (Authentic)' : 'Suspicious Voice';
                        return `${lbl} is ${tag}`;
                      })
                      .join(' • ')}
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {activeSpeakers.map((spk, idx) => {
                  const label = spk.speaker_label || `Speaker ${idx + 1}`;
                  const hasScore = spk.fake_score !== null && spk.fake_score !== undefined;
                  const fakeProb = hasScore ? Math.round(spk.fake_score! * 100) : 0;
                  const isAi = spk.classification === 'AI_DEEPFAKE' || spk.risk_level === 'HIGH RISK';
                  const isSuspicious = !isAi && (spk.classification === 'SUSPICIOUS' || spk.risk_level === 'SUSPICIOUS');
                  const isHuman = hasScore && (spk.classification === 'HUMAN' || spk.risk_level === 'SAFE');

                  const identityText = isAi ? 'HIGH SYNTHETIC SCORE' : isHuman ? 'LOW SYNTHETIC SCORE' : isSuspicious ? 'UNCERTAIN' : 'INSUFFICIENT AUDIO';
                  const badgeBg = isAi ? 'rgba(239, 68, 68, 0.18)' : isSuspicious ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.18)';
                  const badgeColor = isAi ? '#ef4444' : isSuspicious ? '#f59e0b' : '#10b981';
                  const badgeBorder = isAi ? '1px solid rgba(239, 68, 68, 0.4)' : isSuspicious ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)';

                  return (
                    <div
                      key={spk.speaker_id || idx}
                      style={{
                        background: 'rgba(30, 41, 59, 0.65)',
                        border: isAi ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        padding: '14px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <User size={16} color="#94a3b8" />
                          <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.92rem' }}>{label}</span>
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: badgeBg, color: badgeColor, border: badgeBorder }}>
                          {identityText}
                        </span>
                      </div>

                      {/* Caller Identification Tag Banner */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '10px',
                          padding: '4px 8px',
                          borderRadius: '5px',
                          background: badgeBg,
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: badgeColor,
                        }}
                      >
                        {isAi ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}
                        <span>{isAi ? 'Possible synthetic speech' : isHuman ? 'Identity not verified' : 'Independent verification needed'}</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '5px' }}>
                        <span>Active Speech:</span>
                        <strong style={{ color: '#e2e8f0' }}>{spk.speech_duration}s</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>
                        <span>Synthetic Voice Risk:</span>
                        <strong style={{ color: badgeColor }}>{hasScore ? `${fakeProb}%` : 'Unavailable'}</strong>
                      </div>

                      {/* Bar indicator */}
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.max(4, Math.min(100, fakeProb))}%`,
                            height: '100%',
                            background: badgeColor,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Live Analysis Metrics & Recommendation */}
        <div className={styles.rightCol}>
          {activeAnalysis ? (
            <>
              {/* Recommendation Callout */}
              <Card
                className={`${styles.recommendationCard} ${
                  activeAnalysis.riskLevel === 'HIGH_RISK'
                    ? styles.recHighRisk
                    : activeAnalysis.riskLevel === 'SUSPICIOUS'
                    ? styles.recSuspicious
                    : styles.recSafe
                }`}
              >
                <div className={styles.recHeader}>
                  {activeAnalysis.riskLevel === 'HIGH_RISK' ? (
                    <ShieldAlert size={28} />
                  ) : activeAnalysis.riskLevel === 'SUSPICIOUS' ? (
                    <AlertTriangle size={28} />
                  ) : (
                    <ShieldCheck size={28} />
                  )}
                  <div>
                    <span className={styles.recLabel}>AI Action Recommendation</span>
                    <h3 className={styles.recAction}>{activeAnalysis.recommendation.replace('_', ' ')}</h3>
                  </div>
                </div>
                <p className={styles.recReason}>{activeAnalysis.recommendationReason}</p>
              </Card>

              {/* Synthetic Voice Meter */}
              <Card className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span className={styles.metricTitle}>Synthetic Voice Score</span>
                  <RiskBadge score={activeAnalysis.syntheticProbability} riskLevel={activeAnalysis.riskLevel} />
                </div>

                <div className={styles.bigScoreDisplay}>
                  <span className={styles.scoreNumber}>{activeAnalysis.syntheticProbability}%</span>
                  <span className={styles.scoreSubtext}>
                    {activeAnalysis.riskLevel === 'HIGH_RISK'
                      ? 'High synthetic-speech evidence'
                      : activeAnalysis.riskLevel === 'SUSPICIOUS'
                      ? 'Uncertain: verify independently'
                      : 'Low synthetic score; identity not verified'}
                  </span>
                </div>

                <div className={styles.progressBarBg}>
                  <div
                    className={styles.progressBarFill}
                    style={{
                      width: `${activeAnalysis.syntheticProbability}%`,
                      background:
                        activeAnalysis.syntheticProbability > 70
                          ? '#ef4444'
                          : activeAnalysis.syntheticProbability > 30
                          ? '#f59e0b'
                          : '#10b981',
                    }}
                  />
                </div>
              </Card>

              {/* Speaker Similarity & Language */}
              {activeAnalysis.metricsSource !== 'classifier_only' && <div className={styles.metricsTwoCol}>
                <Card className={styles.miniMetricCard}>
                  <span className={styles.miniLabel}>Speaker Match Score</span>
                  <span className={styles.miniValue}>{activeAnalysis.speakerSimilarity}%</span>
                  <span className={styles.miniSub}>vs Enrolled Signature</span>
                </Card>

                <Card className={styles.miniMetricCard}>
                  <span className={styles.miniLabel}>Detected Language</span>
                  <span className={styles.miniValue}>{activeAnalysis.detectedLanguage}</span>
                  <span className={styles.miniSub}>{activeAnalysis.languageConfidence}% Confidence</span>
                </Card>
              </div>}

              {/* Prosody & Vocal Dynamics Breakdown */}
              {activeAnalysis.metricsSource !== 'classifier_only' && <Card className={styles.prosodyCard}>
                <h4 className={styles.prosodyHeading}>Prosody & Acoustic Metrics</h4>
                <div className={styles.prosodyGrid}>
                  <div className={styles.prosodyItem}>
                    <span>Pitch Variation</span>
                    <strong>{activeAnalysis.pitchVariation}/100</strong>
                  </div>
                  <div className={styles.prosodyItem}>
                    <span>Speaking Rate</span>
                    <strong>{activeAnalysis.speakingRate} WPM</strong>
                  </div>
                  <div className={styles.prosodyItem}>
                    <span>Hesitation Index</span>
                    <strong>{activeAnalysis.hesitationIndex}%</strong>
                  </div>
                  <div className={styles.prosodyItem}>
                    <span>Pause Anomaly</span>
                    <strong
                      style={{
                        color:
                          activeAnalysis.pauseAnomaly === 'HIGH'
                            ? '#ef4444'
                            : activeAnalysis.pauseAnomaly === 'MEDIUM'
                            ? '#f59e0b'
                            : '#10b981',
                      }}
                    >
                      {activeAnalysis.pauseAnomaly}
                    </strong>
                  </div>
                </div>
              </Card>}

              {/* Risk Signals List */}
              {activeAnalysis.riskFactors.length > 0 && (
                <Card className={styles.signalsCard}>
                  <h4 className={styles.signalsTitle}>Identified Threat Signals</h4>
                  <ul className={styles.signalsList}>
                    {activeAnalysis.riskFactors.map((factor, i) => (
                      <li key={i} className={styles.signalItem}>
                        <Sparkles size={14} className={styles.signalIcon} />
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          ) : (
            <Card className={styles.emptyMetricsCard}>
              <Zap size={40} className={styles.emptyIcon} />
              <h3>Ready for Voice Analysis</h3>
              <p>
                Select an audio source or scenario preset, then click <strong>Run Voice Analysis</strong> to start real-time inspection.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
