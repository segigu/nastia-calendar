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
import { CycleData, NastiaData } from '../types';
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
import styles from './NastiaApp.module.css';

const ModernNastiaApp: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [showStats, setShowStats] = useState(false);

  // Загрузка данных при запуске
  useEffect(() => {
    const savedData = loadData();
    if (savedData) {
      setCycles(savedData.cycles);
    }
  }, []);

  // Сохранение данных при изменении
  useEffect(() => {
    const nastiaData: NastiaData = {
      cycles,
      settings: {
        averageCycleLength: 28,
        periodLength: 5,
        notifications: true,
      },
    };
    saveData(nastiaData);
  }, [cycles]);

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
  const getDayClasses = (date: Date | null) => {
    if (!date) return `${styles.dayCell} ${styles.invisible}`;
    
    let classes = styles.dayCell;
    
    if (isToday(date)) {
      classes += ` ${styles.today}`;
    } else if (isPastPeriod(date, cycles)) {
      classes += ` ${styles.period}`;
    } else if (isPredictedPeriod(date, cycles)) {
      classes += ` ${styles.predicted}`;
    }
    
    return classes;
  };

  // Экспорт данных
  const handleExport = () => {
    const nastiaData: NastiaData = {
      cycles,
      settings: {
        averageCycleLength: 28,
        periodLength: 5,
        notifications: true,
      },
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
    <div className={styles.container}>
      <div className={styles.appWrapper}>
        {/* Заголовок */}
        <div className={styles.header}>
          <div className={styles.titleWrapper}>
            <Heart size={32} color="var(--nastia-dark)" />
            <h1 className={styles.title}>Nastia</h1>
          </div>
          <p className={styles.subtitle}>Персональный календарь</p>
        </div>

        {/* Статистика */}
        <div className={styles.card}>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>{daysUntilNext}</div>
              <div className={styles.statLabel}>дней до следующего</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>{stats.averageLength}</div>
              <div className={styles.statLabel}>средний цикл</div>
            </div>
          </div>
        </div>

        {/* Календарь */}
        <div className={styles.card}>
          {/* Навигация по месяцам */}
          <div className={styles.calendarHeader}>
            <button
              onClick={() => changeMonth('prev')}
              className={styles.navButton}
            >
              <ChevronLeft size={20} color="var(--nastia-dark)" />
            </button>
            <h2 className={styles.monthTitle}>
              {getMonthYear(currentDate)}
            </h2>
            <button
              onClick={() => changeMonth('next')}
              className={styles.navButton}
            >
              <ChevronRight size={20} color="var(--nastia-dark)" />
            </button>
          </div>

          {/* Дни недели */}
          <div className={styles.weekDays}>
            {['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map(day => (
              <div key={day} className={styles.weekDay}>
                {day}
              </div>
            ))}
          </div>

          {/* Дни месяца */}
          <div className={styles.calendarGrid}>
            {monthDays.map((date, index) => (
              <button
                key={index}
                className={getDayClasses(date)}
                onClick={() => date && setSelectedDate(date)}
              >
                {date ? date.getDate() : ''}
              </button>
            ))}
          </div>

          {/* Легенда */}
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.period}`}></div>
              <span>Период</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.predicted}`}></div>
              <span>Прогноз</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.today}`}></div>
              <span>Сегодня</span>
            </div>
          </div>
        </div>

        {/* Действия */}
        <div className={styles.actionsGrid}>
          <button
            onClick={() => setShowStats(!showStats)}
            className={`${styles.actionButton} ${styles.primary}`}
          >
            <BarChart3 size={20} className={styles.buttonIcon} />
            Статистика
          </button>
          <button
            onClick={handleExport}
            className={`${styles.actionButton} ${styles.secondary}`}
          >
            <Download size={20} className={styles.buttonIcon} />
            Экспорт
          </button>
        </div>

        {/* Импорт данных */}
        <label className={styles.importArea}>
          <Upload size={24} className={styles.importIcon} />
          <span className={styles.importText}>Импорт данных</span>
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            className={styles.importInput}
          />
        </label>

        {/* Детальная статистика */}
        {showStats && (
          <div className={`${styles.card} ${styles.statsDetails}`}>
            <h3 className={styles.statsTitle}>Статистика циклов</h3>
            <div>
              <div className={styles.statsItem}>
                <span className={styles.statsItemLabel}>Всего циклов:</span>
                <span className={styles.statsItemValue}>{stats.cycleCount}</span>
              </div>
              <div className={styles.statsItem}>
                <span className={styles.statsItemLabel}>Средняя длина:</span>
                <span className={styles.statsItemValue}>{stats.averageLength} дней</span>
              </div>
              <div className={styles.statsItem}>
                <span className={styles.statsItemLabel}>Последний цикл:</span>
                <span className={styles.statsItemValue}>{stats.lastCycleLength} дней</span>
              </div>
              <div className={styles.statsItem}>
                <span className={styles.statsItemLabel}>Следующий прогноз:</span>
                <span className={styles.statsItemValue}>{formatShortDate(stats.nextPrediction)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Список циклов */}
        {cycles.length > 0 && (
          <div className={`${styles.card} ${styles.cyclesList}`}>
            <h3 className={styles.statsTitle}>Последние циклы</h3>
            <div>
              {cycles
                .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                .slice(0, 5)
                .map(cycle => (
                  <div key={cycle.id} className={styles.cycleItem}>
                    <div className={styles.cycleInfo}>
                      <div className={styles.cycleDate}>
                        {formatDate(new Date(cycle.startDate))}
                      </div>
                      {cycle.notes && (
                        <div className={styles.cycleNotes}>{cycle.notes}</div>
                      )}
                    </div>
                    <div className={styles.cycleActions}>
                      <button
                        onClick={() => deleteCycle(cycle.id)}
                        className={styles.cycleActionButton}
                      >
                        <Trash2 size={16} />
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
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>
              Добавить цикл
            </h3>
            <p className={styles.modalText}>
              Дата: {formatDate(selectedDate)}
            </p>
            <div className={styles.modalActions}>
              <button
                onClick={() => addCycle(selectedDate)}
                className={`${styles.modalButton} ${styles.primary}`}
              >
                Добавить
              </button>
              <button
                onClick={() => setSelectedDate(null)}
                className={`${styles.modalButton} ${styles.secondary}`}
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

export default ModernNastiaApp;