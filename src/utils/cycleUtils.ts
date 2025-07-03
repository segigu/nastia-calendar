import { CycleData, CycleStats } from '../types';
import { addDays, diffInDays } from './dateUtils';

export const calculateCycleStats = (cycles: CycleData[]): CycleStats => {
  if (cycles.length === 0) {
    return {
      averageLength: 28,
      lastCycleLength: 0,
      cycleCount: 0,
      nextPrediction: addDays(new Date(), 28),
    };
  }

  const sortedCycles = [...cycles].sort((a, b) => 
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const cycleLengths: number[] = [];
  for (let i = 1; i < sortedCycles.length; i++) {
    const length = diffInDays(
      new Date(sortedCycles[i - 1].startDate),
      new Date(sortedCycles[i].startDate)
    );
    cycleLengths.push(length);
  }

  const averageLength = cycleLengths.length > 0 
    ? Math.round(cycleLengths.reduce((sum, length) => sum + length, 0) / cycleLengths.length)
    : 28;

  const lastCycleLength = cycleLengths.length > 0 ? cycleLengths[cycleLengths.length - 1] : 0;
  const lastCycleDate = new Date(sortedCycles[sortedCycles.length - 1].startDate);
  const nextPrediction = addDays(lastCycleDate, averageLength);

  return {
    averageLength,
    lastCycleLength,
    cycleCount: cycles.length,
    nextPrediction,
  };
};

export const isPredictedPeriod = (date: Date, cycles: CycleData[]): boolean => {
  const stats = calculateCycleStats(cycles);
  const daysDiff = diffInDays(date, stats.nextPrediction);
  return daysDiff <= 5; // 5 дней предполагаемого периода
};

export const isPastPeriod = (date: Date, cycles: CycleData[]): boolean => {
  return cycles.some(cycle => {
    const cycleDate = new Date(cycle.startDate);
    const daysDiff = diffInDays(date, cycleDate);
    return daysDiff <= 5; // 5 дней периода
  });
};

export const getDaysUntilNext = (cycles: CycleData[]): number => {
  const stats = calculateCycleStats(cycles);
  const today = new Date();
  const daysDiff = diffInDays(today, stats.nextPrediction);
  return Math.max(0, daysDiff);
};