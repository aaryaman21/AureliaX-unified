import { useState, useEffect } from 'react';
import type { Call, Notification, RiskEvent } from './types';
import { MOCK_NOTIFICATIONS } from './services/mockData';
import { fetchAudioLogs } from './services/voiceShieldApi';
import { formatAudioLogToCall } from './services/analysisService';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import type { TabType } from './components/layout/Sidebar';
import { Dashboard } from './components/dashboard/Dashboard';
import { LiveAnalyzer } from './components/analysis/LiveAnalyzer';
import { CallRecords } from './components/records/CallRecords';
import { ContactsView } from './components/contacts/ContactsView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { SettingsView } from './components/settings/SettingsView';
import { CallDetailModal } from './components/records/CallDetailModal';
import { JarvisLoader } from './components/ui/JarvisLoader';
import { NeuralBrainCanvas } from './components/ui/NeuralBrainCanvas';

import { ThemeProvider } from './context/ThemeContext';

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [calls, setCalls] = useState<Call[]>([]);
  const [alerts, setAlerts] = useState<RiskEvent[]>([]);
  const [notifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [audioToRetest, setAudioToRetest] = useState<{ url: string; filename: string } | null>(null);

  // Load real saved audio logs from the backend on initial application mount
  useEffect(() => {
    fetchAudioLogs()
      .then((logs) => {
        if (logs && logs.length > 0) {
          const loadedCalls = logs.map(formatAudioLogToCall);
          setCalls(loadedCalls);

          // Populate alert feed with any high risk deepfakes from test history
          const highRiskAlerts: RiskEvent[] = loadedCalls
            .filter((c) => c.riskLevel === 'HIGH_RISK')
            .map((c) => ({
              id: `evt-${c.id}`,
              callId: c.id,
              timestamp: c.startTime,
              type: 'SYNTHETIC_VOICE',
              severity: 'HIGH_RISK',
              message: `High risk deepfake clone detected (${c.riskScore}% score) in test audio "${c.fileName || c.caller}".`,
              acknowledged: true,
            }));
          setAlerts(highRiskAlerts);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch saved audio logs on start:', err);
      });
  }, []);

  const activeCallsCount = calls.filter((c) => c.status === 'ACTIVE').length;
  const unreadNotifsCount = notifications.filter((n) => !n.read).length;
  const latestAlert = alerts.find((a) => !a.acknowledged);

  const handleCallAnalyzed = (newCall: Call) => {
    setCalls((prev) => [newCall, ...prev]);

    if (newCall.riskLevel === 'HIGH_RISK') {
      const newAlert: RiskEvent = {
        id: `evt-${Date.now()}`,
        callId: newCall.id,
        timestamp: newCall.startTime,
        type: 'SYNTHETIC_VOICE',
        severity: 'HIGH_RISK',
        message: `High risk deepfake clone detected (${newCall.riskScore}% score) on line from ${newCall.caller}.`,
        acknowledged: false,
      };
      setAlerts((prev) => [newAlert, ...prev]);
    }
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
    );
  };

  const handleRetestCall = (call: Call) => {
    if (call.audioUrl) {
      setAudioToRetest({
        url: call.audioUrl,
        filename: call.fileName || call.caller,
      });
      setSelectedCall(null);
      setActiveTab('analyzer');
    }
  };

  return (
    <>
      {isLoading && (
        <JarvisLoader
          durationMs={3000}
          onComplete={() => setIsLoading(false)}
        />
      )}

      {/* Subtle Background Neural Brain Structure Canvas */}
      <NeuralBrainCanvas />

      <div className="app-layout">
        <Header
          activeCallsCount={activeCallsCount}
          unreadNotificationsCount={unreadNotifsCount}
          latestAlert={latestAlert}
          onOpenNotifications={() => setActiveTab('dashboard')}
          onOpenLiveAnalyzer={() => setActiveTab('analyzer')}
          onNavigate={setActiveTab}
        />

        <Sidebar activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />

        <div className="app-content">
          <main className="page-content">
            {activeTab === 'dashboard' && (
              <Dashboard
                calls={calls}
                alerts={alerts}
                onNavigateToAnalyzer={() => setActiveTab('analyzer')}
                onNavigateToRecords={() => setActiveTab('records')}
                onSelectCall={(c) => setSelectedCall(c)}
                onAcknowledgeAlert={handleAcknowledgeAlert}
              />
            )}

            {activeTab === 'analyzer' && (
              <LiveAnalyzer
                onCallAnalyzed={handleCallAnalyzed}
                audioToRetest={audioToRetest}
                onClearAudioToRetest={() => setAudioToRetest(null)}
              />
            )}

            {activeTab === 'records' && (
              <CallRecords
                calls={calls}
                onSelectCall={(c) => setSelectedCall(c)}
                onRetestCall={handleRetestCall}
                onNavigateToAnalyzer={() => setActiveTab('analyzer')}
              />
            )}

            {activeTab === 'contacts' && <ContactsView />}

            {activeTab === 'analytics' && <AnalyticsView />}

            {activeTab === 'settings' && <SettingsView />}
          </main>
        </div>

        {selectedCall && (
          <CallDetailModal
            call={selectedCall}
            onClose={() => setSelectedCall(null)}
            onRetest={handleRetestCall}
          />
        )}
      </div>
    </>
  );
}

export default App;
