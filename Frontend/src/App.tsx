import { useState } from 'react';
import type { Call, Notification, RiskEvent } from './types';
import { MOCK_CALLS, MOCK_NOTIFICATIONS, MOCK_RISK_EVENTS } from './services/mockData';
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
  const [calls, setCalls] = useState<Call[]>(MOCK_CALLS);
  const [alerts, setAlerts] = useState<RiskEvent[]>(MOCK_RISK_EVENTS);
  const [notifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);

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
              <LiveAnalyzer onCallAnalyzed={handleCallAnalyzed} />
            )}

            {activeTab === 'records' && (
              <CallRecords calls={calls} onSelectCall={(c) => setSelectedCall(c)} />
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
          />
        )}
      </div>
    </>
  );
}

export default App;
