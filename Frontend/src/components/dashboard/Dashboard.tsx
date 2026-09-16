import React, { useState, useMemo } from 'react';
import {
  Activity,
  ShieldAlert,
  ShieldCheck,
  Radio,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  Play,
  CheckCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Sector,
} from 'recharts';
import type { Call, RiskEvent } from '../../types';
import {
  compute7DayTrend,
  computeLanguageDistribution,
  computeAuthenticityRate,
} from '../../services/analyticsUtils';
import { RiskBadge } from '../ui/RiskBadge';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import styles from './Dashboard.module.css';

interface DashboardProps {
  calls: Call[];
  alerts: RiskEvent[];
  onNavigateToAnalyzer: () => void;
  onNavigateToRecords: () => void;
  onSelectCall: (call: Call) => void;
  onAcknowledgeAlert: (alertId: string) => void;
}

const PIE_COLORS = [
  '#38bdf8', // Electric Cyan
  '#2563eb', // Vivid Blue
  '#60a5fa', // Sky Blue
  '#0284c7', // Deep Sky
  '#06b6d4', // Cyan
  '#1d4ed8', // Dark Royal Blue
  '#93c5fd', // Light Ice Blue
  '#3b82f6', // Cobalt Blue
];

/** Custom active slice renderer for PieChart (explodes slice out on hover) */
const renderActiveSector = (props: any) => {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
    value,
  } = props;

  return (
    <g>
      {/* Center Donut Label */}
      <text x={cx} y={cy - 10} textAnchor="middle" fill="#f8fafc" fontSize={14} fontWeight={700}>
        {payload.language}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#38bdf8" fontSize={13} fontWeight={600}>
        {`${(percent * 100).toFixed(1)}% (${value} call${value === 1 ? '' : 's'})`}
      </text>

      {/* Exploded / Popped Out Sector Slice */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 4}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{ filter: `drop-shadow(0 0 12px ${fill})`, transition: 'all 0.3s ease' }}
      />

      {/* Outer Halo Accent Ring */}
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 14}
        outerRadius={outerRadius + 17}
        fill={fill}
      />
    </g>
  );
};

