export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatShortDate = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', {
    month: 'short',
    day: 'numeric',
  });
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const diffInDays = (date1: Date, date2: Date): number => {
  const timeDiff = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
};

export const isSameDay = (date1: Date, date2: Date): boolean => {
  return date1.toDateString() === date2.toDateString();
};

export const isToday = (date: Date): boolean => {
  return isSameDay(date, new Date());
};

export const getMonthName = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', { month: 'long' });
};

export const getMonthYear = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
};