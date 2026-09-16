import React, { useState } from 'react';
import { Search, Download, Eye, RotateCcw, FileAudio, Play } from 'lucide-react';
import type { Call } from '../../types';
import { RiskBadge } from '../ui/RiskBadge';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { CallDetailModal } from './CallDetailModal';
import styles from './CallRecords.module.css';

interface CallRecordsProps {
  calls: Call[];
  onSelectCall: (call: Call) => void;
  onRetestCall?: (call: Call) => void;
  onNavigateToAnalyzer?: () => void;
}

export const CallRecords: React.FC<CallRecordsProps> = ({
  calls,
  onSelectCall,
  onRetestCall,
  onNavigateToAnalyzer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [languageFilter, setLanguageFilter] = useState<string>('ALL');
  const [selectedCallForModal, setSelectedCallForModal] = useState<Call | null>(null);

  const filteredCalls = calls.filter((c) => {
    const matchesSearch =
      c.caller.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.callerPhone && c.callerPhone.includes(searchQuery)) ||
      (c.fileName && c.fileName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRisk = riskFilter === 'ALL' || c.riskLevel === riskFilter;
    const matchesLang = languageFilter === 'ALL' || c.language === languageFilter;
    return matchesSearch && matchesRisk && matchesLang;
  });

  const handleRowClick = (call: Call) => {
    setSelectedCallForModal(call);
    onSelectCall(call);
  };

  const handleRetestClick = (e: React.MouseEvent, call: Call) => {
    e.stopPropagation();
    if (onRetestCall) {
      onRetestCall(call);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header & Filter Card */}
      <Card className={styles.headerCard}>
        <div className={styles.topRow}>
          <div>
            <h2 className={styles.pageTitle}>Voice Analysis Records</h2>
            <p className={styles.pageSub}>
              Historical log of evaluated voice calls, acoustic payloads, and deepfake verification results
            </p>
          </div>
          <Button variant="outline" size="sm" leftIcon={<Download size={16} />}>
            Export Audit Log (.CSV)
          </Button>
        </div>

        <div className={styles.filterGrid}>
          <div className={styles.searchWrapper}>
            <Input
              placeholder="Search by caller, phone number, or call ID..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>

          <div className={styles.selectGroup}>
            <label className={styles.selectLabel}>Risk Level:</label>
            <select
              className={styles.selectInput}
              value={riskFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRiskFilter(e.target.value)}
            >
              <option value="ALL">All Risk Levels</option>
              <option value="HIGH_RISK">High Risk (Deepfake)</option>
              <option value="SUSPICIOUS">Suspicious</option>
              <option value="SAFE">Safe</option>
            </select>
          </div>

          <div className={styles.selectGroup}>
            <label className={styles.selectLabel}>Language:</label>
            <select
              className={styles.selectInput}
              value={languageFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLanguageFilter(e.target.value)}
            >
              <option value="ALL">All Languages</option>
              <option value="Hindi">Hindi</option>
              <option value="Punjabi">Punjabi</option>
              <option value="Gujarati">Gujarati</option>
              <option value="Kannada">Kannada</option>
              <option value="Tamil">Tamil</option>
              <option value="Telugu">Telugu</option>
              <option value="English">English</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table Card */}
      <Card className={styles.tableCard}>
        <div className={styles.tableHeaderRow}>
          <span className={styles.recordsCount}>{filteredCalls.length} Records Found</span>
        </div>

        {filteredCalls.length === 0 ? (
          <div className={styles.emptyState}>
            <FileAudio size={48} className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>No Audio Test Records Found</h3>
            <p className={styles.emptyDesc}>
              No audio records matching your query. Analyze an audio file or stream in the Live Workbench to record and inspect test logs.
            </p>
            {onNavigateToAnalyzer && (
              <Button variant="primary" size="sm" onClick={onNavigateToAnalyzer} leftIcon={<Play size={15} />}>
                Launch Live Workbench
              </Button>
            )}
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Call / Audio Log</th>
                  <th>Caller Details</th>
                  <th>Start Time</th>
                  <th>Language</th>
                  <th>Audio Preview</th>
                  <th>Risk Score</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCalls.map((call) => (
                  <tr
                    key={call.id}
                    className={styles.tableRow}
                    onClick={() => handleRowClick(call)}
                  >
                    <td className={styles.callIdCell}>{call.fileName || call.id}</td>
                    <td>
                      <div className={styles.callerCell}>
                        <span className={styles.callerName}>{call.caller}</span>
                        <span className={styles.callerPhone}>{call.callerPhone || 'Unlisted'}</span>
                      </div>
                    </td>
                    <td className={styles.timeCell}>{call.startTime}</td>
                    <td>
                      <span className={styles.langBadge}>{call.language}</span>
                    </td>
                    <td>
                      {call.audioUrl ? (
                        <audio
                          controls
                          src={call.audioUrl}
                          className={styles.audioMiniPlayer}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className={styles.sourceBadge}>{call.audioSource}</span>
                      )}
                    </td>
                    <td>
                      <RiskBadge score={call.riskScore} riskLevel={call.riskLevel} />
                    </td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          call.status === 'BLOCKED'
                            ? styles.statusBlocked
                            : styles.statusCompleted
                        }`}
                      >
                        {call.status}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionGroup}>
                        {onRetestCall && (call.audioUrl || call.fileName) && (
                          <button
                            className={styles.retestBtn}
                            onClick={(e) => handleRetestClick(e, call)}
                            title="Re-run VoiceShield detection with current model"
                          >
                            <RotateCcw size={13} /> Re-test
                          </button>
                        )}
                        <button className={styles.inspectBtn} title="Inspect Full Payload">
                          <Eye size={14} /> Inspect
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      <CallDetailModal
        call={selectedCallForModal}
        onClose={() => setSelectedCallForModal(null)}
      />
    </div>
  );
};
