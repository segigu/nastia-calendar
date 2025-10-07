import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Settings,
  Cloud,
  CloudOff
} from 'lucide-react';
import { CycleData, NastiaData, NotificationCategory, NotificationItem } from '../types';
import nastiaLogo from '../assets/nastia-header-logo.png';
import {
  formatDate,
  formatShortDate,
  isToday,
  getMonthYear,
  diffInDays,
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
import { saveSubscription, removeSubscription } from '../utils/pushSubscriptionSync';
import {
  loadLocalNotifications,
  saveLocalNotifications,
  loadReadSet,
  saveReadSet,
  mergeNotifications,
  markAllAsRead,
  addSingleNotification,
  type StoredNotification,
} from '../utils/notificationsStorage';
import { fetchRemoteNotifications } from '../utils/notificationsSync';
import { fetchRemoteConfig } from '../utils/remoteConfig';
import {
  generatePeriodModalContent,
  getFallbackPeriodContent,
  type PeriodModalContent,
} from '../utils/aiContent';
import styles from './NastiaApp.module.css';

const PRIMARY_USER_NAME = 'Настя';
const MAX_STORED_NOTIFICATIONS = 200;

const NOTIFICATION_TYPE_LABELS: Record<NotificationCategory, string> = {
  fertile_window: 'Фертильное окно',
  ovulation_day: 'День овуляции',
  period_forecast: 'Прогноз менструации',
  period_start: 'День менструации',
  generic: 'Напоминание',
};

const ModernNastiaApp: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [activeTab, setActiveTab] = useState<'calendar' | 'history'>('calendar');
  const [showSettings, setShowSettings] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [remoteOpenAIKey, setRemoteOpenAIKey] = useState<string | null>(null);
  const [periodContent, setPeriodContent] = useState<PeriodModalContent | null>(null);
  const [periodContentStatus, setPeriodContentStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [periodContentError, setPeriodContentError] = useState<string | null>(null);

  // Состояние для уведомлений
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<StoredNotification[]>(() =>
    loadLocalNotifications()
      .map(notification => ({ ...notification, read: Boolean(notification.read) }))
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
  );
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    const storedSet = loadReadSet();
    if (storedSet.size === 0) {
      const locallyStored = loadLocalNotifications();
      for (const entry of locallyStored) {
        if (entry.read) {
          storedSet.add(entry.id);
        }
      }
    }
    return storedSet;
  });
  const readIdsRef = useRef(readIds);

  useEffect(() => {
    readIdsRef.current = readIds;
  }, [readIds]);

  useEffect(() => {
    setNotifications(prev => persistNotifications(prev));
  }, []);

  const fallbackPeriodContent = useMemo(
    () => getFallbackPeriodContent(PRIMARY_USER_NAME),
    [],
  );

  const renderedPeriodContent = periodContent ?? (periodContentStatus !== 'loading' ? fallbackPeriodContent : null);

  const stats = useMemo(() => calculateCycleStats(cycles), [cycles]);
  const nextPredictionDate = stats.nextPrediction;
  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + (notification.read ? 0 : 1), 0),
    [notifications]
  );

  const persistNotifications = (items: StoredNotification[]): StoredNotification[] => {
    const limited = items.slice(0, MAX_STORED_NOTIFICATIONS);
    saveLocalNotifications(limited);
    return limited;
  };

  const markAllNotificationsAsRead = () => {
    if (notifications.length === 0) {
      return;
    }
    const { updated, readSet } = markAllAsRead(notifications);
    const persisted = persistNotifications(updated);
    saveReadSet(readSet);
    setNotifications(persisted);
    setReadIds(new Set(readSet));
  };

  const normalizeNotificationType = (value?: string): NotificationCategory => {
    if (value === 'fertile_window' || value === 'ovulation_day' || value === 'period_forecast' || value === 'period_start') {
      return value;
    }
    return 'generic';
  };

  const formatNotificationTimestamp = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getNotificationTypeLabel = (type?: string): string => {
    const normalized = normalizeNotificationType(type);
    return NOTIFICATION_TYPE_LABELS[normalized];
  };

  const handleOpenNotifications = () => {
    markAllNotificationsAsRead();
    setShowNotifications(true);
  };

  const handleCloseNotifications = () => {
    setShowNotifications(false);
  };

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

  // Подготавливаем текст модалки при выборе даты; ключ берём из GitHub-конфига или из env.
  useEffect(() => {
    if (!selectedDate) {
      setPeriodContent(null);
      setPeriodContentStatus('idle');
      setPeriodContentError(null);
      return;
    }

    // Ключ берём из локального поля или из билд-настройки. Если ключей нет — используем заранее заготовленный текст.
    const activeApiKey = (remoteOpenAIKey ?? '').trim() || process.env.REACT_APP_OPENAI_API_KEY || '';

    if (!activeApiKey) {
      setPeriodContent(fallbackPeriodContent);
      setPeriodContentStatus('idle');
      setPeriodContentError(null);
      return;
    }

    const controller = new AbortController();
    setPeriodContentStatus('loading');
    setPeriodContentError(null);
    setPeriodContent(null);

    generatePeriodModalContent({
      userName: PRIMARY_USER_NAME,
      cycleStartISODate: selectedDate.toISOString(),
      signal: controller.signal,
      apiKey: activeApiKey,
    })
      .then(content => {
        setPeriodContent(content);
        setPeriodContentStatus('idle');
      })
      .catch(error => {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Не удалось получить текст для модального окна', error);
        setPeriodContent(fallbackPeriodContent);
        setPeriodContentStatus('error');
        setPeriodContentError(
          'Похоже, Настенька не успела подготовить свежий текст. Показан запасной вариант.',
        );
      });

    return () => {
      controller.abort();
    };
  }, [selectedDate, remoteOpenAIKey, fallbackPeriodContent]);

  useEffect(() => {
    if (!githubToken) {
      return;
    }

    let cancelled = false;

    Promise.all([
      fetchRemoteNotifications(githubToken).catch(error => {
        console.error('Failed to load notifications from cloud:', error);
        return [];
      }),
      fetchRemoteConfig(githubToken).catch(error => {
        console.error('Failed to load remote config:', error);
        return null;
      }),
    ]).then(([remoteNotifications, config]) => {
      if (cancelled) {
        return;
      }

      if (remoteNotifications.length > 0) {
        setNotifications(prev => {
          const merged = mergeNotifications(remoteNotifications, prev, readIdsRef.current);
          return persistNotifications(merged);
        });
      }

      if (config?.openAI?.apiKey) {
        setRemoteOpenAIKey(config.openAI.apiKey);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cloudEnabled, githubToken]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'nastia-notification' || !data.payload) {
        return;
      }

      const payload = data.payload as {
        id?: string;
        title?: string;
        body?: string;
        type?: string;
        sentAt?: string;
      };

      if (!payload.id) {
        return;
      }

      const notification: NotificationItem = {
        id: payload.id,
        title: payload.title ?? 'Nastia Calendar',
        body: payload.body ?? '',
        sentAt: payload.sentAt ?? new Date().toISOString(),
        type: normalizeNotificationType(payload.type),
      };

      setNotifications(prev => {
        const updated = addSingleNotification(notification, prev, readIdsRef.current);
        return persistNotifications(updated);
      });
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
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

  // Обработчики для уведомлений
  const handleEnableNotifications = async () => {
    if (!notificationSupported) {
      alert('Push-уведомления не поддерживаются в этом браузере');
      return;
    }

    try {
      const permission = await requestNotificationPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        const subscription = await subscribeToPush();
        if (subscription) {
          // Сохраняем подписку в облако (если включена синхронизация)
          if (cloudEnabled && githubToken) {
            const saved = await saveSubscription(githubToken, subscription);
            if (saved) {
              console.log('Подписка сохранена в облако');
            } else {
              console.warn('Не удалось сохранить подписку в облако');
            }
          }
          alert('Уведомления успешно включены');
        } else {
          await updateNotificationSettings({ enabled: false });
          alert('Не удалось создать подписку на уведомления');
        }
      } else {
        alert('Необходимо разрешение на уведомления');
        await updateNotificationSettings({ enabled: false });
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      await updateNotificationSettings({ enabled: false });
      alert('Ошибка при включении уведомлений');
    }
  };

  const handleDisableNotifications = async () => {
    try {
      // Получаем текущую подписку перед отпиской
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription && cloudEnabled && githubToken) {
        // Удаляем подписку из облака
        await removeSubscription(githubToken, subscription.endpoint);
      }

      await unsubscribeFromPush();
      alert('Уведомления отключены');
    } catch (error) {
      console.error('Error disabling notifications:', error);
    }
  };

  const updateNotificationSettings = async (settings: NotificationSettings) => {
    setNotificationSettings(settings);
    saveNotificationSettings(settings);

    if (cloudEnabled && githubToken && notificationPermission === 'granted') {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          const subscriptionData = {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('p256dh')!)))),
              auth: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('auth')!))))
            },
            settings,
          };

          await saveSubscription(githubToken, subscriptionData);
        }
      } catch (error) {
        console.error('Error updating subscription settings:', error);
      }
    }
  };

  const handleTestNotification = async () => {
    if (notificationPermission !== 'granted') {
      alert('Сначала разрешите уведомления');
      return;
    }
    try {
      await sendTestNotification();
      alert('Тестовое уведомление отправлено! Проверьте уведомления.');
    } catch (error) {
      console.error('Test notification failed:', error);
      alert(`Ошибка: ${error instanceof Error ? error.message : 'Не удалось отправить уведомление'}`);
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
    // Преобразуем: воскресенье (0) становится 6, понедельник (1) становится 0, и т.д.
    const adjustedStartingDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;

    const days = [];

    // Добавляем пустые дни для выравнивания (начиная с понедельника)
    for (let i = 0; i < adjustedStartingDay; i++) {
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

  // Обработчик клика на дату - открывает модальное окно для добавления начала менструации
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
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
      if (nextPredictionDate && diffInDays(date, nextPredictionDate) === 0) {
        classes += ` ${styles.predictedFocus}`;
      }
    } else if (isOvulationDay(date, cycles)) {
      classes += ` ${styles.ovulation}`;
    } else if (isFertileDay(date, cycles)) {
      classes += ` ${styles.fertile}`;
    }

    return classes;
  };

  const monthDays = getMonthDays(currentDate);
  const daysUntilNext = getDaysUntilNext(cycles);
  const fertileWindow = calculateFertileWindow(cycles);

  return (
    <div className={styles.container}>
      <div className={styles.appWrapper}>
        {/* Заголовок */}
        <div className={styles.header}>
          <div className={styles.titleWrapper}>
            <img
              src={nastiaLogo}
              alt="Nastia"
              className={styles.logo}
            />
          </div>

          <div className={styles.headerCorner}>
            <button
              onClick={handleOpenNotifications}
              className={styles.notificationBellButton}
              type="button"
              aria-label={unreadCount > 0 ? `Есть ${unreadCount} новых уведомлений` : 'Открыть уведомления'}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className={styles.notificationBadge}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {cloudEnabled && (
              <div className={styles.syncIndicatorCorner}>
                {syncStatus === 'syncing' && (
                  <Cloud size={20} className={`${styles.syncIconCorner} ${styles.syncing}`} />
                )}
                {syncStatus === 'success' && (
                  <Cloud size={20} className={`${styles.syncIconCorner} ${styles.success}`} />
                )}
                {syncStatus === 'error' && (
                  <CloudOff size={20} className={`${styles.syncIconCorner} ${styles.error}`} />
                )}
              </div>
            )}
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

        {/* Календарь */}
        {activeTab === 'calendar' && (
          <div className={styles.calendarPanel}>
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
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
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
                  onClick={() => date && handleDateClick(date)}
                >
                  <div className={styles.dayNumber}>{date ? date.getDate() : ''}</div>
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
        )}

        {/* Insights панель */}
        {cycles.length >= 2 && activeTab === 'calendar' && (
          <div className={styles.insightsCard}>
            <h3 className={styles.insightsTitle}>⚡️ Твои показатели</h3>

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
        {activeTab === 'calendar' && (
          <div className={`${styles.card} ${styles.statsCard}`}>
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
            {cycles.length >= 2 && (
              <div className={styles.chartSection}>
                <CycleLengthChart cycles={cycles} />
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

      {showNotifications && (
        <div className={styles.modal}>
          <div className={styles.notificationsModal}>
            <div className={styles.notificationsHeader}>
              <h3 className={styles.settingsTitle}>Уведомления</h3>
              <button
                onClick={handleCloseNotifications}
                className={styles.closeButton}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            <div className={styles.notificationsBody}>
              {notifications.length === 0 ? (
                <p className={styles.notificationEmpty}>
                  Пока никакой язвительной драмы — новых уведомлений нет.
                </p>
              ) : (
                <div className={styles.notificationsList}>
                  {notifications.map(notification => (
                    <div key={notification.id} className={styles.notificationCard}>
                      <div className={styles.notificationTitle}>
                        {notification.title}
                      </div>
                      <div className={styles.notificationBody}>{notification.body}</div>
                      <div className={styles.notificationMeta}>
                        <span>{getNotificationTypeLabel(notification.type)}</span>
                        <span>{formatNotificationTimestamp(notification.sentAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно для добавления начала менструации */}
      {selectedDate && (
        <div className={styles.modal}>
          <div className={`${styles.modalContent} ${styles.periodModal}`}>
            <div className={`${styles.settingsHeader} ${styles.periodHeader}`}>
              <h3 className={styles.settingsTitle}>
                Начало менструации
              </h3>
              <button
                onClick={() => setSelectedDate(null)}
                className={styles.closeButton}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            <div className={styles.periodModalBody}>
              <div className={styles.periodIconWrapper}>
                <div className={styles.periodIcon}>🌸</div>
              </div>

              <div className={styles.periodContent}>
                <p className={styles.periodDate}>
                  {formatDate(selectedDate)}
                </p>

                {periodContentStatus === 'loading' ? (
                  <div className={styles.periodSkeletons}>
                    <div className={styles.periodSkeletonLine} style={{ width: '55%' }}></div>
                  </div>
                ) : (
                  <p className={styles.periodText}>
                    {(renderedPeriodContent ?? fallbackPeriodContent).question}
                  </p>
                )}

                {periodContentStatus === 'loading' ? (
                  <div className={styles.periodSkeletons}>
                    <div className={styles.periodSkeletonLine} style={{ width: '80%' }}></div>
                    <div className={styles.periodSkeletonLine} style={{ width: '68%' }}></div>
                  </div>
                ) : (
                  <p className={styles.periodJoke}>
                    <span className={styles.periodHintEmoji}>
                      {(renderedPeriodContent ?? fallbackPeriodContent).joke.emoji}
                    </span>
                    {(renderedPeriodContent ?? fallbackPeriodContent).joke.text}
                  </p>
                )}

                {periodContentStatus === 'error' && periodContentError && (
                  <p className={styles.periodContentError}>{periodContentError}</p>
                )}
              </div>

              <div className={styles.periodActions}>
                <button
                  onClick={() => addCycle(selectedDate)}
                  className={`${styles.bigButton} ${styles.primaryButton}`}
                >
                  Да, добавить
                </button>
                <button
                  onClick={() => setSelectedDate(null)}
                  className={`${styles.bigButton} ${styles.secondaryButton}`}
                >
                  Нет, передумала
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно настроек */}
      {showSettings && (
        <div className={styles.modal}>
          <div className={`${styles.modalContent} ${styles.settingsModal}`}>
            <div className={styles.settingsHeader}>
              <h3 className={styles.settingsTitle}>
                Настройки
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className={styles.closeButton}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            <div className={styles.settingsForm}>
              {/* Секция облачной синхронизации */}
              <h4 className={styles.sectionTitle}>
                Облачная синхронизация
              </h4>

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

              {cloudEnabled && (
                <div className={styles.formGroup}>
                  <p className={styles.formInfo}>
                    {remoteOpenAIKey
                      ? '✓ OpenAI-ключ подтянут из GitHub Secrets — Настя придумала тексты заранее.'
                      : '⚠️ OpenAI-ключ ещё не подтянут из GitHub. Проверьте секрет OPENAI_API_KEY в репозитории.'}
                  </p>
                </div>
              )}

              {/* Разделитель */}
              <div className={styles.sectionDivider}></div>

              {/* Секция уведомлений */}
              <h4 className={styles.sectionTitle}>
                Push-уведомления
              </h4>

              {!notificationSupported ? (
                <p className={styles.formInfo}>
                  ⚠️ Push-уведомления не поддерживаются в этом браузере
                </p>
              ) : (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <input
                        type="checkbox"
                        checked={notificationSettings.enabled}
                        onChange={async (e) => {
                          const enabled = e.target.checked;
                          await updateNotificationSettings({ enabled });
                          if (enabled) {
                            handleEnableNotifications();
                          } else {
                            handleDisableNotifications();
                          }
                        }}
                        className={styles.checkbox}
                      />
                      <span>Включить уведомления</span>
                    </label>
                  </div>

                  {notificationPermission === 'denied' && (
                    <p className={styles.formInfo} style={{ color: '#ef4444' }}>
                      ⚠️ Уведомления заблокированы. Разрешите их в настройках браузера.
                    </p>
                  )}

                  {notificationSettings.enabled && notificationPermission === 'granted' && (
                    <p className={styles.formInfo}>
                      Настя будет слать жёстко-саркастичные пуши: про фертильное окно, день овуляции,
                      предменструальные качели и сам день Х.
                    </p>
                  )}

                  {notificationPermission === 'granted' && (
                    <div className={styles.formGroup}>
                      <button
                        onClick={handleTestNotification}
                        className={styles.bigButton}
                      >
                        Отправить тестовое уведомление
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Кнопки сохранения внутри формы */}
              <div className={styles.settingsActions}>
                <button
                  onClick={saveCloudSettings}
                  className={`${styles.bigButton} ${styles.primaryButton}`}
                >
                  Сохранить
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className={`${styles.bigButton} ${styles.secondaryButton}`}
                >
                  Отмена
                </button>
              </div>
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
