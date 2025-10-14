import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Heart, 
  BarChart3, 
  Download,
  Upload,
  Trash2
} from 'lucide-react';
import { CycleData, HoroscopeMemoryEntry, NastiaData } from '../types';
import { 
  formatDate, 
  formatShortDate, 
  isToday, 
  getMonthYear 
} from '../utils/dateUtils';
import { 
  calculateCycleStats, 
  isPredictedPeriod, 
  isPastPeriod, 
  getDaysUntilNext 
} from '../utils/cycleUtils';
import { saveData, loadData, exportData, importData } from '../utils/storage';
import {
  getPsychContractHistorySnapshot,
  hydratePsychContractHistory,
} from '../utils/psychContractHistory';

const HOROSCOPE_MEMORY_LIMIT = 12;

const NastiaApp: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [horoscopeMemory, setHoroscopeMemory] = useState<HoroscopeMemoryEntry[]>([]);

  // Загрузка данных при запуске
  useEffect(() => {
    const savedData = loadData();
    if (savedData) {
      setCycles(savedData.cycles);
      setHoroscopeMemory((savedData.horoscopeMemory ?? []).slice(-HOROSCOPE_MEMORY_LIMIT));
      hydratePsychContractHistory(savedData.psychContractHistory);
    }
  }, []);

  // Сохранение данных при изменении
  useEffect(() => {
    const trimmedMemory = horoscopeMemory.slice(-HOROSCOPE_MEMORY_LIMIT);
    const nastiaData: NastiaData = {
      cycles,
      settings: {
        averageCycleLength: 28,
        periodLength: 5,
        notifications: true,
      },
      horoscopeMemory: trimmedMemory,
      psychContractHistory: getPsychContractHistorySnapshot(),
    };
    saveData(nastiaData);
  }, [cycles, horoscopeMemory]);

  // Получение дней месяца для календаря
  const getMonthDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Добавляем пустые дни для выравнивания
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Добавляем дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  // Переключение месяца
  const changeMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  // Добавление нового цикла
  const addCycle = (date: Date) => {
    const newCycle: CycleData = {
      id: Date.now().toString(),
      startDate: date,
      notes: '',
    };
    setCycles([...cycles, newCycle]);
    setSelectedDate(null);
  };

  // Удаление цикла
  const deleteCycle = (cycleId: string) => {
    setCycles(cycles.filter(cycle => cycle.id !== cycleId));
  };

  // Получение CSS класса для дня
  const getDayClass = (date: Date | null) => {
    if (!date) return 'invisible';
    
    const baseClass = 'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 cursor-pointer';
    
    if (isToday(date)) {
      return `${baseClass} bg-purple-800 text-white ring-2 ring-purple-400`;
    }
    
    if (isPastPeriod(date, cycles)) {
      return `${baseClass} bg-red-400 text-white hover:bg-red-500`;
    }
    
    if (isPredictedPeriod(date, cycles)) {
      return `${baseClass} bg-pink-200 text-pink-800 hover:bg-pink-300`;
    }
    
    return `${baseClass} hover:bg-pink-50 text-gray-700`;
  };

  // Экспорт данных
  const handleExport = () => {
    const trimmedMemory = horoscopeMemory.slice(-HOROSCOPE_MEMORY_LIMIT);
    const nastiaData: NastiaData = {
      cycles,
      settings: {
        averageCycleLength: 28,
        periodLength: 5,
        notifications: true,
      },
      horoscopeMemory: trimmedMemory,
      psychContractHistory: getPsychContractHistorySnapshot(),
    };
    const dataStr = exportData(nastiaData);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nastia-data.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Импорт данных
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonString = e.target?.result as string;
          const importedData = importData(jsonString);
          setCycles(importedData.cycles);
          setHoroscopeMemory((importedData.horoscopeMemory ?? []).slice(-HOROSCOPE_MEMORY_LIMIT));
          hydratePsychContractHistory(importedData.psychContractHistory);
        } catch (error) {
          alert('Ошибка при импорте данных');
        }
      };
      reader.readAsText(file);
    }
  };

  const monthDays = getMonthDays(currentDate);
  const stats = calculateCycleStats(cycles);
  const daysUntilNext = getDaysUntilNext(cycles);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 p-4">
      <div className="max-w-md mx-auto">
        {/* Заголовок */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Heart className="w-8 h-8 text-purple-800 mr-2" />
            <h1 className="text-3xl font-bold text-purple-800">Nastia</h1>
          </div>
          <p className="text-gray-600">Персональный календарь</p>
        </div>

        {/* Статистика */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-800">{daysUntilNext}</div>
              <div className="text-sm text-gray-600">дней до следующего</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-pink-600">{stats.averageLength}</div>
              <div className="text-sm text-gray-600">средний цикл</div>
            </div>
          </div>
        </div>

        {/* Календарь */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          {/* Навигация по месяцам */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => changeMonth('prev')}
              className="p-2 rounded-lg hover:bg-pink-50 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-purple-800" />
            </button>
            <h2 className="text-xl font-semibold text-purple-800">
              {getMonthYear(currentDate)}
            </h2>
            <button
              onClick={() => changeMonth('next')}
              className="p-2 rounded-lg hover:bg-pink-50 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-purple-800" />
            </button>
          </div>

          {/* Дни недели */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Дни месяца */}
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((date, index) => (
              <div
                key={index}
                className={getDayClass(date)}
                onClick={() => date && setSelectedDate(date)}
              >
                {date ? date.getDate() : ''}
              </div>
            ))}
          </div>

          {/* Легенда */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-400 rounded-full mr-1"></div>
              <span>Период</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-pink-200 rounded-full mr-1"></div>
              <span>Прогноз</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-purple-800 rounded-full mr-1"></div>
              <span>Сегодня</span>
            </div>
          </div>
        </div>

        {/* Действия */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => setShowStats(!showStats)}
            className="bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-800 transition-colors flex items-center justify-center"
          >
            <BarChart3 className="w-5 h-5 mr-2" />
            Статистика
          </button>
          <button
            onClick={handleExport}
            className="bg-pink-500 text-white px-4 py-3 rounded-lg hover:bg-purple-600 transition-colors flex items-center justify-center"
          >
            <Download className="w-5 h-5 mr-2" />
            Экспорт
          </button>
        </div>

        {/* Импорт данных */}
        <div className="mb-6">
          <label className="block w-full bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50">
            <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400" />
            <span className="text-gray-600">Импорт данных</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        </div>

        {/* Детальная статистика */}
        {showStats && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-purple-800 mb-4">Статистика циклов</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Всего циклов:</span>
                <span className="font-semibold">{stats.cycleCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Средняя длина:</span>
                <span className="font-semibold">{stats.averageLength} дней</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Последний цикл:</span>
                <span className="font-semibold">{stats.lastCycleLength} дней</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Следующий прогноз:</span>
                <span className="font-semibold">{formatShortDate(stats.nextPrediction)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Список циклов */}
        {cycles.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-purple-800 mb-4">Последние циклы</h3>
            <div className="space-y-3">
              {cycles
                .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                .slice(0, 5)
                .map(cycle => (
                  <div key={cycle.id} className="flex items-center justify-between p-3 bg-pink-50 rounded-lg">
                    <div>
                      <div className="font-medium text-purple-800">
                        {formatDate(new Date(cycle.startDate))}
                      </div>
                      {cycle.notes && (
                        <div className="text-sm text-gray-600">{cycle.notes}</div>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => deleteCycle(cycle.id)}
                        className="p-1 text-gray-500 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно для добавления цикла */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-purple-800 mb-4">
              Добавить цикл
            </h3>
            <p className="text-gray-600 mb-4">
              Дата: {formatDate(selectedDate)}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => addCycle(selectedDate)}
                className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-800 transition-colors"
              >
                Добавить
              </button>
              <button
                onClick={() => setSelectedDate(null)}
                className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NastiaApp;
