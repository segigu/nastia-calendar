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
  hasNewStory?: boolean; // Флаг для показа badge на "Узнай себя"
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
  hasNewStory,
}) => {
  return (
    <div className={styles.glassTabBarContainer}>
      <div className={styles.glassTabBarGradient} />
      <nav className={styles.glassTabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          // Кастомная иконка для вкладки "Циклы" - кружок с числом
          const tabIcon = tab.id === 'cycles' && cycleCount !== undefined && cycleCount > 0 ? (
            <div className={styles.cycleCountCircle}>
              <span className={styles.cycleCountNumber}>{cycleCount}</span>
            </div>
          ) : (
            tab.icon
          );

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`${styles.tabButton} ${isActive ? styles.active : ''}`}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className={styles.tabIcon}>
                {tabIcon}
                {/* Badge с цифрой для "Узнай себя" при новых сообщениях */}
                {tab.id === 'discover' && hasNewStory && !isActive && (
                  <span className={styles.notificationBadge}>1</span>
                )}
              </div>
              <div className={styles.tabLabel}>
                {tab.label}
              </div>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
