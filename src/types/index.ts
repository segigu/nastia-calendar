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

export interface NastiaData {
  cycles: CycleData[];
  settings: {
    averageCycleLength: number;
    periodLength: number;
    notifications: boolean;
  };
}

export type NotificationCategory = 'fertile_window' | 'ovulation_day' | 'period_forecast' | 'period_start' | 'generic';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  sentAt: string; // ISO timestamp
  type: NotificationCategory;
}
