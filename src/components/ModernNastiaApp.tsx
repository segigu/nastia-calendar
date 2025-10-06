import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Trash2,
  Settings,
  Cloud,
  CloudOff
} from 'lucide-react';
import { CycleData, NastiaData, DayData, PainLevel, MoodLevel } from '../types';
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
  getDaysUntilNext,
  calculateFertileWindow,
  isFertileDay,
  isOvulationDay
} from '../utils/cycleUtils';
import { saveData, loadData } from '../utils/storage';
import { cloudSync } from '../utils/cloudSync';
import CycleLengthChart from './CycleLengthChart';
import {
  registerServiceWorker,
  isNotificationSupported,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationSettings,
  saveNotificationSettings,
  sendTestNotification,
  type NotificationSettings
} from '../utils/pushNotifications';
import styles from './NastiaApp.module.css';

const ModernNastiaApp: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDayForSymptoms, setSelectedDayForSymptoms] = useState<Date | null>(null);
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [activeTab, setActiveTab] = useState<'calendar' | 'history'>('calendar');
  const [showSettings, setShowSettings] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  // Состояние для редактирования симптомов
  const [editingPainLevel, setEditingPainLevel] = useState<PainLevel>(0);
  const [editingMood, setEditingMood] = useState<MoodLevel | null>(null);
  const [editingNotes, setEditingNotes] = useState('');

  // Состояние для уведомлений
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Загрузка данных при запуске
  useEffect(() => {
    // Проверяем URL параметры для автоматической настройки
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      localStorage.setItem('nastia-github-token', token);
      cloudSync.saveConfig({ token, enabled: true });
      // Очищаем URL от параметров
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Загружаем настройки облака
    const cloudConfig = cloudSync.getConfig();
    setGithubToken(cloudConfig.token);
    setCloudEnabled(cloudConfig.enabled);

    // Инициализация Service Worker и уведомлений
    initNotifications();

    loadInitialData();
  }, []);

  // Инициализация уведомлений
  const initNotifications = async () => {
    // Проверяем поддержку
    const supported = isNotificationSupported();
    setNotificationSupported(supported);

    if (!supported) {
      console.log('Push notifications not supported');
      return;
    }

    // Регистрируем Service Worker
    await registerServiceWorker();

    // Проверяем текущее разрешение
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  };

  const loadInitialData = async () => {
    try {
      // Автоматически настраиваем облачную синхронизацию
      const cloudConfig = cloudSync.getConfig();
      if (!cloudConfig.enabled && cloudConfig.token) {
        cloudSync.saveConfig({ enabled: true, token: cloudConfig.token });
      }

      // Загружаем данные из облака или локально
      if (cloudSync.isConfigured()) {
        try {
          const cloudData = await cloudSync.downloadFromCloud();
          if (cloudData && cloudData.cycles.length > 0) {
            setCycles(cloudData.cycles);
            // Сохраняем локально как резерв
            saveData(cloudData);
            return;
          }
        } catch (error) {
          console.error('Cloud load error:', error);
        }
      }

      // Если облако недоступно или пусто, загружаем локальные данные
      const localData = loadData();
      if (localData) {
        setCycles(localData.cycles);
        // Если есть локальные данные и облако настроено, загружаем в облако
        if (localData.cycles.length > 0 && cloudSync.isConfigured()) {
          try {
            await cloudSync.uploadToCloud(localData);
          } catch (error) {
            console.error('Cloud upload error:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  // Сохранение данных при изменении
  useEffect(() => {
    if (cycles.length === 0) return; // Не сохраняем пустые данные при инициализации

    const nastiaData: NastiaData = {
      cycles,
      settings: {
        averageCycleLength: 28,
        periodLength: 5,
        notifications: true,
      },
    };
    
    // Сохраняем локально
    saveData(nastiaData);
    
    // Автоматически сохраняем в облако
    if (cloudSync.isConfigured()) {
      syncToCloud(nastiaData);
    }
  }, [cycles]);

  // Тихая синхронизация с облаком
  const syncToCloud = async (data: NastiaData) => {
    try {
      setSyncStatus('syncing');
      await cloudSync.uploadToCloud(data);
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (error) {
      console.error('Error syncing to cloud:', error);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  // Сохранение настроек облака
  const saveCloudSettings = async () => {
    try {
      cloudSync.saveConfig({ token: githubToken, enabled: cloudEnabled });

      if (cloudEnabled && githubToken) {
        // Проверяем подключение
        const isConnected = await cloudSync.testConnection();
        if (isConnected) {
          setSyncStatus('success');

          // Сначала пытаемся загрузить данные из облака
          try {
            const cloudData = await cloudSync.downloadFromCloud();
            if (cloudData && cloudData.cycles.length > 0) {
              // Если в облаке есть данные, загружаем их
              // Конвертируем строки дат в Date объекты
              const convertedCycles = cloudData.cycles.map((cycle: any) => ({
                ...cycle,
                startDate: new Date(cycle.startDate),
                endDate: cycle.endDate ? new Date(cycle.endDate) : undefined,
              }));
              setCycles(convertedCycles);
              saveData({ ...cloudData, cycles: convertedCycles });
              alert(`Загружено ${cloudData.cycles.length} циклов из облака`);
            } else if (cycles.length > 0) {
              // Если в облаке пусто, но есть локальные данные - загружаем их в облако
              const nastiaData: NastiaData = {
                cycles,
                settings: {
                  averageCycleLength: 28,
                  periodLength: 5,
                  notifications: true,
                },
              };
              await syncToCloud(nastiaData);
              alert('Локальные данные загружены в облако');
            }
          } catch (cloudError) {
            console.error('Error syncing with cloud:', cloudError);
            setSyncStatus('error');
            alert('Ошибка при синхронизации с облаком');
          }
        } else {
          setSyncStatus('error');
          alert('Не удалось подключиться к GitHub. Проверьте токен.');
          return;
        }
      }

      setShowSettings(false);
    } catch (error) {
      console.error('Error saving cloud settings:', error);
      setSyncStatus('error');
      alert('Ошибка при сохранении настроек');
    }
  };

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

  // Получение данных дня из циклов
  const getDayData = (date: Date): DayData | null => {
    const dateStr = date.toISOString().split('T')[0];
    for (const cycle of cycles) {
      if (cycle.days) {
        const dayData = cycle.days.find(d => d.date === dateStr);
        if (dayData) return dayData;
      }
    }
    return null;
  };

  // Открытие модального окна для редактирования симптомов
  const openDaySymptoms = (date: Date) => {
    const dayData = getDayData(date);
    setSelectedDayForSymptoms(date);
    setEditingPainLevel(dayData?.painLevel || 0);
    setEditingMood(dayData?.mood || null);
    setEditingNotes(dayData?.notes || '');
  };

  // Сохранение симптомов дня
  const saveDaySymptoms = () => {
    if (!selectedDayForSymptoms) return;

    const dateStr = selectedDayForSymptoms.toISOString().split('T')[0];
    const newDayData: DayData = {
      date: dateStr,
      painLevel: editingPainLevel,
      mood: editingMood || undefined,
      notes: editingNotes || undefined,
    };

    // Находим цикл, к которому относится этот день
    const updatedCycles = cycles.map(cycle => {
      const cycleStart = new Date(cycle.startDate);
      const cycleEnd = new Date(cycleStart);
      cycleEnd.setDate(cycleStart.getDate() + 35); // Примерно 5 недель

      if (selectedDayForSymptoms >= cycleStart && selectedDayForSymptoms <= cycleEnd) {
        const existingDays = cycle.days || [];
        const existingIndex = existingDays.findIndex(d => d.date === dateStr);

        if (existingIndex >= 0) {
          // Обновляем существующий день
          const newDays = [...existingDays];
          newDays[existingIndex] = newDayData;
          return { ...cycle, days: newDays };
        } else {
          // Добавляем новый день
          return { ...cycle, days: [...existingDays, newDayData] };
        }
      }
      return cycle;
    });

    setCycles(updatedCycles);
    setSelectedDayForSymptoms(null);
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
    } else if (isOvulationDay(date, cycles)) {
      classes += ` ${styles.ovulation}`;
    } else if (isFertileDay(date, cycles)) {
      classes += ` ${styles.fertile}`;
    }

    return classes;
  };


  const monthDays = getMonthDays(currentDate);
  const stats = calculateCycleStats(cycles);
  const daysUntilNext = getDaysUntilNext(cycles);
  const fertileWindow = calculateFertileWindow(cycles);

  return (
    <div className={styles.container}>
      <div className={styles.appWrapper}>
        {/* Заголовок */}
        <div className={styles.header}>
          <div className={styles.titleWrapper}>
            <img 
              src="/nastia-calendar/nastia-original-logo.png" 
              alt="Nastia" 
              className={styles.logo}
            />
          </div>
          <p className={styles.subtitle}>Персональный календарь</p>
        </div>

        {/* Insights панель */}
        {cycles.length >= 2 && (
          <div className={styles.card}>
            <h3 className={styles.insightsTitle}>📊 Ваш паттерн</h3>

            <div className={styles.insightsGrid}>
              {/* Средняя длина и вариативность */}
              <div className={styles.insightCard}>
                <div className={styles.insightLabel}>Средний цикл (6 мес)</div>
                <div className={styles.insightValue}>
                  {stats.averageLength6Months} дней
                  {stats.variability > 0 && (
                    <span className={styles.insightVariability}>
                      ±{stats.variability.toFixed(1)}
                    </span>
                  )}
                </div>
                {stats.variability <= 2 && (
                  <div className={styles.insightBadge + ' ' + styles.good}>Отличная стабильность</div>
                )}
                {stats.variability > 2 && stats.variability <= 5 && (
                  <div className={styles.insightBadge + ' ' + styles.normal}>Норма</div>
                )}
                {stats.variability > 5 && (
                  <div className={styles.insightBadge + ' ' + styles.warning}>Высокая вариативность</div>
                )}
              </div>

              {/* Следующая менструация */}
              <div className={styles.insightCard}>
                <div className={styles.insightLabel}>Следующая менструация</div>
                <div className={styles.insightValue}>
                  {formatShortDate(stats.nextPrediction)}
                  {stats.variability > 0 && (
                    <span className={styles.insightRange}>
                      ±{Math.ceil(stats.variability)} дня
                    </span>
                  )}
                </div>
                {stats.predictionConfidence > 0 && (
                  <div className={styles.insightConfidence}>
                    Уверенность: {stats.predictionConfidence}%
                  </div>
                )}
              </div>

              {/* Фертильное окно */}
              {fertileWindow && (
                <div className={styles.insightCard}>
                  <div className={styles.insightLabel}>Фертильное окно</div>
                  <div className={styles.insightValue}>
                    {formatShortDate(fertileWindow.fertileStart)} - {formatShortDate(fertileWindow.ovulationDay)}
                  </div>
                  <div className={styles.insightSubtext}>
                    Овуляция: {formatShortDate(fertileWindow.ovulationDay)}
                  </div>
                </div>
              )}

              {/* Тренд */}
              {Math.abs(stats.trend) > 0.1 && (
                <div className={styles.insightCard}>
                  <div className={styles.insightLabel}>Тренд</div>
                  <div className={styles.insightValue}>
                    {stats.trend > 0 ? '📈 Увеличение' : '📉 Уменьшение'}
                  </div>
                  <div className={styles.insightSubtext}>
                    {Math.abs(stats.trend).toFixed(1)} дня/цикл
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Краткая статистика */}
        <div className={styles.card}>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>{daysUntilNext}</div>
              <div className={styles.statLabel}>дней до следующего</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>{stats.cycleCount}</div>
              <div className={styles.statLabel}>циклов отмечено</div>
            </div>
          </div>

          {/* График длины циклов */}
          {cycles.length >= 2 && activeTab === 'calendar' && (
            <CycleLengthChart cycles={cycles} />
          )}
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
            {monthDays.map((date, index) => {
              const dayData = date ? getDayData(date) : null;
              return (
                <button
                  key={index}
                  className={getDayClasses(date)}
                  onClick={() => date && openDaySymptoms(date)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (date) setSelectedDate(date);
                  }}
                >
                  <div className={styles.dayNumber}>{date ? date.getDate() : ''}</div>
                  {dayData && (
                    <div className={styles.dayIndicators}>
                      {dayData.mood === 'good' && <span className={styles.moodIndicator}>😊</span>}
                      {dayData.mood === 'neutral' && <span className={styles.moodIndicator}>😐</span>}
                      {dayData.mood === 'bad' && <span className={styles.moodIndicator}>😞</span>}
                      {dayData.painLevel && dayData.painLevel > 0 && (
                        <span className={styles.painIndicator} style={{ opacity: dayData.painLevel / 5 }}>
                          💢
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
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
              <div className={`${styles.legendDot} ${styles.ovulation}`}></div>
              <span>Овуляция</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.fertile}`}></div>
              <span>Фертильное окно</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.today}`}></div>
              <span>Сегодня</span>
            </div>
          </div>
        </div>

        {/* Навигация по вкладкам */}
        <div className={styles.tabNavigation}>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`${styles.tabButton} ${activeTab === 'calendar' ? styles.active : ''}`}
          >
            Календарь
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`${styles.tabButton} ${activeTab === 'history' ? styles.active : ''}`}
          >
            История ({cycles.length})
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className={styles.tabButton}
          >
            <Settings size={18} />
          </button>
        </div>

        {/* Индикатор синхронизации */}
        {cloudEnabled && (
          <div className={styles.syncIndicator}>
            {syncStatus === 'syncing' && (
              <div className={styles.syncStatus}>
                <Cloud size={16} className={styles.syncIcon} />
                <span>Синхронизация...</span>
              </div>
            )}
            {syncStatus === 'success' && (
              <div className={`${styles.syncStatus} ${styles.success}`}>
                <Cloud size={16} className={styles.syncIcon} />
                <span>Синхронизировано</span>
              </div>
            )}
            {syncStatus === 'error' && (
              <div className={`${styles.syncStatus} ${styles.error}`}>
                <CloudOff size={16} className={styles.syncIcon} />
                <span>Ошибка синхронизации</span>
              </div>
            )}
          </div>
        )}

        {/* Вкладка: История всех циклов */}
        {activeTab === 'history' && cycles.length > 0 && (
          <div className={`${styles.card} ${styles.cyclesList}`}>
            <h3 className={styles.statsTitle}>Все циклы ({cycles.length})</h3>
            <div className={styles.cyclesListContainer}>
              {cycles
                .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
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
                        title="Удалить цикл"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && cycles.length === 0 && (
          <div className={styles.card}>
            <div className={styles.emptyState}>
              <p>Нет записанных циклов</p>
              <p className={styles.emptyStateHint}>
                Перейдите на вкладку "Календарь" и нажмите на дату начала цикла
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно для редактирования дня и симптомов */}
      {selectedDayForSymptoms && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>
              {formatDate(selectedDayForSymptoms)}
            </h3>

            <div className={styles.symptomForm}>
              {/* Уровень боли */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Уровень боли: {editingPainLevel > 0 ? editingPainLevel : 'нет'}
                </label>
                <div className={styles.painSlider}>
                  {[0, 1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => setEditingPainLevel(level as PainLevel)}
                      className={`${styles.painButton} ${editingPainLevel === level ? styles.active : ''}`}
                    >
                      {level === 0 ? '😊' : '💢'.repeat(level)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Настроение */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Настроение/Энергия</label>
                <div className={styles.moodButtons}>
                  <button
                    onClick={() => setEditingMood('good')}
                    className={`${styles.moodButton} ${editingMood === 'good' ? styles.active : ''}`}
                  >
                    😊 Хорошо
                  </button>
                  <button
                    onClick={() => setEditingMood('neutral')}
                    className={`${styles.moodButton} ${editingMood === 'neutral' ? styles.active : ''}`}
                  >
                    😐 Нормально
                  </button>
                  <button
                    onClick={() => setEditingMood('bad')}
                    className={`${styles.moodButton} ${editingMood === 'bad' ? styles.active : ''}`}
                  >
                    😞 Плохо
                  </button>
                </div>
              </div>

              {/* Заметки */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Заметки</label>
                <textarea
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  placeholder="Дополнительные заметки..."
                  className={styles.formTextarea}
                  rows={3}
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                onClick={saveDaySymptoms}
                className={`${styles.modalButton} ${styles.primary}`}
              >
                Сохранить
              </button>
              <button
                onClick={() => setSelectedDayForSymptoms(null)}
                className={`${styles.modalButton} ${styles.secondary}`}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно для добавления цикла (правый клик) */}
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

      {/* Модальное окно настроек */}
      {showSettings && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>
              Настройки облачной синхронизации
            </h3>

            <div className={styles.settingsForm}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <input
                    type="checkbox"
                    checked={cloudEnabled}
                    onChange={(e) => setCloudEnabled(e.target.checked)}
                    className={styles.checkbox}
                  />
                  <span>Включить синхронизацию с GitHub</span>
                </label>
              </div>

              {cloudEnabled && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    GitHub Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxx"
                    className={styles.formInput}
                  />
                  <p className={styles.formHint}>
                    Создайте токен на{' '}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.link}
                    >
                      GitHub Settings
                    </a>
                    {' '}с правами <strong>repo</strong>
                  </p>
                </div>
              )}

              <div className={styles.formGroup}>
                <p className={styles.formInfo}>
                  {cloudEnabled
                    ? '✓ Данные будут автоматически сохраняться в приватный репозиторий GitHub'
                    : 'ℹ️ Данные будут храниться только локально в браузере'
                  }
                </p>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                onClick={saveCloudSettings}
                className={`${styles.modalButton} ${styles.primary}`}
              >
                Сохранить
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className={`${styles.modalButton} ${styles.secondary}`}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Персональное сообщение */}
      <div className={styles.footer}>
        <p className={styles.footerText}>
          Создано с ❤️ для Nastia
        </p>
      </div>
    </div>
  );
};

export default ModernNastiaApp;