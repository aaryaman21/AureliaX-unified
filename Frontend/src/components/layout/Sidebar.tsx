import React from 'react';
import {
  LayoutDashboard,
  Mic,
  PhoneCall,
  Users,
  BarChart3,
  Settings,
  Shield,
  Layers,
} from 'lucide-react';
import styles from './Sidebar.module.css';

export type TabType = 'dashboard' | 'analyzer' | 'records' | 'contacts' | 'analytics' | 'settings';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const navItems = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analyzer' as TabType, label: 'Live Workbench', icon: Mic, badge: 'REALTIME' },
    { id: 'records' as TabType, label: 'Call Records', icon: PhoneCall },
    { id: 'contacts' as TabType, label: 'Contact Directory', icon: Users },
    { id: 'analytics' as TabType, label: 'Analytics', icon: BarChart3 },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className={styles.sidebar}>
      <nav className={styles.navGroup}>
        <div className={styles.sectionLabel}>CORE PLATFORM</div>
        {navItems.slice(0, 3).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <Icon size={19} className={styles.navIcon} />
              <span className={styles.navLabel}>{item.label}</span>
              {item.badge && <span className={styles.liveTag}>{item.badge}</span>}
            </button>
          );
        })}

        <div className={styles.sectionLabel} style={{ marginTop: '20px' }}>
          INTELLIGENCE & ADMIN
        </div>
        {navItems.slice(3).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <Icon size={19} className={styles.navIcon} />
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className={styles.footerCard}>
        <div className={styles.footerHeader}>
          <Shield size={16} className={styles.shieldIcon} />
          <span className={styles.footerTitle}>Engine Status</span>
        </div>
        <p className={styles.footerDesc}>v2.4 Synthetic Vocoder Detector</p>
        <div className={styles.langCountBadge}>
          <Layers size={12} />
          <span>9 Supported Languages</span>
        </div>
      </div>
    </aside>
  );
};
