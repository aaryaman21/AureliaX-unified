import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, LayoutDashboard, Mic, PhoneCall, Settings, Users } from 'lucide-react';
import type { TabType } from './Sidebar';
import styles from './CommandPalette.module.css';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: TabType) => void;
}

const commands: Array<{ tab: TabType; label: string; hint: string; icon: React.ElementType }> = [
  { tab: 'dashboard', label: 'Go to Dashboard', hint: 'Overview and telemetry', icon: LayoutDashboard },
  { tab: 'analyzer', label: 'Open Live Workbench', hint: 'Inspect a voice stream', icon: Mic },
  { tab: 'records', label: 'View Call Records', hint: 'Search analyzed calls', icon: PhoneCall },
  { tab: 'contacts', label: 'Open Contact Directory', hint: 'Known callers and contacts', icon: Users },
  { tab: 'analytics', label: 'Open Analytics', hint: 'Detection intelligence', icon: BarChart3 },
  { tab: 'settings', label: 'Open Settings', hint: 'Workspace preferences', icon: Settings },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const filteredCommands = useMemo(
    () => commands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectCommand = (tab: TabType) => {
    onNavigate(tab);
    onClose();
  };

  return (
    <div className={styles.backdrop} onMouseDown={onClose} role="presentation">
      <section className={styles.palette} onMouseDown={(event) => event.stopPropagation()} aria-label="Command palette">
        <div className={styles.searchRow}>
          <span className={styles.searchIcon}>⌕</span>
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jump to a workspace..." aria-label="Search commands" />
          <kbd>ESC</kbd>
        </div>
        <div className={styles.results}>
          {filteredCommands.map((command) => {
            const Icon = command.icon;
            return (
              <button key={command.tab} className={styles.command} onClick={() => selectCommand(command.tab)}>
                <span className={styles.commandIcon}><Icon size={17} /></span>
                <span><strong>{command.label}</strong><small>{command.hint}</small></span>
                <span className={styles.enterKey}>↵</span>
              </button>
            );
          })}
          {!filteredCommands.length && <p className={styles.empty}>No matching workspace.</p>}
        </div>
      </section>
    </div>
  );
};
