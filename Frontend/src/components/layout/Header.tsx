import React, { useEffect, useState } from 'react';
import { Bell, ShieldAlert, Activity, User, Radio, Sun, Moon, Command, ChevronDown } from 'lucide-react';
import type { RiskEvent } from '../../types';
import type { TabType } from './Sidebar';
import { useTheme } from '../../context/ThemeContext';
import { CommandPalette } from './CommandPalette';
import styles from './Header.module.css';

interface HeaderProps {
  activeCallsCount: number;
  unreadNotificationsCount: number;
  latestAlert?: RiskEvent;
  onOpenNotifications: () => void;
  onOpenLiveAnalyzer: () => void;
  onNavigate: (tab: TabType) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeCallsCount,
  unreadNotificationsCount,
  latestAlert,
  onOpenNotifications,
  onOpenLiveAnalyzer,
  onNavigate,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isAlertExpanded, setIsAlertExpanded] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className={styles.header}>
      <div className={styles.brandGroup}>
        <div className={styles.logoBadge} onClick={onOpenLiveAnalyzer}>
          <Radio className={styles.radarIcon} size={22} />
          <span className={styles.brandTitle}>AureliaX</span>
          <span className={styles.brandTag}>AI VOICE INTEGRITY</span>
        </div>

        <div className={styles.systemStatus} title="Live telemetry status">
          <span className={styles.statusDot}></span>
          <span className={styles.statusText}>Live telemetry</span>
          <strong className={styles.statusMetric}>{activeCallsCount} streams</strong>
          <span className={styles.statusCadence}>0.8s cycle</span>
        </div>
      </div>

      {latestAlert && !latestAlert.acknowledged && (
        <div className={`${styles.emergencyBanner} ${isAlertExpanded ? styles.alertExpanded : ''}`}>
          <button className={styles.alertSummary} onClick={() => setIsAlertExpanded((expanded) => !expanded)} aria-expanded={isAlertExpanded}>
          <ShieldAlert className={styles.alertPulseIcon} size={18} />
          <span className={styles.bannerText}>{latestAlert.message}</span>
            <ChevronDown size={15} className={styles.alertChevron} />
          </button>
          {isAlertExpanded && <div className={styles.alertDetail}><span>Confidence signal requires analyst review.</span><button className={styles.bannerActionBtn} onClick={onOpenLiveAnalyzer}>Inspect live</button></div>}
        </div>
      )}

      <div className={styles.rightGroup}>
        <button
          className={styles.liveMonitorPill}
          onClick={onOpenLiveAnalyzer}
          title="Open Real-time Audio Analyzer"
        >
          <Activity size={16} className={styles.activityIcon} />
          <span>Live Workbench</span>
          {activeCallsCount > 0 && (
            <span className={styles.callBadge}>{activeCallsCount} Active</span>
          )}
        </button>

        <button className={styles.commandTrigger} onClick={() => setIsCommandPaletteOpen(true)} title="Open command palette (Ctrl/Cmd + K)">
          <Command size={15} /> <span>Command</span><kbd>⌘K</kbd>
        </button>

        <button
          className={styles.iconBtn}
          onClick={toggleTheme}
          aria-label="Toggle Theme"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button
          className={styles.iconBtn}
          onClick={onOpenNotifications}
          aria-label="Notifications"
        >
          <Bell size={20} />
          {unreadNotificationsCount > 0 && (
            <span className={styles.notifBadge}>{unreadNotificationsCount}</span>
          )}
        </button>

        <div className={styles.userProfile}>
          <div className={styles.avatar}>
            <User size={18} />
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>Aaryaman Singh</span>
            <span className={styles.userRole}>Security Analyst</span>
          </div>
        </div>
      </div>
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} onNavigate={onNavigate} />
    </header>
  );
};
