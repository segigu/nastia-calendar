export interface CycleData {
  id: string;
  startDate: Date;
  endDate?: Date;
  notes?: string;
}

export interface CycleStats {
  averageLength: number;
  lastCycleLength: number;
  cycleCount: number;
  nextPrediction: Date;
}

export interface NastiaData {
  cycles: CycleData[];
  settings: {
    averageCycleLength: number;
    periodLength: number;
    notifications: boolean;
  };
}