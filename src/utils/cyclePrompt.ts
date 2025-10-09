import { addDays } from './dateUtils';
import { calculateCycleStats, calculateFertileWindow } from './cycleUtils';
import type { CycleData } from '../types';

const MS_IN_DAY = 24 * 60 * 60 * 1000;

type CyclePhase =
  | 'menstruation'
  | 'fertile'
  | 'ovulation'
  | 'pms'
  | 'delay'
  | 'neutral';

interface CyclePhaseResult {
  phase: CyclePhase;
  dayInPeriod?: number;
  periodLength?: number;
  daysUntilPeriod?: number;
  daysLate?: number;
}

interface CycleOccurrence {
  offset: number;
  date: Date;
  info: CyclePhaseResult;
}

const ORDINAL_WORDS: Record<number, string> = {
  1: 'первый',
  2: 'второй',
  3: 'третий',
  4: 'четвёртый',
  5: 'пятый',
  6: 'шестой',
  7: 'седьмой',
};

function normalize(date: Date): number {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized.getTime();
}

function toDate(input: Date | string): Date {
  if (typeof input === 'string') {
    return new Date(`${input}T00:00:00`);
  }
  return new Date(input);
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((normalize(end) - normalize(start)) / MS_IN_DAY);
}

function findLatestCycle(cycles: CycleData[], target: Date): CycleData | null {
  if (!cycles.length) {
    return null;
  }

  const targetMs = normalize(target);
  let latest: CycleData | null = null;
  let latestStartMs = Number.NEGATIVE_INFINITY;

  for (const cycle of cycles) {
    if (!cycle?.startDate) {
      continue;
    }
    const start = toDate(cycle.startDate);
    const startMs = normalize(start);
    if (Number.isNaN(startMs) || startMs > targetMs) {
      continue;
    }
    if (startMs > latestStartMs) {
      latestStartMs = startMs;
      latest = cycle;
    }
  }

  return latest;
}

function estimatePeriodLength(cycle: CycleData, defaultLength = 5): number {
  if (cycle.endDate) {
    const start = toDate(cycle.startDate);
    const end = toDate(cycle.endDate);
    const length = daysBetween(start, end) + 1;
    if (length > 0) {
      return Math.min(Math.max(length, 2), 8);
    }
  }
  return defaultLength;
}

function pluralizeDays(value: number): string {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) {
    return 'дней';
  }
  if (last === 1) {
    return 'день';
  }
  if (last >= 2 && last <= 4) {
    return 'дня';
  }
  return 'дней';
}

function getOrdinalWord(value: number): string {
  return ORDINAL_WORDS[value] ?? `${value}-й`;
}

function evaluateCyclePhase(cycles: CycleData[], target: Date): CyclePhaseResult | null {
  if (!cycles.length) {
    return null;
  }

  const normalizedTargetMs = normalize(target);
  const stats = calculateCycleStats(cycles);
  const fertileWindow = calculateFertileWindow(cycles);
  const latestCycle = findLatestCycle(cycles, target);

  if (latestCycle?.startDate) {
    const start = toDate(latestCycle.startDate);
    const offset = daysBetween(start, target);
    const periodLength = estimatePeriodLength(latestCycle);

    if (offset >= 0 && offset <= periodLength - 1) {
      return {
        phase: 'menstruation',
        dayInPeriod: offset + 1,
        periodLength,
      };
    }
  }

  if (fertileWindow) {
    const startMs = normalize(fertileWindow.fertileStart);
    const endMs = normalize(fertileWindow.fertileEnd);
    const ovulationMs = normalize(fertileWindow.ovulationDay);

    if (normalizedTargetMs >= startMs && normalizedTargetMs <= endMs) {
      if (normalizedTargetMs === ovulationMs) {
        return {
          phase: 'ovulation',
        };
      }
      return {
        phase: 'fertile',
      };
    }
  }

  if (stats.nextPrediction) {
    const nextPrediction = toDate(stats.nextPrediction);
    const daysUntilPeriod = daysBetween(target, nextPrediction);
    const daysLate = daysBetween(nextPrediction, target);

    if (daysUntilPeriod > 0 && daysUntilPeriod <= 4) {
      return {
        phase: 'pms',
        daysUntilPeriod,
      };
    }

    if (daysLate > 0 && daysLate <= 7) {
      return {
        phase: 'delay',
        daysLate,
      };
    }
  }

  return {
    phase: 'neutral',
  };
}

function describeSpan(startOffset: number, endOffset: number): string {
  const length = endOffset - startOffset + 1;
  if (length >= 5) {
    return 'почти всю неделю';
  }
  if (endOffset <= 1) {
    return 'в начале недели';
  }
  if (startOffset <= 1 && endOffset <= 3) {
    return 'в начале и середине недели';
  }
  if (startOffset >= 5) {
    return 'под конец недели';
  }
  if (startOffset >= 2 && endOffset <= 4) {
    return 'к середине недели';
  }
  if (startOffset >= 3 && endOffset >= 4) {
    return 'ближе к выходным';
  }
  return 'несколько дней';
}

function describeMoment(offset: number): string {
  if (offset <= 1) {
    return 'в начале недели';
  }
  if (offset <= 3) {
    return 'примерно к середине недели';
  }
  if (offset <= 5) {
    return 'ближе к выходным';
  }
  return 'под конец недели';
}

