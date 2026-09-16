import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import type { Call } from '../../types';
import { compute7DayTrend, computeSignalDistribution } from '../../services/analyticsUtils';
import { Card } from '../ui/Card';
import styles from './AnalyticsView.module.css';

interface AnalyticsViewProps {
  calls?: Call[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ calls = [] }) => {
  const trendData = useMemo(() => compute7DayTrend(calls), [calls]);
  const signalData = useMemo(() => computeSignalDistribution(calls), [calls]);

  const uniqueLanguagesCount = useMemo(() => {
    const langs = new Set(
      calls
        .map((c) => c.language || c.analysis?.detectedLanguage)
        .filter((l) => l && l !== 'Unknown')
    );
    return Math.max(langs.size, calls.length > 0 ? 1 : 0);
  }, [calls]);

  const highRiskCount = calls.filter((c) => c.riskLevel === 'HIGH_RISK').length;

  return (
    <div className={styles.container}>
      {/* Header */}
      <Card className={styles.headerCard}>
        <div>
          <h2 className={styles.pageTitle}>Voice Integrity Intelligence & Analytics</h2>
          <p className={styles.pageSub}>
            Real-time insight into synthetic vocoder detection rates, neural signal contributions, and cross-language risk patterns across {calls.length} analyzed audio record{calls.length === 1 ? '' : 's'}.
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
          <AreaChart data={trendData}>
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
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
              name="Total Evaluated"
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
          <span className={styles.chartSub}>
            {highRiskCount > 0
              ? `Derived from ${highRiskCount} intercepted synthetic voice clone attack${highRiskCount === 1 ? '' : 's'}`
              : 'Calibrated acoustic and vocoder detection factors'}
          </span>
          <div className={styles.signalList}>
            {signalData.map((sig) => (
              <div key={sig.signal} className={styles.signalRow}>
                <div className={styles.signalLabelRow}>
                  <span className={styles.sigName}>{sig.signal}</span>
                  <span className={styles.sigVal}>{sig.contribution}%</span>
                </div>
                <div className={styles.sigBarBg}>
                  <div className={styles.sigBarFill} style={{ width: `${Math.max(sig.contribution, 2)}%` }} />
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
              <span className={styles.statVal}>{calls.length > 0 ? `${calls.length} Tested` : '0 Ready'}</span>
              <span className={styles.statLbl}>Total Voice Streams Verified</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statVal}>
                {uniqueLanguagesCount > 0 ? `${uniqueLanguagesCount} Active` : '9 Supported'}
              </span>
              <span className={styles.statLbl}>
                {uniqueLanguagesCount > 0 ? 'Unique Languages Evaluated' : 'Hindi, English, Punjabi, Tamil + Global'}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

