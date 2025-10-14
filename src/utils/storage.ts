import {
  type HoroscopeMemoryEntry,
  type PsychContractHistory,
  NastiaData,
} from '../types';

const STORAGE_KEY = 'nastia-app-data';
export const MAX_HISTORY_CONTRACT_RECORDS = 10;
export const MAX_HISTORY_SCENARIO_RECORDS = 30;
export const MAX_HISTORY_SCENARIOS_PER_CONTRACT = 5;
const EMPTY_HISTORY: PsychContractHistory = {
  contracts: [],
  scenarios: [],
};

export const saveData = (data: NastiaData): void => {
  try {
    const existing = loadData();
    const mergedHistory = normalizePsychContractHistory(
      data.psychContractHistory ?? existing?.psychContractHistory ?? EMPTY_HISTORY,
    );
    const payload: NastiaData = {
      ...data,
      psychContractHistory: mergedHistory,
    };
    const serializedData = JSON.stringify(payload);
    localStorage.setItem(STORAGE_KEY, serializedData);
  } catch (error) {
    console.error('Ошибка при сохранении данных:', error);
  }
};

export const loadData = (): NastiaData | null => {
  try {
    const serializedData = localStorage.getItem(STORAGE_KEY);
    if (serializedData === null) {
      return null;
    }
    const data = JSON.parse(serializedData);
    
    // Преобразуем строки дат обратно в Date объекты
    data.cycles = data.cycles.map((cycle: any) => ({
      ...cycle,
      startDate: new Date(cycle.startDate),
      endDate: cycle.endDate ? new Date(cycle.endDate) : undefined,
    }));

    data.horoscopeMemory = normalizeHoroscopeMemory(data.horoscopeMemory);
    data.psychContractHistory = normalizePsychContractHistory(data.psychContractHistory);
    
    return data;
  } catch (error) {
    console.error('Ошибка при загрузке данных:', error);
    return null;
  }
};

export const exportData = (data: NastiaData): string => {
  const payload: NastiaData = {
    ...data,
    horoscopeMemory: normalizeHoroscopeMemory(data.horoscopeMemory),
    psychContractHistory: normalizePsychContractHistory(data.psychContractHistory),
  };
  return JSON.stringify(payload, null, 2);
};

export const importData = (jsonString: string): NastiaData => {
  const data = JSON.parse(jsonString);
  
  // Преобразуем строки дат в Date объекты
  data.cycles = data.cycles.map((cycle: any) => ({
    ...cycle,
    startDate: new Date(cycle.startDate),
    endDate: cycle.endDate ? new Date(cycle.endDate) : undefined,
  }));

  data.horoscopeMemory = normalizeHoroscopeMemory(data.horoscopeMemory);
  data.psychContractHistory = normalizePsychContractHistory(data.psychContractHistory);
  
  return data;
};

export const clearAllData = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

