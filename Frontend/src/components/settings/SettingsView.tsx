import React, { useState } from 'react';
import { Shield, Bell, Globe, Lock, Save, Check } from 'lucide-react';
import type { AppSettings, SupportedLanguage } from '../../types';
import { SUPPORTED_LANGUAGES } from '../../types';
import { INITIAL_SETTINGS } from '../../services/mockData';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import styles from './SettingsView.module.css';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [savedToast, setSavedToast] = useState(false);

  const handleToggleLang = (lang: SupportedLanguage) => {
    const currentLangs = settings.language.enabledAnalysisLanguages;
    const isEnabled = currentLangs.includes(lang);

    const updated = isEnabled
      ? currentLangs.filter((l) => l !== lang)
      : [...currentLangs, lang];

    setSettings({
      ...settings,
      language: { ...settings.language, enabledAnalysisLanguages: updated },
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <Card className={styles.headerCard}>
        <div className={styles.topRow}>
          <div>
            <h2 className={styles.pageTitle}>Security & Model Configuration</h2>
            <p className={styles.pageSub}>
              Adjust AI deepfake sensitivity thresholds, notification alerts, and active language inference models
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            leftIcon={savedToast ? <Check size={18} /> : <Save size={18} />}
          >
            {savedToast ? 'Configuration Saved!' : 'Save Settings'}
          </Button>
        </div>
      </Card>

      <form onSubmit={handleSave} className={styles.settingsGrid}>
        {/* Left Col: AI Sensitivity & Language Models */}
        <div className={styles.col}>
          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <Shield size={18} className={styles.sectionIcon} />
              <h3 className={styles.sectionTitle}>AI Risk & Detection Thresholds</h3>
            </div>

            <div className={styles.settingGroup}>
              <label className={styles.label}>Deepfake Risk Sensitivity Level</label>
              <div className={styles.sensitivityButtonGroup}>
                {(['LOW', 'MEDIUM', 'HIGH'] as const).map((sens) => (
                  <button
                    key={sens}
                    type="button"
                    className={`${styles.sensBtn} ${
                      settings.ai.riskSensitivity === sens ? styles.sensActive : ''
                    }`}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        ai: { ...settings.ai, riskSensitivity: sens },
                      })
                    }
                  >
                    {sens}
                  </button>
                ))}
              </div>
              <p className={styles.settingSub}>
                HIGH sensitivity flags subtle phase artifacts and micro-hesitations.
              </p>
            </div>

            <div className={styles.settingGroup}>
              <div className={styles.labelRow}>
                <label className={styles.label}>High Risk Auto-Alert Threshold</label>
                <span className={styles.sliderVal}>{settings.ai.alertThreshold}% Score</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                value={settings.ai.alertThreshold}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSettings({
                    ...settings,
                    ai: { ...settings.ai, alertThreshold: Number(e.target.value) },
                  })
                }
                className={styles.rangeInput}
              />
            </div>
          </Card>

          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <Globe size={18} className={styles.sectionIcon} />
              <h3 className={styles.sectionTitle}>Active Speech & Language Models</h3>
            </div>
            <p className={styles.sectionSub}>Select active neural language packs for real-time speech-to-text and acoustic analysis:</p>

            <div className={styles.langGrid}>
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isEnabled = settings.language.enabledAnalysisLanguages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    className={`${styles.langChip} ${isEnabled ? styles.langChipActive : ''}`}
                    onClick={() => handleToggleLang(lang)}
                  >
                    <span>{lang}</span>
                    {isEnabled && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Col: Account & Security */}
        <div className={styles.col}>
          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <Lock size={18} className={styles.sectionIcon} />
              <h3 className={styles.sectionTitle}>Security & Privacy Protocols</h3>
            </div>

            <div className={styles.settingGroup}>
              <Input
                label="Account Analyst Name"
                value={settings.account.fullName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSettings({
                    ...settings,
                    account: { ...settings.account, fullName: e.target.value },
                  })
                }
              />
            </div>

            <div className={styles.settingGroup}>
              <Input
                label="Security Operations Center Email"
                value={settings.account.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSettings({
                    ...settings,
                    account: { ...settings.account, email: e.target.value },
                  })
                }
              />
            </div>

            <div className={styles.toggleRow}>
              <div>
                <span className={styles.toggleTitle}>Enforce Multi-Factor Authentication (MFA)</span>
                <p className={styles.toggleDesc}>Require biometric hardware token for high-risk overrides</p>
              </div>
              <input
                type="checkbox"
                checked={settings.security.mfaEnabled}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSettings({
                    ...settings,
                    security: { ...settings.security, mfaEnabled: e.target.checked },
                  })
                }
                className={styles.checkbox}
              />
            </div>
          </Card>

          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <Bell size={18} className={styles.sectionIcon} />
              <h3 className={styles.sectionTitle}>Alert Notification Preferences</h3>
            </div>

            <div className={styles.toggleRow}>
              <div>
                <span className={styles.toggleTitle}>Instant Deepfake SMS/Push Alerts</span>
                <p className={styles.toggleDesc}>Trigger priority notification when synthetic score exceeds 70%</p>
              </div>
              <input
                type="checkbox"
                checked={settings.notifications.highRiskAlerts}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      highRiskAlerts: e.target.checked,
                    },
                  })
                }
                className={styles.checkbox}
              />
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
};
