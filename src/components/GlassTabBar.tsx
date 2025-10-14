import React from 'react';
import { Calendar, Activity, Sparkles, Settings } from 'lucide-react';
import styles from './GlassTabBar.module.css';

export type TabId = 'calendar' | 'cycles' | 'discover' | 'settings';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

interface GlassTabBarProps {
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
  cycleCount?: number;
}

const tabs: Tab[] = [
  {
    id: 'calendar',
    label: 'Календарь',
    icon: <Calendar size={24} />,
  },
  {
    id: 'cycles',
    label: 'Циклы',
    icon: <Activity size={24} />,
  },
  {
    id: 'discover',
    label: 'Узнай себя',
    icon: <Sparkles size={24} />,
  },
  {
    id: 'settings',
    label: 'Настройки',
    icon: <Settings size={24} />,
  },
];

export const GlassTabBar: React.FC<GlassTabBarProps> = ({
  activeTab,
  onTabChange,
  cycleCount,
}) => {
  return (
    <div className={styles.glassTabBarContainer}>
      <div className={styles.glassTabBarGradient} />
      <nav className={styles.glassTabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`${styles.tabButton} ${isActive ? styles.active : ''}`}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className={styles.tabIcon}>{tab.icon}</div>
              <div className={styles.tabLabel}>
                {tab.label}
                {tab.id === 'cycles' && cycleCount !== undefined && cycleCount > 0 && (
                  <span className={styles.badge}>{cycleCount}</span>
                )}
              </div>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
