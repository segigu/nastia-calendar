import { NastiaData } from '../types';

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
    
    return data;
  } catch (error) {
    console.error('Ошибка при загрузке данных:', error);
    return null;
  }
};

export const exportData = (data: NastiaData): string => {
  return JSON.stringify(data, null, 2);
};

export const importData = (jsonString: string): NastiaData => {
  const data = JSON.parse(jsonString);
  
  // Преобразуем строки дат в Date объекты
  data.cycles = data.cycles.map((cycle: any) => ({
    ...cycle,
    startDate: new Date(cycle.startDate),
    endDate: cycle.endDate ? new Date(cycle.endDate) : undefined,
  }));
  
  return data;
};

export const clearAllData = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};