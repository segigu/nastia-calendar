import { CycleData, CycleStats, FertileWindow } from '../types';
import { addDays, diffInDays } from './dateUtils';

// Вычисление стандартного отклонения
const calculateStdDev = (values: number[]): number => {
  if (values.length === 0) return 0;
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
};

// Вычисление линейного тренда (метод наименьших квадратов)
const calculateTrend = (values: number[]): number => {
  if (values.length < 2) return 0;

  const n = values.length;
  const xValues = Array.from({ length: n }, (_, i) => i);
  const xSum = xValues.reduce((sum, x) => sum + x, 0);
  const ySum = values.reduce((sum, y) => sum + y, 0);
  const xySum = xValues.reduce((sum, x, i) => sum + x * values[i], 0);
  const x2Sum = xValues.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
  return slope;
};

export const calculateCycleStats = (cycles: CycleData[]): CycleStats => {
  if (cycles.length === 0) {
    return {
      averageLength: 28,
      lastCycleLength: 0,
      cycleCount: 0,
      nextPrediction: addDays(new Date(), 28),
      averageLength6Months: 28,
      variability: 0,
      trend: 0,
      predictionConfidence: 0,
    };
  }

  const sortedCycles = [...cycles].sort((a, b) =>
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  // Вычисление длин всех циклов
  const cycleLengths: number[] = [];
  for (let i = 1; i < sortedCycles.length; i++) {
    const length = diffInDays(
      new Date(sortedCycles[i - 1].startDate),
      new Date(sortedCycles[i].startDate)
    );
    cycleLengths.push(length);
  }

  // Циклы за последние 6 месяцев
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recentCycles = sortedCycles.filter(cycle =>
    new Date(cycle.startDate) >= sixMonthsAgo
  );

  const recentLengths: number[] = [];
  for (let i = 1; i < recentCycles.length; i++) {
    const length = diffInDays(
      new Date(recentCycles[i - 1].startDate),
      new Date(recentCycles[i].startDate)
    );
    recentLengths.push(length);
  }

  const averageLength = cycleLengths.length > 0
    ? Math.round(cycleLengths.reduce((sum, length) => sum + length, 0) / cycleLengths.length)
    : 28;

  const averageLength6Months = recentLengths.length > 0
    ? Math.round(recentLengths.reduce((sum, length) => sum + length, 0) / recentLengths.length)
    : averageLength;

  const variability = calculateStdDev(recentLengths.length > 0 ? recentLengths : cycleLengths);

  // Тренд на основе последних 3-6 циклов
  const trendCycles = cycleLengths.slice(-6);
  const trend = calculateTrend(trendCycles);

  // Уверенность прогноза (выше при меньшей вариативности и большем количестве данных)
  let predictionConfidence = 0;
  if (recentLengths.length >= 3) {
    const baseConfidence = Math.min(recentLengths.length * 15, 70); // До 70% за данные
    const variabilityPenalty = Math.min(variability * 5, 30); // До -30% за вариативность
    predictionConfidence = Math.max(0, Math.min(100, baseConfidence - variabilityPenalty));
  }

  const lastCycleLength = cycleLengths.length > 0 ? cycleLengths[cycleLengths.length - 1] : 0;
  const lastCycleDate = new Date(sortedCycles[sortedCycles.length - 1].startDate);
  const nextPrediction = addDays(lastCycleDate, averageLength6Months || averageLength);

  return {
    averageLength,
    lastCycleLength,
    cycleCount: cycles.length,
    nextPrediction,
    averageLength6Months,
    variability: Math.round(variability * 10) / 10,
    trend: Math.round(trend * 100) / 100,
    predictionConfidence: Math.round(predictionConfidence),
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

// Расчет фертильного окна и дня овуляции
export const calculateFertileWindow = (cycles: CycleData[]): FertileWindow | null => {
  if (cycles.length === 0) return null;

  const stats = calculateCycleStats(cycles);

  // Овуляция обычно происходит за 14 дней до следующих месячных
  const ovulationDay = addDays(stats.nextPrediction, -14);

  // Фертильное окно: 5 дней до овуляции + день овуляции
  const fertileStart = addDays(ovulationDay, -5);
  const fertileEnd = ovulationDay;

  return {
    ovulationDay,
    fertileStart,
    fertileEnd,
  };
};

// Проверка, является ли день фертильным
export const isFertileDay = (date: Date, cycles: CycleData[]): boolean => {
  const fertileWindow = calculateFertileWindow(cycles);
  if (!fertileWindow) return false;

  const dateTime = date.getTime();
  return dateTime >= fertileWindow.fertileStart.getTime() &&
         dateTime <= fertileWindow.fertileEnd.getTime();
};

// Проверка, является ли день овуляцией
export const isOvulationDay = (date: Date, cycles: CycleData[]): boolean => {
  const fertileWindow = calculateFertileWindow(cycles);
  if (!fertileWindow) return false;

  return diffInDays(date, fertileWindow.ovulationDay) === 0;
};
