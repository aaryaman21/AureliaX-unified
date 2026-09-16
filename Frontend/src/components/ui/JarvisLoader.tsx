import React, { useEffect, useState } from 'react';
import { Shield, Zap, Cpu, Radio, Activity } from 'lucide-react';
import styles from './JarvisLoader.module.css';

interface JarvisLoaderProps {
  onComplete?: () => void;
  durationMs?: number;
}

const DIAGNOSTIC_STEPS = [
  'INITIALIZING AURELIA-X NEURAL CORE...',
  'CALIBRATING VOCODER DISCRIMINATOR MATRIX...',
  'LOADING MULTI-LINGUAL PROSODY MODELS...',
  'ESTABLISHING ENCRYPTED VOICE TELEMETRY STREAM...',
  'SYSTEM ONLINE • ZERO-TRUST VOICE PROTECTION READY',
];

export const JarvisLoader: React.FC<JarvisLoaderProps> = ({
  onComplete,
  durationMs = 3000,
}) => {
  const [progress, setProgress] = useState(0);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    const intervalTime = 30;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / durationMs) * 100));
      setProgress(pct);

      const stepIdx = Math.min(
        DIAGNOSTIC_STEPS.length - 1,
        Math.floor((elapsed / durationMs) * DIAGNOSTIC_STEPS.length)
      );
      setCurrentStepIdx(stepIdx);

      if (elapsed >= durationMs) {
        clearInterval(timer);
        setIsFadingOut(true);
        setTimeout(() => {
          if (onComplete) onComplete();
        }, 500); // 500ms fade transition
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [durationMs, onComplete]);

  return (
    <div className={`${styles.overlay} ${isFadingOut ? styles.fadeOut : ''}`}>
      {/* Background Cyber Grid */}
      <div className={styles.gridBackground} />
      <div className={styles.vignette} />

      {/* Central JARVIS HUD */}
      <div className={styles.hudContainer}>
        {/* Outer Rotating Arc Rings */}
        <div className={styles.ringOuter} />
        <div className={styles.ringMiddle} />
        <div className={styles.ringInner} />
        <div className={styles.scanBeam} />

        {/* Central Reactor / Brand Core */}
        <div className={styles.coreReactor}>
          <div className={styles.corePulse} />
          <Shield className={styles.shieldIcon} size={48} />
        </div>

        {/* Brand Header */}
        <div className={styles.brandTitleArea}>
          <div className={styles.badgeRow}>
            <Radio size={14} className={styles.liveRadioIcon} />
            <span className={styles.techTag}>PROT-VOX v4.8</span>
            <span className={styles.techDivider}>|</span>
            <span className={styles.techTag}>JARVIS NEURAL HUD</span>
          </div>
          <h1 className={styles.brandName}>
            AURELIA<span className={styles.brandX}>X</span>
          </h1>
          <p className={styles.subTitle}>AI VOICE INTEGRITY PLATFORM</p>
        </div>

        {/* Diagnostic Output Stream */}
        <div className={styles.diagnosticsBox}>
          <div className={styles.diagHeader}>
            <Cpu size={14} className={styles.diagIcon} />
            <span>SYSTEM DIAGNOSTICS</span>
            <span className={styles.diagPercentage}>{progress}%</span>
          </div>

          <div className={styles.logTextWrapper}>
            <p className={styles.logText}>
              <span className={styles.logPrompt}>&gt;</span> {DIAGNOSTIC_STEPS[currentStepIdx]}
            </p>
          </div>

          {/* Progress Bar */}
          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{ width: `${progress}%` }}
            />
            <div className={styles.progressGlow} style={{ left: `${progress}%` }} />
          </div>

          {/* Bottom Telemetry Status Row */}
          <div className={styles.telemetryRow}>
            <div className={styles.telemetryItem}>
              <Activity size={12} />
              <span>DSP: ACTIVE</span>
            </div>
            <div className={styles.telemetryItem}>
              <Zap size={12} />
              <span>LATENCY: 12ms</span>
            </div>
            <div className={styles.telemetryItem}>
              <Shield size={12} />
              <span>SEC: QUANTUM-SAFE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Decorative Corner Reticles */}
      <div className={`${styles.cornerReticle} ${styles.topLeft}`} />
      <div className={`${styles.cornerReticle} ${styles.topRight}`} />
      <div className={`${styles.cornerReticle} ${styles.bottomLeft}`} />
      <div className={`${styles.cornerReticle} ${styles.bottomRight}`} />
    </div>
  );
};
