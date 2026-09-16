import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { MOCK_ANALYTICS, SIGNAL_DISTRIBUTION } from '../../services/mockData';
import { Card } from '../ui/Card';
import styles from './AnalyticsView.module.css';

export const AnalyticsView: React.FC = () => {
  return (
    <div className={styles.container}>
      {/* Header */}
      <Card className={styles.headerCard}>
        <div>
          <h2 className={styles.pageTitle}>Voice Integrity Intelligence & Analytics</h2>
          <p className={styles.pageSub}>
            Deep insight into synthetic vocoder detection rates, signal contributions, and cross-language risk patterns
          </p>
        </div>
      </Card>

      {/* Area Chart: Overall Call Volume vs Deepfake Threats */}
      <Card className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>7-Day Deepfake Threat Area Trend</h3>
          <span className={styles.chartSub}>Total Analyzed vs Synthetic Detections</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={MOCK_ANALYTICS}>
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#f8fafc',
              }}
            />
            <Area
              type="monotone"
              dataKey="callsAnalyzed"
              name="Total Calls"
              stroke="#38bdf8"
              fill="rgba(56, 189, 248, 0.15)"
            />
            <Area
              type="monotone"
              dataKey="syntheticDetections"
              name="Deepfake Clones"
              stroke="#ef4444"
              fill="rgba(239, 68, 68, 0.25)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Grid: Signal Contribution Breakdown */}
      <div className={styles.twoColGrid}>
        <Card className={styles.signalCard}>
          <h3 className={styles.chartTitle}>Top Neural Threat Signal Contributions</h3>
          <span className={styles.chartSub}>Primary factors triggering high-risk alerts</span>
          <div className={styles.signalList}>
            {SIGNAL_DISTRIBUTION.map((sig) => (
              <div key={sig.signal} className={styles.signalRow}>
                <div className={styles.signalLabelRow}>
                  <span className={styles.sigName}>{sig.signal}</span>
                  <span className={styles.sigVal}>{sig.contribution}%</span>
                </div>
                <div className={styles.sigBarBg}>
                  <div className={styles.sigBarFill} style={{ width: `${sig.contribution}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className={styles.statSummaryCard}>
          <h3 className={styles.chartTitle}>Key Security Benchmarks</h3>
          <div className={styles.statItems}>
            <div className={styles.statBox}>
              <span className={styles.statVal}>99.4%</span>
              <span className={styles.statLbl}>Zero-shot Vocoder Detection Precision</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statVal}>120ms</span>
              <span className={styles.statLbl}>Average Real-time Inference Latency</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statVal}>9 Languages</span>
              <span className={styles.statLbl}>Hindi, Punjabi, Gujarati, Tamil + Global</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
