export type MoodLevel = 'good' | 'neutral' | 'bad';
export type PainLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface DayData {
  date: string; // ISO date string
  painLevel?: PainLevel;
  mood?: MoodLevel;
  notes?: string;
}

export interface CycleData {
  id: string;
  startDate: Date;
  endDate?: Date;
  notes?: string;
  days?: DayData[]; // Данные по каждому дню цикла
}

export type HoroscopeMemorySource = 'daily' | 'weekly' | 'sergey';

export interface HoroscopeMemoryEntry {
  id: string;
  source: HoroscopeMemorySource;
  date: string; // ISO date
  summary: string;
  keyThemes: string[];
  avoidPhrases: string[];
  tone: 'positive' | 'neutral' | 'negative' | 'mixed';
  createdAt: string; // ISO timestamp
}

export interface PsychContractUsageEntry {
  id: string;
  usedAt: string;
}

export interface PsychScenarioUsageEntry {
  contractId: string;
  scenarioId: string;
  usedAt: string;
}

export interface PsychContractHistory {
  contracts: PsychContractUsageEntry[];
  scenarios: PsychScenarioUsageEntry[];
}

export interface CycleStats {
  averageLength: number;
  lastCycleLength: number;
  cycleCount: number;
  nextPrediction: Date;
  // Расширенная статистика
  averageLength6Months: number;
  variability: number; // Стандартное отклонение
  trend: number; // Положительный = увеличение, отрицательный = уменьшение
  predictionConfidence: number; // 0-100%
}

export interface FertileWindow {
  ovulationDay: Date;
  fertileStart: Date;
  fertileEnd: Date;
}

// Discover Tab (Узнай себя) state
// Импортируем тип сообщения из chat.ts для совместимости
import type { ChatMessage, ChatPhase } from './chat';

export interface DiscoverTabState {
  isStarted: boolean;
  phase: ChatPhase | null;
  messages: ChatMessage[];
  storyMeta: {
    author: string;
    title: string;
    genre: string;
    moonSummary: string;
    arcLimit: number;
    contract: string;
  } | null;
  currentArc: number;
  storySegments: Array<{
    text: string;
    arc: number;
    optionTitle?: string;
    optionDescription?: string;
  }>;
  choices: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  finaleInterpretations: {
    human: string;
    astrological: string;
  } | null;
  finaleInterpretationMode: 'human' | 'astrological';
  hasUnreadChoices: boolean; // Флаг для badge
  lastUpdated: string; // ISO timestamp
}

export interface NastiaData {
  cycles: CycleData[];
  settings: {
    averageCycleLength: number;
    periodLength: number;
    notifications: boolean;
  };
  horoscopeMemory?: HoroscopeMemoryEntry[];
  psychContractHistory?: PsychContractHistory;
  discoverTabState?: DiscoverTabState;
}

export type NotificationCategory =
  | 'fertile_window'
  | 'ovulation_day'
  | 'period_forecast'
  | 'period_start'
  | 'period_check'
  | 'period_waiting'
  | 'period_delay_warning'
  | 'period_confirmed_day0'
  | 'period_confirmed_day1'
  | 'period_confirmed_day2'
  | 'birthday'
  | 'morning_brief'
  | 'generic';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  sentAt: string; // ISO timestamp
  type: NotificationCategory;
  url?: string;
}
