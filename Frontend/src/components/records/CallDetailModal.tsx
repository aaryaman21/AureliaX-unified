import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Play,
  Sparkles,
} from 'lucide-react';
import type { Call } from '../../types';
import { Modal } from '../ui/Modal';
import { RiskBadge } from '../ui/RiskBadge';
import styles from './CallDetailModal.module.css';

interface CallDetailModalProps {
  call: Call | null;
  onClose: () => void;
}

export const CallDetailModal: React.FC<CallDetailModalProps> = ({ call, onClose }) => {
  if (!call) return null;

  const { analysis, transcript } = call;

  return (
    <Modal isOpen={!!call} onClose={onClose} title={`Call Investigation Payload — ${call.id}`}>
      <div className={styles.modalBody}>
        {/* Header Summary */}
        <div className={styles.summaryHeader}>
          <div>
            <span className={styles.callerName}>{call.caller}</span>
            <span className={styles.callerSub}>
              {call.callerPhone || 'Unlisted Number'} • {call.language} • {call.startTime}
            </span>
          </div>
          <div className={styles.riskBadgeGroup}>
            <RiskBadge score={call.riskScore} riskLevel={call.riskLevel} />
          </div>
        </div>

        {/* Action Recommendation Bar */}
        {analysis && (
          <div
            className={`${styles.recBanner} ${
              analysis.riskLevel === 'HIGH_RISK'
                ? styles.recBannerDanger
                : analysis.riskLevel === 'SUSPICIOUS'
                ? styles.recBannerWarn
                : styles.recBannerSafe
            }`}
          >
            {analysis.riskLevel === 'HIGH_RISK' ? (
              <ShieldAlert size={22} />
            ) : analysis.riskLevel === 'SUSPICIOUS' ? (
              <AlertTriangle size={22} />
            ) : (
              <ShieldCheck size={22} />
            )}
            <div>
              <strong>AI Recommendation: {analysis.recommendation.replace('_', ' ')}</strong>
              <p>{analysis.recommendationReason}</p>
            </div>
          </div>
        )}

        {/* Audio Waveform Simulation Player */}
        <div className={styles.audioPlayerBox}>
          <div className={styles.playBtnCircle}>
            <Play size={18} fill="#ffffff" />
          </div>
          <div className={styles.playerWaveform}>
            {Array.from({ length: 32 }).map((_, idx) => (
              <div
                key={idx}
                className={styles.staticBar}
                style={{ height: `${Math.floor(Math.sin(idx) * 35 + 50)}%` }}
              />
            ))}
          </div>
          <span className={styles.playerTime}>{call.duration ? `${call.duration}s` : '02:15'}</span>
        </div>

        {/* Technical Analysis Grid */}
        {analysis && analysis.metricsSource !== 'classifier_only' && (
          <div className={styles.techGrid}>
            <div className={styles.techBox}>
              <span className={styles.techLabel}>Synthetic Voice Score</span>
              <span className={styles.techValue}>{analysis.syntheticProbability}%</span>
              <span className={styles.techSub}>Neural Vocoder Scan</span>
            </div>
            <div className={styles.techBox}>
              <span className={styles.techLabel}>Speaker Similarity</span>
              <span className={styles.techValue}>{analysis.speakerSimilarity}%</span>
              <span className={styles.techSub}>Enrolled Voice Print</span>
            </div>
            <div className={styles.techBox}>
              <span className={styles.techLabel}>Emotion Consistency</span>
              <span className={styles.techValue}>{analysis.emotionalConsistency}%</span>
              <span className={styles.techSub}>{analysis.emotion}</span>
            </div>
            <div className={styles.techBox}>
              <span className={styles.techLabel}>Pause Anomaly Level</span>
              <span className={styles.techValue} style={{ color: analysis.pauseAnomaly === 'HIGH' ? '#ef4444' : '#10b981' }}>
                {analysis.pauseAnomaly}
              </span>
              <span className={styles.techSub}>{analysis.abruptPauses} abrupt pauses</span>
            </div>
          </div>
        )}

        {/* Risk Indicators */}
        {analysis && analysis.riskFactors.length > 0 && (
          <div className={styles.signalsSection}>
            <h4 className={styles.sectionTitle}>Detected Risk Factors & Neural Signals</h4>
            <ul className={styles.signalsList}>
              {analysis.riskFactors.map((factor, i) => (
                <li key={i} className={styles.signalRow}>
                  <Sparkles size={14} className={styles.sparkleIcon} />
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Transcript Section */}
        {transcript && transcript.length > 0 && (
          <div className={styles.transcriptSection}>
            <h4 className={styles.sectionTitle}>Full Audio Transcript & Flagged Artifacts</h4>
            <div className={styles.transcriptList}>
              {transcript.map((seg) => (
                <div
                  key={seg.id}
                  className={`${styles.transcriptSeg} ${seg.isSuspicious ? styles.suspiciousSeg : ''}`}
                >
                  <div className={styles.segHeader}>
                    <span className={styles.segSpeaker}>{seg.speaker}</span>
                    <span className={styles.segTime}>{seg.timestamp}</span>
                  </div>
                  <p className={styles.segText}>"{seg.text}"</p>
                  {seg.anomalyNote && (
                    <span className={styles.anomalyNote}>Flag: {seg.anomalyNote}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