/** Detailed Custom Tooltip for 7-Day Bar Chart */
const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const safeCount = payload.find((p: any) => p.dataKey === 'safeCalls')?.value || 0;
    const synthCount = payload.find((p: any) => p.dataKey === 'syntheticDetections')?.value || 0;
    const total = safeCount + synthCount;
    const safePct = total > 0 ? ((safeCount / total) * 100).toFixed(1) : '100';
    const synthPct = total > 0 ? ((synthCount / total) * 100).toFixed(1) : '0';

    return (
      <div className={styles.customTooltipBox}>
        <div className={styles.tooltipHeader}>
          <span className={styles.tooltipDate}>{label} Stream Telemetry</span>
          <span className={styles.tooltipTotal}>{total} Evaluated</span>
        </div>

        <div className={styles.tooltipBody}>
          <div className={styles.tooltipRow}>
            <span className={styles.safeDot} />
            <span className={styles.tooltipLabel}>Authentic Human Voices:</span>
            <span className={styles.safeVal}>{safeCount} ({safePct}%)</span>
          </div>

          <div className={styles.tooltipRow}>
            <span className={styles.riskDot} />
            <span className={styles.tooltipLabel}>Deepfake Clones Blocked:</span>
            <span className={styles.riskVal}>{synthCount} ({synthPct}%)</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const Dashboard: React.FC<DashboardProps> = ({
  calls,
  alerts,
  onNavigateToAnalyzer,
  onNavigateToRecords,
  onSelectCall,
  onAcknowledgeAlert,
}) => {
  const [activePieIndex, setActivePieIndex] = useState<number | undefined>(undefined);
  const trendData = useMemo(() => compute7DayTrend(calls), [calls]);
  const languageData = useMemo(() => computeLanguageDistribution(calls), [calls]);
  const authStats = useMemo(() => computeAuthenticityRate(calls), [calls]);

  const highRiskCount = calls.filter((c) => c.riskLevel === 'HIGH_RISK').length;
  const suspiciousCount = calls.filter((c) => c.riskLevel === 'SUSPICIOUS').length;

  return (
    <div className={styles.container}>
      {/* Top Banner / Quick Action Hero */}
      <Card className={styles.heroCard}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <Radio size={14} className={styles.pulseIcon} />
            <span>REAL-TIME VOICE PROTECTION ACTIVE</span>
          </div>
          <h1 className={styles.heroTitle}>AureliaX Threat Telemetry Center</h1>
          <p className={styles.heroDesc}>
            Monitoring live voice streams across 9 Indian and international languages for synthetic vocoder clones, acoustic prosody anomalies, and identity spoofing.
          </p>
        </div>
        <div className={styles.heroActionArea}>
          <Button
            variant="primary"
            size="lg"
            onClick={onNavigateToAnalyzer}
            leftIcon={<Play size={18} />}
          >
            Launch Live Workbench
          </Button>
        </div>
      </Card>


      {/* KPI Cards Grid */}
      <div className={styles.kpiGrid}>
        <Card className={styles.kpiCard}>
          <div className={styles.kpiIconWrapper} style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <Activity size={22} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Total Calls Evaluated</span>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{calls.length}</span>
              <span className={styles.kpiTrend}>
                <TrendingUp size={12} /> Real-time
              </span>
            </div>
            <span className={styles.kpiSub}>Live audio logs in session</span>
            <span className={styles.kpiDetail}>
              {calls.length > 0
                ? `${calls.length} total stream${calls.length === 1 ? '' : 's'} verified and stored.`
                : 'No audio checks executed yet. Upload audio to begin.'}
            </span>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiIconWrapper} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
            <ShieldAlert size={22} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Deepfakes Intercepted</span>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{highRiskCount}</span>
              <span className={styles.kpiTrendDanger}>
                <ShieldAlert size={12} /> {highRiskCount > 0 ? 'High Alert' : 'Clean'}
              </span>
            </div>
            <span className={styles.kpiSub}>Blocked synthetic voice attacks</span>
            <span className={styles.kpiDetail}>Each block is retained for analyst review and audit.</span>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiIconWrapper} style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            <AlertTriangle size={22} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Suspicious Calls Flagged</span>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{suspiciousCount}</span>
              <span className={styles.kpiTrendWarn}>{suspiciousCount > 0 ? 'Pending Check' : 'Clear'}</span>
            </div>
            <span className={styles.kpiSub}>Requires out-of-band verification</span>
            <span className={styles.kpiDetail}>Prioritize these calls before their verification window closes.</span>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiIconWrapper} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <ShieldCheck size={22} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Voice Authenticity Rate</span>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{authStats.rate}</span>
              <span className={styles.kpiTrendSuccess}>Optimal</span>
            </div>
            <span className={styles.kpiSub}>Authentic vs synthetic streams</span>
            <span className={styles.kpiDetail}>
              {calls.length > 0
                ? `${authStats.safeCount} of ${calls.length} evaluated call${calls.length === 1 ? '' : 's'} verified human safe.`
                : 'Baseline authenticity benchmark active.'}
            </span>
          </div>
        </Card>
      </div>

      {/* Middle Grid: Recharts & Live Threat Feed */}
      <div className={styles.chartsGrid}>
        {/* Weekly Analysis Volume Chart */}
        <Card className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3 className={styles.chartTitle}>7-Day Call Integrity Trend</h3>
            <span className={styles.chartSub}>Safe vs Deepfake Detections</span>
          </div>
          <div className={styles.rechartsContainer}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={trendData}>
                <XAxis dataKey="date" stroke="var(--color-text-secondary)" fontSize={12} />
                <YAxis stroke="var(--color-text-secondary)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(56, 189, 248, 0.08)', radius: 6 }}
                  content={<CustomBarTooltip />}
                />
                <Bar
                  dataKey="safeCalls"
                  name="Safe Calls"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  activeBar={{ fill: '#34d399', stroke: '#a7f3d0', strokeWidth: 2 }}
                />
                <Bar
                  dataKey="syntheticDetections"
                  name="Deepfake Clones"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  activeBar={{ fill: '#f87171', stroke: '#fca5a5', strokeWidth: 2 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Language Distribution Donut */}
        <Card className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3 className={styles.chartTitle}>Language Distribution</h3>
            <span className={styles.chartSub}>Regional & Global Voice Telemetry</span>
          </div>
          {languageData.length === 0 ? (
            <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              <Radio size={26} color="#38bdf8" style={{ marginBottom: '8px', opacity: 0.8 }} />
              <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>No Language Telemetry Yet</div>
              <div>Run audio tests in Workbench to populate language distribution dynamically.</div>
            </div>
          ) : (
            <div className={styles.donutLayout}>
              <ResponsiveContainer width="60%" height={230}>
                <PieChart>
                  <Pie
                    {...({
                      activeIndex: activePieIndex,
                      activeShape: renderActiveSector,
                      onMouseEnter: (_data: any, index: number) => setActivePieIndex(index),
                      onMouseLeave: () => setActivePieIndex(undefined),
                    } as any)}
                    data={languageData}
                    dataKey="count"
                    nameKey="language"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={4}
                  >
                    {languageData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.donutLegend}>
                {languageData.slice(0, 5).map((item, idx) => (
                  <div
                    key={item.language}
                    className={`${styles.legendRow} ${
                      activePieIndex === idx ? styles.legendRowActive : ''
                    }`}
                    onMouseEnter={() => setActivePieIndex(idx)}
                    onMouseLeave={() => setActivePieIndex(undefined)}
                  >
                    <span
                      className={styles.colorDot}
                      style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                    <span className={styles.legendName}>{item.language}</span>
                    <span className={styles.legendValue}>{item.percentage}% ({item.count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Grid: Recent Alerts Feed & Call History Preview */}
      <div className={styles.bottomGrid}>
        {/* Recent Threat Alerts */}
        <Card className={styles.alertsCard}>
          <div className={styles.cardHeaderWithLink}>
            <h3 className={styles.cardSectionTitle}>Recent Threat Alerts</h3>
            <span className={styles.alertCountBadge}>{alerts.length} Pending</span>
          </div>
          <div className={styles.alertsList}>
            {alerts.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                <CheckCircle size={28} color="#10b981" style={{ marginBottom: '8px', opacity: 0.8 }} />
                <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>Zero Active Threat Alerts</div>
                <div>All monitored voice channels are clean. No deepfake attacks detected.</div>
              </div>
            ) : (
              alerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className={`${styles.alertItem} ${
                    alert.severity === 'HIGH_RISK' ? styles.highRiskAlertItem : styles.suspiciousAlertItem
                  }`}
                >
                  <div className={styles.alertIconCol}>
                    {alert.severity === 'HIGH_RISK' ? (
                      <ShieldAlert size={20} className={styles.dangerAlertIcon} />
                    ) : (
                      <AlertTriangle size={20} className={styles.warnAlertIcon} />
                    )}
                  </div>
                  <div className={styles.alertMainCol}>
                    <div className={styles.alertMetaRow}>
                      <span className={styles.alertType}>{alert.type.replace('_', ' ')}</span>
                      <span className={styles.alertTime}>{alert.timestamp}</span>
                    </div>
                    <p className={styles.alertMessage}>{alert.message}</p>
                  </div>
                  <div className={styles.alertActionCol}>
                    {!alert.acknowledged ? (
                      <button
                        className={styles.ackBtn}
                        onClick={() => onAcknowledgeAlert(alert.id)}
                      >
                        Acknowledge
                      </button>
                    ) : (
                      <span className={styles.ackDoneTag}>
                        <CheckCircle size={14} /> Resolved
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Analyzed Calls Table */}
        <Card className={styles.callsCard}>
          <div className={styles.cardHeaderWithLink}>
            <h3 className={styles.cardSectionTitle}>Recent Call Analyses</h3>
            <Button variant="ghost" size="sm" onClick={onNavigateToRecords} rightIcon={<ArrowUpRight size={14} />}>
              View All Records
            </Button>
          </div>
          <div className={styles.callsTableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Caller</th>
                  <th>Language</th>
                  <th>Risk Score</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {calls.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <Radio size={24} color="#38bdf8" style={{ opacity: 0.7 }} />
                        <span style={{ fontSize: '0.9rem', color: '#f8fafc', fontWeight: 500 }}>No Call Records Yet</span>
                        <span style={{ fontSize: '0.8rem', maxWidth: '300px' }}>
                          Upload audio or run live voice evaluations to log call telemetry here.
                        </span>
                        <Button variant="outline" size="sm" onClick={onNavigateToAnalyzer} style={{ marginTop: '6px' }}>
                          Run Voice Analysis
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  calls.slice(0, 4).map((call) => (
                    <tr key={call.id} className={styles.tableRow} onClick={() => onSelectCall(call)}>
                      <td>
                        <div className={styles.callerInfoCell}>
                          <span className={styles.callerName}>{call.caller}</span>
                          <span className={styles.callerPhone}>{call.callerPhone}</span>
                        </div>
                      </td>
                      <td>
                        <span className={styles.langPill}>{call.language}</span>
                      </td>
                      <td>
                        <RiskBadge score={call.riskScore} riskLevel={call.riskLevel} />
                      </td>
                      <td>
                        <span
                          className={`${styles.statusPill} ${
                            call.status === 'BLOCKED'
                              ? styles.statusBlocked
                              : styles.statusCompleted
                          }`}
                        >
                          {call.status}
                        </span>
                      </td>
                      <td>
                        <button className={styles.inspectBtn}>Inspect</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};