export function buildDailyCycleHint(cycles: CycleData[], isoDate: string): string | null {
  if (!cycles.length) {
    return null;
  }

  const target = toDate(isoDate);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const info = evaluateCyclePhase(cycles, target);
  if (!info) {
    return null;
  }

  switch (info.phase) {
    case 'menstruation': {
      const dayWord = getOrdinalWord(info.dayInPeriod ?? 1);
      return `сейчас идёт ${dayWord} день менструации — упомяни спазмы, усталость, желание завернуться в плед и чтобы её никто не трогал.`;
    }
    case 'ovulation':
      return 'сегодня самый пик овуляции — намекни на гормональный перегрев, скачок либидо и риск внезапных решений.';
    case 'fertile':
      return 'в разгаре фертильное окно — обыграй повышенный драйв, чувствительность и вечное «главное не залететь».';
    case 'pms': {
      const days = info.daysUntilPeriod ?? 1;
      return `до месячных примерно ${days} ${pluralizeDays(days)} — добавь ПМС, раздражение, тягу к углеводам и желание всех построить.`;
    }
    case 'delay': {
      const daysLate = info.daysLate ?? 1;
      return `менструация уже задерживается на ${daysLate} ${pluralizeDays(daysLate)} — подчеркни тревожность, навязчивые проверки симптомов и шёпот «сделай тест».`;
    }
    default:
      return 'цикл в относительно спокойной фазе — упомяни восстановление, привычную усталость и фоновый контроль настроения.';
  }
}

export function buildWeeklyCycleHint(cycles: CycleData[], isoDate: string): string | null {
  if (!cycles.length) {
    return null;
  }

  const startDate = toDate(isoDate);
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  const occurrencesMap = new Map<CyclePhase, CycleOccurrence[]>();

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(startDate, offset);
    const info = evaluateCyclePhase(cycles, date);
    if (!info || info.phase === 'neutral') {
      continue;
    }
    const list = occurrencesMap.get(info.phase) ?? [];
    list.push({ offset, date, info });
    occurrencesMap.set(info.phase, list);
  }

  if (occurrencesMap.size === 0) {
    return 'цикл на неделе идёт в спокойном режиме — подчеркни, что хотя бы гормоны дают передышку.';
  }

  const segments: string[] = [];

  const menstruationDays = occurrencesMap.get('menstruation');
  if (menstruationDays?.length) {
    const first = menstruationDays[0];
    const last = menstruationDays[menstruationDays.length - 1];
    segments.push(`менструация ещё держится ${describeSpan(first.offset, last.offset)} — вставь про грелки, обезболь и как она рвёт всех за спокойствие.`);
  }

  const fertileDays = occurrencesMap.get('fertile');
  if (fertileDays?.length) {
    const first = fertileDays[0];
    const last = fertileDays[fertileDays.length - 1];
    segments.push(`фертильное окно активничает ${describeSpan(first.offset, last.offset)} — намекни на повышенное либидо и страх незапланированных сюрпризов.`);
  }

  const ovulationDays = occurrencesMap.get('ovulation');
  if (ovulationDays?.length) {
    const day = ovulationDays[0];
    segments.push(`пик овуляции случится ${describeMoment(day.offset)} — добавь шутку про гормональный турбо-режим и попытку не взорваться.`);
  }

  const pmsDays = occurrencesMap.get('pms');
  if (pmsDays?.length) {
    const first = pmsDays[0];
    const last = pmsDays[pmsDays.length - 1];
    const days = last.info.daysUntilPeriod ?? first.info.daysUntilPeriod ?? 2;
    segments.push(`ПМС начнёт накрывать ${describeSpan(first.offset, last.offset)} — покажи, как она заедает стресс и строит всех вокруг, до месячных останется ~${days} ${pluralizeDays(days)}.`);
  }

  const delayDays = occurrencesMap.get('delay');
  if (delayDays?.length) {
    const day = delayDays[0];
    const daysLate = day.info.daysLate ?? 1;
    segments.push(`задержка будет висеть фоном ${describeMoment(day.offset)} — добавь тревожность, проверку календаря и сомнительные гугл-запросы (задержка уже ${daysLate} ${pluralizeDays(daysLate)}).`);
  }

  if (segments.length === 0) {
    return 'цикл на неделе без особых событий — можно позволить Насте слегка восстановиться без гормональных качелей.';
  }

  return segments.join(' ');
}

export function buildSergeyCycleHint(cycles: CycleData[], isoDate: string): string | null {
  if (!cycles.length) {
    return null;
  }

  const target = toDate(isoDate);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const info = evaluateCyclePhase(cycles, target);
  if (!info) {
    return null;
  }

  switch (info.phase) {
    case 'menstruation': {
      const dayWord = getOrdinalWord(info.dayInPeriod ?? 1);
      return `у Насти ${dayWord} день менструации — сделай акцент, что ей плохо, она слабая и раздражённая, а тебе, Серёже, лучше быть податливым и без претензий.`;
    }
    case 'ovulation':
      return 'у Насти пик овуляции — подчеркни её гипердрайв и твои попытки не довести дело до незапланированного третьего ребёнка.';
    case 'fertile':
      return 'у Насти активное фертильное окно — упомяни гормональные качели, твою паранойю про «залёт» и необходимость держать оборону.';
    case 'pms': {
      const days = info.daysUntilPeriod ?? 1;
      return `у Насти ПМС, до месячных около ${days} ${pluralizeDays(days)} — покажи, как она взрывается с полоборота, а ты тихо надеешься выжить без скандала.`;
    }
    case 'delay': {
      const late = info.daysLate ?? 1;
      return `месячные опаздывают уже на ${late} ${pluralizeDays(late)}, и Серёжа ходит с тестами в голове — добавь тревожность и желание всё контролировать.`;
    }
    default:
      return 'цикл у Насти сейчас спокойный — отметь, что хотя бы гормоны не штурмуют, но ты всё равно на стреме.';
  }
}
