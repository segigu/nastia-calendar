import { NastiaData, type HoroscopeMemoryEntry } from '../types';

const STORAGE_KEY = 'nastia-app-data';

export const saveData = (data: NastiaData): void => {
  try {
    const serializedData = JSON.stringify(data);
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