function normalizeHoroscopeMemory(raw: unknown): HoroscopeMemoryEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const nowIso = new Date().toISOString();

  const normalized = raw
    .map((entry: any) => {
      const source: HoroscopeMemoryEntry['source'] =
        entry?.source === 'weekly' || entry?.source === 'sergey' ? entry.source : 'daily';

      const summary = typeof entry?.summary === 'string' ? entry.summary.trim() : '';
      const date = typeof entry?.date === 'string' ? entry.date : '';
      const id =
        typeof entry?.id === 'string' && entry.id.trim().length > 0
          ? entry.id
          : `${source}-${date || Date.now().toString(36)}`;

      const keyThemes = Array.isArray(entry?.keyThemes)
        ? entry.keyThemes.filter((item: unknown) => typeof item === 'string' && item.trim().length > 0).map((item: string) => item.trim())
        : [];

      const avoidPhrases = Array.isArray(entry?.avoidPhrases)
        ? entry.avoidPhrases
            .filter((item: unknown) => typeof item === 'string' && item.trim().length > 0)
            .map((item: string) => item.trim())
        : [];

      const tone: HoroscopeMemoryEntry['tone'] =
        entry?.tone === 'positive' ||
        entry?.tone === 'neutral' ||
        entry?.tone === 'negative' ||
        entry?.tone === 'mixed'
          ? entry.tone
          : 'mixed';

      const createdAt =
        typeof entry?.createdAt === 'string' && entry.createdAt
          ? entry.createdAt
          : nowIso;

      if (!summary || !date) {
        return null;
      }

      return {
        id,
        source,
        date,
        summary,
        keyThemes,
        avoidPhrases,
        tone,
        createdAt,
      } satisfies HoroscopeMemoryEntry;
    })
    .filter((entry: HoroscopeMemoryEntry | null): entry is HoroscopeMemoryEntry => entry !== null);

  // Сортируем по дате создания
  return normalized.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function normalizePsychContractHistory(raw: unknown): PsychContractHistory {
  if (!raw || typeof raw !== 'object') {
    return {
      contracts: [],
      scenarios: [],
    };
  }

  const nowIso = new Date().toISOString();

  const rawContracts = Array.isArray((raw as any).contracts) ? (raw as any).contracts : [];
  const contractEntries = rawContracts
    .map((entry: any) => {
      const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
      const usedAt = typeof entry?.usedAt === 'string' ? entry.usedAt : nowIso;
      if (!id || Number.isNaN(Date.parse(usedAt))) {
        return null;
      }
      return { id, usedAt };
    })
    .filter(
      (entry: { id: string; usedAt: string } | null): entry is { id: string; usedAt: string } =>
        entry !== null,
    );

  contractEntries.sort(
    (a: { id: string; usedAt: string }, b: { id: string; usedAt: string }) =>
      new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime(),
  );

  const uniqueContracts: PsychContractHistory['contracts'] = [];
  const seenContractIds = new Set<string>();
  for (const entry of contractEntries) {
    if (seenContractIds.has(entry.id)) {
      continue;
    }
    uniqueContracts.push({ id: entry.id, usedAt: entry.usedAt });
    seenContractIds.add(entry.id);
    if (uniqueContracts.length >= MAX_HISTORY_CONTRACT_RECORDS) {
      break;
    }
  }

  const rawScenarios = Array.isArray((raw as any).scenarios) ? (raw as any).scenarios : [];
  const scenarioEntries = rawScenarios
    .map((entry: any) => {
      const contractId = typeof entry?.contractId === 'string' ? entry.contractId.trim() : '';
      const scenarioId = typeof entry?.scenarioId === 'string' ? entry.scenarioId.trim() : '';
      const usedAt = typeof entry?.usedAt === 'string' ? entry.usedAt : nowIso;
      if (!contractId || !scenarioId || Number.isNaN(Date.parse(usedAt))) {
        return null;
      }
      return { contractId, scenarioId, usedAt };
    })
    .filter(
      (
        entry:
          | { contractId: string; scenarioId: string; usedAt: string }
          | null,
      ): entry is { contractId: string; scenarioId: string; usedAt: string } => entry !== null,
    );

  scenarioEntries.sort(
    (
      a: { contractId: string; scenarioId: string; usedAt: string },
      b: { contractId: string; scenarioId: string; usedAt: string },
    ) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime(),
  );

  const limitedScenarios: PsychContractHistory['scenarios'] = [];
  const perContractCount = new Map<string, number>();

  for (const entry of scenarioEntries) {
    const currentCount = perContractCount.get(entry.contractId) ?? 0;
    if (currentCount >= MAX_HISTORY_SCENARIOS_PER_CONTRACT) {
      continue;
    }
    limitedScenarios.push({
      contractId: entry.contractId,
      scenarioId: entry.scenarioId,
      usedAt: entry.usedAt,
    });
    perContractCount.set(entry.contractId, currentCount + 1);
    if (limitedScenarios.length >= MAX_HISTORY_SCENARIO_RECORDS) {
      break;
    }
  }

  return {
    contracts: uniqueContracts,
    scenarios: limitedScenarios,
  };
}
