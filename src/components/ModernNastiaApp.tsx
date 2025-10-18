import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  Cloud,
  CloudOff
} from 'lucide-react';
import { GlassTabBar, type TabId } from './GlassTabBar';
import {
  CycleData,
  type HoroscopeMemoryEntry,
  NastiaData,
  NotificationCategory,
  NotificationItem,
} from '../types';
import {
  formatDate,
  formatShortDate,
  isToday,
  getMonthYear,
  diffInDays,
  addDays,
} from '../utils/dateUtils';
import {
  calculateCycleStats,
  isPredictedPeriod,
  isPeriodStartDay,
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
  clearLocalNotifications,
  markAllAsRead,
  addSingleNotification,
  type StoredNotification,
} from '../utils/notificationsStorage';
import { fetchRemoteNotifications } from '../utils/notificationsSync';
import { fetchRemoteConfig } from '../utils/remoteConfig';
import {
  fetchDailyHoroscope,
  fetchDailyHoroscopeForDate,
  fetchHoroscopeLoadingMessages,
  fetchSergeyBannerCopy,
  fetchSergeyLoadingMessages,
  fetchSergeyDailyHoroscopeForDate,
  mergeHoroscopeMemoryEntries,
  type DailyHoroscope,
  type HoroscopeLoadingMessage,
  type SergeyBannerCopy,
  getSergeyLoadingFallback,
} from '../utils/horoscope';
import {
  generatePeriodModalContent,
  getFallbackPeriodContent,
  type PeriodModalContent,
} from '../utils/aiContent';
import {
  getPsychContractHistorySnapshot,
  hydratePsychContractHistory,
} from '../utils/psychContractHistory';
import {
  generateInsightDescription,
  getFallbackInsightDescription,
  getRandomLoadingPhrase,
  type InsightDescription,
} from '../utils/insightContent';
import {
  generateHistoryStoryChunk,
  type HistoryStoryMeta,
  type HistoryStoryOption,
  clearPsychContractContext,
} from '../utils/historyStory';
import {
  generatePersonalizedPlanetMessages,
  type PersonalizedPlanetMessages,
  calculateTypingDuration,
  calculatePauseBefore,
  calculatePauseAfter,
} from '../utils/planetMessages';
import styles from './NastiaApp.module.css';

const ENV_CLAUDE_KEY = (process.env.REACT_APP_CLAUDE_API_KEY ?? '').trim();
const ENV_CLAUDE_PROXY = (process.env.REACT_APP_CLAUDE_PROXY_URL ?? '').trim();
const ENV_OPENAI_KEY = (process.env.REACT_APP_OPENAI_API_KEY ?? '').trim();
const ENV_OPENAI_PROXY = (process.env.REACT_APP_OPENAI_PROXY_URL ?? '').trim();

const PRIMARY_USER_NAME = 'Настя';
const MAX_STORED_NOTIFICATIONS = 200;
const HOROSCOPE_MEMORY_LIMIT = 12;
const STORY_ARC_LIMIT = 6;

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const pluralizeDays = (value: number): string => {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) {
    return 'дней';
  }
  if (last === 1) {
    return 'день';
  }
  if (last >= 2 && last <= 4) {
    return 'дня';
  }
  return 'дней';
};

const normalizeDate = (input: Date): Date => {
  const normalized = new Date(input);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const formatDayCount = (value: number): string => `${value} ${pluralizeDays(value)}`;

const buildPeriodTimingContext = (targetDate: Date, cycles: CycleData[]): string | null => {
  if (!targetDate) {
    return null;
  }

  const normalizedCycles: CycleData[] = [];

  for (const cycle of cycles) {
    if (!cycle?.startDate) {
      continue;
    }
    const start = new Date(cycle.startDate);
    if (Number.isNaN(start.getTime())) {
      continue;
    }
    normalizedCycles.push({
      ...cycle,
      startDate: start,
      endDate: cycle.endDate ? new Date(cycle.endDate) : undefined,
    });
  }

  if (!normalizedCycles.length) {
    return 'История циклов пустая, так что просто скажи, что фиксируете дату и наблюдаете за организмом.';
  }

  const stats = calculateCycleStats(normalizedCycles);
  const averageLength = stats.averageLength6Months || stats.averageLength;

  const summaryLines: string[] = [];

  if (averageLength) {
    summaryLines.push(`Средний цикл по журналу: около ${averageLength} ${pluralizeDays(averageLength)}.`);
  }

  if (stats.lastCycleLength) {
    summaryLines.push(`Прошлый цикл длился ${stats.lastCycleLength} ${pluralizeDays(stats.lastCycleLength)}.`);
  }

  if (stats.predictionConfidence) {
    summaryLines.push(`Уверенность прогноза: около ${stats.predictionConfidence}%.`);
  }

  const normalizedTarget = normalizeDate(targetDate);

  let predictedDiffDays: number | null = null;

  if (stats.nextPrediction instanceof Date && !Number.isNaN(stats.nextPrediction.getTime())) {
    const predicted = normalizeDate(stats.nextPrediction);
    predictedDiffDays = Math.round((normalizedTarget.getTime() - predicted.getTime()) / MS_IN_DAY);

    const diffPhrase =
      predictedDiffDays === 0
        ? 'совпадает с прогнозом'
        : predictedDiffDays > 0
          ? `опаздывает на ${formatDayCount(predictedDiffDays)}`
          : `пришла раньше на ${formatDayCount(Math.abs(predictedDiffDays))}`;

    summaryLines.push(`Прогноз ждал старт ${formatDate(predicted)}, факт ${diffPhrase}.`);
  } else {
    summaryLines.push('Прогноз по дате пока ненадёжный — данных мало.');
  }

  let ovulationDiffDays: number | null = null;

  if (stats.nextPrediction instanceof Date && !Number.isNaN(stats.nextPrediction.getTime())) {
    const ovulationEstimate = normalizeDate(addDays(stats.nextPrediction, -14));
    ovulationDiffDays = Math.round((normalizedTarget.getTime() - ovulationEstimate.getTime()) / MS_IN_DAY);

    if (ovulationDiffDays === 0) {
      summaryLines.push('Расчётная овуляция должна быть прямо сегодня — для менструации это крайне рано.');
    } else if (ovulationDiffDays < 0) {
      summaryLines.push(`По расчётам до овуляции ещё ${formatDayCount(Math.abs(ovulationDiffDays))} — организм резко ускорился.`);
    } else {
      const baseLine = `С расчётной овуляции прошло ${formatDayCount(ovulationDiffDays)}.`;
      if (ovulationDiffDays < 12) {
        summaryLines.push(`${baseLine} Это короче типичной лютеиновой фазы — тело явно торопится.`);
      } else if (ovulationDiffDays > 18) {
        summaryLines.push(`${baseLine} Это дольше обычного ожидания — можно подколоть организм за затяжку.`);
      } else {
        summaryLines.push(`${baseLine} Это вписывается в привычные 12–16 дней.`);
      }
    }
  }

  let directive: string;

  if (predictedDiffDays == null) {
    directive = 'Статистики мало — поддержи Настю, подбодри и предложи продолжать наблюдение.';
  } else if (predictedDiffDays === 0) {
    directive = 'Подчеркни, что организм отработал по расписанию и можно язвительно гордиться пунктуальностью.';
  } else if (predictedDiffDays > 0) {
    const delayText = formatDayCount(predictedDiffDays);
    directive =
      predictedDiffDays <= 2
        ? `Отметь, что месячные припозднились на ${delayText} — поддержи и намекни на стресс или недосып.`
        : `Подколи тело за задержку на ${delayText} и мягко предложи понаблюдать или обсудить с врачом, если такое повторяется.`;
  } else {
    const earlyDays = Math.abs(predictedDiffDays);
    const earlyText = formatDayCount(earlyDays);
    directive =
      earlyDays <= 2
        ? `Подметь, что цикл стартовал на ${earlyText} раньше и организм не стал ждать пикового ПМС.`
        : `Скажи, что месячные пришли слишком рано (на ${earlyText}) — саркастично попроси перепроверить дату и прислушаться к самочувствию.`;
  }

  if (ovulationDiffDays != null) {
    if (ovulationDiffDays <= 1) {
      directive =
        'По расчётам овуляция ещё совсем рядом, так что начало цикла выглядит подозрительно ранним — язвительно попроси Настю перепроверить дату и исключить ложную тревогу.';
    } else if (ovulationDiffDays < 10) {
      directive += ` Упомяни, что лютеиновая фаза вышла короткой (${formatDayCount(ovulationDiffDays)}) — посоветуй поберечь себя и наблюдать.`;
    } else if (ovulationDiffDays > 18) {
      directive += ` Добавь, что ожидание после овуляции растянулось на ${formatDayCount(ovulationDiffDays)} — подшути над организмом, который тянул до последнего.`;
    }
  }

  return `${summaryLines.join('\n')}\nРекомендация рассказчице: ${directive}`.trim();
};

const DEFAULT_LOADING_MESSAGES: HoroscopeLoadingMessage[] = [
  { emoji: '☎️', text: 'Звоним Марсу — уточняем, кто сегодня заведует твоим драйвом.' },
  { emoji: '💌', text: 'Через Венеру шлём письмо — ждём, чем она подсластит день.' },
  { emoji: '🛰️', text: 'Ловим сигнал от Юпитера — вдруг прилетит бонус удачи.' },
  { emoji: '☕️', text: 'Сатурн допивает кофе и пишет список обязанностей — терпим.' },
  { emoji: '🧹', text: 'Плутон наводит порядок в подсознании, разгребает завалы тревог.' },
  { emoji: '🌕', text: 'Луна примеряет настроение, подбирает идеальный градус драмы.' },
];


interface StoryAuthor {
  id: string;
  name: string;
  prompt: string;
  genre: string;
}

const STORY_AUTHORS: StoryAuthor[] = [
  {
    id: 'globa-mystic',
    name: 'Павел Глоба',
    genre: 'мистика',
    prompt: 'Смешивай бытовые детали и тревожную странность, наращивай тихое напряжение без громких эффектов. Фразы должны быть короткими, прямыми и чуть холодными.',
  },
  {
    id: 'shestopalov-thriller',
    name: 'Сергей Шестопалов',
    genre: 'триллер',
    prompt: 'Строй сцену как кинематографичный саспенс: густой воздух, навязчивые детали, ощущение, что за углом кто-то дышит. Держи кадр чётким и чувственным.',
  },
  {
    id: 'levina-psy',
    name: 'Светлана Левина',
    genre: 'психологическая драма',
    prompt: 'Показывай внутреннюю трансформацию через диалог с миром; философский тон держи мягким, но конкретные детали тела и пространства делай ощутимыми.',
  },
  {
    id: 'volguine-stream',
    name: 'Александр Волгин',
    genre: 'психологическая драма',
    prompt: 'Веди поток сознания плавно, через дыхание, свет и крошечные жесты. Детали должны цепляться друг за друга, создавая ощущение хрупкого равновесия.',
  },
  {
    id: 'zhuravel-dystopia',
    name: 'Олеся Журавель',
    genre: 'антиутопия',
    prompt: 'Соединяй иронию и холодную аналитику; показывай, как тело и быт реагируют на систему. Делай язык точным, с лёгким сарказмом.',
  },
  {
    id: 'kopaev-intense',
    name: 'Константин Дараган',
    genre: 'психологическая драма',
    prompt: 'Пиши с пронзительной интимностью: контраст между хрупкостью и яростью, телесные детали и откровенный внутренний монолог.',
  },
  {
    id: 'zaharov-introspective',
    name: 'Михаил Захаров',
    genre: 'психологическая драма',
    prompt: 'Исследуй внутренний монолог, задавай острые вопросы к себе, соединяй абстракцию и конкретные вещи, оставляя лёгкую загадку.',
  },
  {
    id: 'kopaev-gothic',
    name: 'Денис Куталёв',
    genre: 'мистика',
    prompt: 'Сочетай чувственность и готическую мрачность: шелк, кровь, свечи, мрамор. Пусть темнота будет соблазнительной и тягучей.',
  },
  {
    id: 'safonova-thriller',
    name: 'Вероника Сафонова',
    genre: 'триллер',
    prompt: 'Строй сцену как расследование: тихо, точно, с вниманием к запахам и фактам. Держи напряжение в каждом наблюдении.',
  },
  {
    id: 'geraskina-romance',
    name: 'Елена Герасимова',
    genre: 'роман',
    prompt: 'Подчёркивай социальные нюансы и внутренние сомнения. Лёгкая ирония, чёткие детали быта и эмоций, никаких лишних украшений.',
  },
];

// Саркастические фразы для начального экрана истории
const HISTORY_START_PROMPTS = [
  'Давай проверим, насколько ты правдива с собой сегодня',
  'Готова разобрать себя на части? Звёзды уже наточили скальпель',
  'Что если астрология знает о тебе больше, чем ты думаешь?',
  'Твоя карта готова рассказать правду — ты?',
  'Проверь себя на честность, пока никто не видит',
  'Узнаем, где ты врёшь себе сегодня',
  'Твоя тень хочет поговорить. Впустишь?',
  'Давай посмотрим, что прячешь даже от себя',
  'Готова услышать то, что знают планеты?',
  'Пора разобраться, кто ты на самом деле',
  'Проверь, где твои маски начинают трещать',
  'Давай найдём твою слабую точку',
  'Готова к честному разговору с собой?',
  'Узнаем, что карта нашёптывает о тебе',
  'Проверим, где ты играешь роль',
  'Давай посмотрим на тебя без фильтров',
  'Готова признать, что не всё под контролем?',
  'Узнаем, где прячется твой внутренний конфликт',
  'Пора взглянуть в зеркало, которое не врёт',
  'Проверь себя — вдруг что-то забыла про себя',
  'Давай найдём, где ты сама себе врёшь',
  'Готова к неудобной правде?',
  'Узнаем, что прячется за твоими привычками',
  'Проверим твои внутренние противоречия',
  'Давай посмотрим, где ты не такая, как думаешь',
  'Готова увидеть себя глазами звёзд?',
  'Узнаем, где ты притворяешься',
  'Проверь, насколько хорошо знаешь себя',
  'Давай найдём твои скрытые паттерны',
  'Готова к встрече с собой настоящей?',
];

// Названия кнопок для начального экрана
const HISTORY_START_BUTTONS = [
  'Начать историю',
  'Проверить себя',
  'Узнать правду',
  'Начать разбор',
  'Погнали',
  'Давай',
  'Покажи',
  'Начнём',
  'Валяй',
  'Попробуем',
  'Посмотрим',
  'Начать',
  'Вперёд',
  'Поехали',
  'Ну давай',
  'Запускай',
  'Включай',
  'Жду',
  'Готова',
  'Интересно',
  'Ладно',
  'Начать тест',
  'Проверим',
  'Узнать',
  'Открыть',
  'Посмотреть',
  'Начать путь',
  'Погрузиться',
  'Раскрыть',
  'Исследовать',
];

// Описания для начального экрана истории (что будет дальше)
const HISTORY_START_DESCRIPTIONS = [
  'Я создам для тебя персональную историю, в которой ты будешь делать выборы. А потом разберу каждое твоё решение по косточкам — покажу, где ты действуешь согласно своей природе, а где пытаешься казаться не той, кто ты есть',
  'Тебя ждёт интерактивная история с выборами. В конце я проанализирую твои решения и скажу, где ты была честна с собой, а где играла роль',
  'Пройдёшь через историю с развилками. Я буду следить за твоими выборами, а потом расскажу, что они говорят о тебе — включая то, что ты предпочла бы не слышать',
  'Я построю для тебя сюжет с несколькими ключевыми точками выбора. А в финале разберу, какие решения были настоящими, а какие — социально правильными',
  'Впереди короткая история, где ты принимаешь решения. Потом я покажу, где твои выборы совпадают с натальной картой, а где ты врала себе',
  'Сейчас ты попадёшь в ситуацию с выборами. Я запомню каждое решение, а потом объясню, что из этого правда твоё, а что — маска',
  'Ты пройдёшь через сценарий с развилками. В конце я сравню твои выборы с астрологическим профилем и скажу, где ты притворялась',
  'Персональная история на основе твоей карты. Ты делаешь выборы, я их записываю. А потом разбираю: где природа, где игра на публику',
  'Я запущу для тебя интерактивный сюжет. Твоя задача — принимать решения. Моя — потом рассказать, какие из них были честными, а какие нет',
  'Пройди историю с точками выбора, а я в конце объясню, где ты вела себя как обычно, а где пыталась выглядеть правильно',
];

// Тексты для кнопки отмены генерации истории
const CANCEL_GENERATION_TEXTS = [
  'Не готова',
  'Не хочу',
  'Передумала',
  'В другой раз',
  'Не сейчас',
  'Отмена',
  'Хватит',
  'Не надо',
  'Позже',
  'Остановить',
];

const DEFAULT_SERGEY_BANNER_COPY: SergeyBannerCopy = {
  title: 'А что там у Сережи?',
  subtitle: 'Серёжа опять что-то мудрит. Подглянем, что ему сулят звёзды на сегодня?',
  primaryButton: 'Посмотреть гороскоп',
  secondaryButton: 'Мне пофиг',
};

type HistoryStorySegmentKind = 'arc' | 'finale';

interface HistoryStorySegment {
  id: string;
  kind: HistoryStorySegmentKind;
  arcNumber?: number;
  stageLabel?: string;
  text: string;
  authorId: string;
  authorName: string;
  option?: HistoryStoryOption;
  choices?: HistoryStoryOption[];
  selectedOptionId?: string;
  timestamp: string; // ISO timestamp
}

const NOTIFICATION_TYPE_LABELS: Record<NotificationCategory, string> = {
  fertile_window: 'Фертильное окно',
  ovulation_day: 'День овуляции',
  period_forecast: 'Прогноз менструации',
  period_start: 'День менструации',
  period_check: 'Проверка начала менструации',
  period_waiting: 'Ожидание менструации',
  period_delay_warning: 'Возможная задержка',
  period_confirmed_day0: 'Менструация началась',
  period_confirmed_day1: 'Менструация — поддержка',
  period_confirmed_day2: 'Менструация — поддержка',
  birthday: 'День рождения',
  generic: 'Напоминание',
};

const ModernNastiaApp: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [horoscopeMemory, setHoroscopeMemory] = useState<HoroscopeMemoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('calendar');
  const [showSettings, setShowSettings] = useState(false);
  const [hasNewStoryMessage, setHasNewStoryMessage] = useState(false); // Флаг для badge "Узнай себя"
  const [githubToken, setGithubToken] = useState('');
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [remoteClaudeKey, setRemoteClaudeKey] = useState<string | null>(null);
  const [remoteClaudeProxyUrl, setRemoteClaudeProxyUrl] = useState<string | null>(null);
  const [remoteOpenAIKey, setRemoteOpenAIKey] = useState<string | null>(null);
  const [remoteOpenAIProxyUrl, setRemoteOpenAIProxyUrl] = useState<string | null>(null);

  const effectiveClaudeKey = useMemo(() => {
    const remote = remoteClaudeKey?.trim();
    if (remote && remote.length > 0) {
      return remote;
    }
    return ENV_CLAUDE_KEY.length > 0 ? ENV_CLAUDE_KEY : undefined;
  }, [remoteClaudeKey]);

  const effectiveClaudeProxyUrl = useMemo(() => {
    const remote = remoteClaudeProxyUrl?.trim();
    if (remote && remote.length > 0) {
      return remote;
    }
    return ENV_CLAUDE_PROXY.length > 0 ? ENV_CLAUDE_PROXY : undefined;
  }, [remoteClaudeProxyUrl]);

  const effectiveOpenAIKey = useMemo(() => {
    const remote = remoteOpenAIKey?.trim();
    if (remote && remote.length > 0) {
      return remote;
    }
    return ENV_OPENAI_KEY.length > 0 ? ENV_OPENAI_KEY : undefined;
  }, [remoteOpenAIKey]);

  const effectiveOpenAIProxyUrl = useMemo(() => {
    const remote = remoteOpenAIProxyUrl?.trim();
    if (remote && remote.length > 0) {
      return remote;
    }
    const envProxy = ENV_OPENAI_PROXY.length > 0 ? ENV_OPENAI_PROXY : undefined;
    return envProxy;
  }, [remoteOpenAIProxyUrl]);

  const hasAiCredentials = useMemo(() => {
    return Boolean(effectiveClaudeKey || effectiveClaudeProxyUrl || effectiveOpenAIKey || effectiveOpenAIProxyUrl);
  }, [effectiveClaudeKey, effectiveClaudeProxyUrl, effectiveOpenAIKey, effectiveOpenAIProxyUrl]);
  const [periodContent, setPeriodContent] = useState<PeriodModalContent | null>(null);
  const [periodContentStatus, setPeriodContentStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [periodContentError, setPeriodContentError] = useState<string | null>(null);
  const [periodHoroscope, setPeriodHoroscope] = useState<DailyHoroscope | null>(null);
  const [periodHoroscopeStatus, setPeriodHoroscopeStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [horoscopeVisible, setHoroscopeVisible] = useState(false);
  const [showDailyHoroscopeModal, setShowDailyHoroscopeModal] = useState(false);
  const [dailyHoroscope, setDailyHoroscope] = useState<DailyHoroscope | null>(null);
  const [dailyHoroscopeStatus, setDailyHoroscopeStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [dailyHoroscopeError, setDailyHoroscopeError] = useState<string | null>(null);
  const [dailyLoadingMessages, setDailyLoadingMessages] = useState<HoroscopeLoadingMessage[]>([]);
  const [dailyLoadingIndex, setDailyLoadingIndex] = useState(0);
  const [sergeyBannerDismissed, setSergeyBannerDismissed] = useState(false);
  const [sergeyHoroscope, setSergeyHoroscope] = useState<DailyHoroscope | null>(null);
  const [sergeyHoroscopeStatus, setSergeyHoroscopeStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [sergeyHoroscopeError, setSergeyHoroscopeError] = useState<string | null>(null);
  const initialSergeyLoadingMessages = useMemo(() => getSergeyLoadingFallback(), []);
  const [sergeyLoadingIndex, setSergeyLoadingIndex] = useState(0);
  const [sergeyLoadingMessages, setSergeyLoadingMessages] = useState<HoroscopeLoadingMessage[]>(initialSergeyLoadingMessages);
  const [sergeyLoadingMaxHeight, setSergeyLoadingMaxHeight] = useState<number | null>(null);
  const [sergeyBannerCopy, setSergeyBannerCopy] = useState<SergeyBannerCopy | null>(null);
  const [sergeyBannerCopyStatus, setSergeyBannerCopyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [, setSergeyBannerCopyError] = useState<string | null>(null);
  const [showQuestionBubble, setShowQuestionBubble] = useState(false);
  const [showJokeBubble, setShowJokeBubble] = useState(false);

  // Состояние для раскрывающихся описаний инсайтов
  type InsightType = 'cycle-length' | 'next-period' | 'fertile-window' | 'trend';
  const [expandedInsights, setExpandedInsights] = useState<Set<InsightType>>(new Set());
  const [insightDescriptions, setInsightDescriptions] = useState<Record<InsightType, InsightDescription | null>>({
    'cycle-length': null,
    'next-period': null,
    'fertile-window': null,
    'trend': null,
  });
  const [insightLoadingStates, setInsightLoadingStates] = useState<Record<InsightType, boolean>>({
    'cycle-length': false,
    'next-period': false,
    'fertile-window': false,
    'trend': false,
  });
  const [insightStyleMode, setInsightStyleMode] = useState<Record<InsightType, 'scientific' | 'human'>>({
    'cycle-length': 'scientific',
    'next-period': 'scientific',
    'fertile-window': 'scientific',
    'trend': 'scientific',
  });
  const [insightLoadingPhrases, setInsightLoadingPhrases] = useState<Record<InsightType, { emoji: string; text: string } | null>>({
    'cycle-length': null,
    'next-period': null,
    'fertile-window': null,
    'trend': null,
  });
  const insightControllersRef = useRef<Record<InsightType, AbortController | null>>({
    'cycle-length': null,
    'next-period': null,
    'fertile-window': null,
    'trend': null,
  });

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
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
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
  const [visibleNotificationIds, setVisibleNotificationIds] = useState<string[]>([]);
  const [visibleCycleIds, setVisibleCycleIds] = useState<string[]>([]);
  const [visibleCalendarElements, setVisibleCalendarElements] = useState<string[]>([]);
  const [visibleDiscoverElements, setVisibleDiscoverElements] = useState<string[]>([]);
  const [historyStoryAuthor, setHistoryStoryAuthor] = useState<StoryAuthor>(() => {
    const index = Math.floor(Math.random() * STORY_AUTHORS.length);
    return STORY_AUTHORS[index];
  });
  const [historyStoryAwaitingKeys, setHistoryStoryAwaitingKeys] = useState(false);
  const [historyStoryMenuOpen, setHistoryStoryMenuOpen] = useState(false);
  const [historyStorySegments, setHistoryStorySegments] = useState<HistoryStorySegment[]>([]);
  const historyStorySegmentsRef = useRef<HistoryStorySegment[]>([]);
  const historyStorySummaryRef = useRef('');
  const [historyStoryMeta, setHistoryStoryMeta] = useState<HistoryStoryMeta | null>(null);
  const historyStoryMetaRef = useRef<HistoryStoryMeta | null>(null);
  const [historyStoryOptions, setHistoryStoryOptions] = useState<HistoryStoryOption[]>([]);
  const [historyStoryLoading, setHistoryStoryLoading] = useState(false);
  const [historyStoryError, setHistoryStoryError] = useState<string | null>(null);
  const [historyStoryMode, setHistoryStoryMode] = useState<'story' | 'cycles'>('story');
  const [historyStoryTyping, setHistoryStoryTyping] = useState(false);
  const [historyStoryPhase, setHistoryStoryPhase] = useState<'idle' | 'generating' | 'clearing' | 'ready'>('idle');
  const [historyStartPrompt, setHistoryStartPrompt] = useState('');
  const [historyStartButton, setHistoryStartButton] = useState('');
  const [historyStartDescription, setHistoryStartDescription] = useState('');
  const [historyCancelButtonText, setHistoryCancelButtonText] = useState('');

  // Новые состояния для чат-интерфейса генерации
  const [planetChatMessages, setPlanetChatMessages] = useState<Array<{ planet: string; message: string; id: string; time: string; isSystem?: boolean }>>([]);
  const [currentTypingPlanet, setCurrentTypingPlanet] = useState<string | null>(null);
  const planetMessagesTimeoutRef = useRef<number[]>([]);
  const [planetMessagesClearing, setPlanetMessagesClearing] = useState(false);
  const planetMessagesGenerationStartedRef = useRef(false);

  // Персонализированные сообщения от планет на основе натальной карты
  const [personalizedPlanetMessages, setPersonalizedPlanetMessages] = useState<PersonalizedPlanetMessages | null>(null);
  const personalizedPlanetMessagesRef = useRef<PersonalizedPlanetMessages | null>(null);
  const [isLoadingPersonalizedMessages, setIsLoadingPersonalizedMessages] = useState(false);
  const isLoadingPersonalizedMessagesRef = useRef(false);
  const personalizedMessagesAbortControllerRef = useRef<AbortController | null>(null);
  const [historyButtonsHiding, setHistoryButtonsHiding] = useState(false);
  const [visibleButtonsCount, setVisibleButtonsCount] = useState(0);
  const [historyStoryFinalSummary, setHistoryStoryFinalSummary] = useState<{ human: string; astrological: string } | null>(null);
  const [finaleInterpretationMode, setFinaleInterpretationMode] = useState<'human' | 'astrological'>('human');
  const historyStoryPendingOptionsRef = useRef<HistoryStoryOption[] | null>(null);
  const [introMessagesVisible, setIntroMessagesVisible] = useState<number>(0); // 0-4 для показа интро-сообщений
  const [introTyping, setIntroTyping] = useState<boolean>(false);
  const introAnimationTimeoutsRef = useRef<number[]>([]);
  const buttonAnimationTimeoutsRef = useRef<number[]>([]);
  const historyStoryPendingChoiceRef = useRef<HistoryStoryOption | undefined>(undefined);
  const historyStoryMenuRef = useRef<HTMLDivElement | null>(null);
  const historyStoryMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const historyStoryTypingTimeoutRef = useRef<number | null>(null);
  const historyStoryFetchControllerRef = useRef<AbortController | null>(null);
  const historyMessagesRef = useRef<HTMLDivElement | null>(null);
  const historyScrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const historyScrollTimeoutRef = useRef<number | null>(null);
  const historyScrollContainerRef = useRef<HTMLElement | null>(null);
  const moonScrollPerformedRef = useRef(false);
  const clearHistoryStoryTypingTimer = useCallback(() => {
    if (historyStoryTypingTimeoutRef.current !== null) {
      window.clearTimeout(historyStoryTypingTimeoutRef.current);
      historyStoryTypingTimeoutRef.current = null;
    }
  }, []);

  const abortHistoryStoryRequest = useCallback(() => {
    if (historyStoryFetchControllerRef.current) {
      historyStoryFetchControllerRef.current.abort();
      historyStoryFetchControllerRef.current = null;
    }
  }, []);

  const clearButtonAnimationTimers = useCallback(() => {
    buttonAnimationTimeoutsRef.current.forEach(id => window.clearTimeout(id));
    buttonAnimationTimeoutsRef.current = [];
  }, []);

  const clearIntroAnimationTimers = useCallback(() => {
    introAnimationTimeoutsRef.current.forEach(id => window.clearTimeout(id));
    introAnimationTimeoutsRef.current = [];
  }, []);

  const stopGenerationAnimation = useCallback(() => {
    // Очищаем все таймеры планет
    planetMessagesTimeoutRef.current.forEach(timer => window.clearTimeout(timer));
    planetMessagesTimeoutRef.current = [];
  }, []);

  const resetHistoryStoryState = useCallback(() => {
    abortHistoryStoryRequest();
    clearHistoryStoryTypingTimer();
    clearButtonAnimationTimers();
    clearIntroAnimationTimers();

    // Останавливаем анимацию генерации
    stopGenerationAnimation();
    setPlanetChatMessages([]);
    setPlanetMessagesClearing(false);
    planetMessagesGenerationStartedRef.current = false;

    clearPsychContractContext();
    historyStoryPendingOptionsRef.current = null;
    historyStoryPendingChoiceRef.current = undefined;
    historyStorySegmentsRef.current = [];
    historyStorySummaryRef.current = '';
    historyStoryMetaRef.current = null;
    moonScrollPerformedRef.current = false;
    setHistoryStorySegments([]);
    setHistoryStoryOptions([]);
    setHistoryStoryMeta(null);
    setHistoryStoryFinalSummary(null);
    setHistoryStoryError(null);
    setHistoryStoryLoading(false);
    setHistoryStoryTyping(false);
    setHistoryStoryMode('story');
    setHistoryStoryMenuOpen(false);
    setVisibleButtonsCount(0);
    setHistoryStoryPhase('idle');
    setIntroMessagesVisible(0);
    setIntroTyping(false);
    historyScrollContainerRef.current = null;
  }, [
    abortHistoryStoryRequest,
    clearHistoryStoryTypingTimer,
    clearButtonAnimationTimers,
    clearIntroAnimationTimers,
    stopGenerationAnimation,
  ]);

  const startTypingHistorySegment = useCallback((segment: HistoryStorySegment) => {
    clearHistoryStoryTypingTimer();
    const chunk = segment.text;

    if (!chunk) {
      setHistoryStoryTyping(false);
      const pending = historyStoryPendingOptionsRef.current;
      if (pending) {
        setHistoryStoryOptions(pending);
        historyStoryPendingOptionsRef.current = null;
      }
      return;
    }

    // Показываем индикатор "печатает..."
    setHistoryStoryTyping(true);
    setHistoryStoryOptions([]);

    // Вычисляем время показа индикатора на основе длины текста (минимум 1с, максимум 3с)
    const typingDuration = Math.min(Math.max(chunk.length * 15, 1000), 3000);

    // После задержки показываем сообщение целиком
    historyStoryTypingTimeoutRef.current = window.setTimeout(() => {
      setHistoryStoryTyping(false);
      setHistoryStorySegments(prev => {
        const updated = [...prev, segment];
        historyStorySegmentsRef.current = updated;
        return updated;
      });
      const pending = historyStoryPendingOptionsRef.current;
      if (pending) {
        setHistoryStoryOptions(pending);
        historyStoryPendingOptionsRef.current = null;
      }
    }, typingDuration);
  }, [clearHistoryStoryTypingTimer]);

  const updateHistoryStorySummary = useCallback((segments: HistoryStorySegment[]) => {
    const CONTEXT_SEGMENTS = 4;
    const arcSegments = segments.filter(segment => segment.kind === 'arc');

    if (arcSegments.length <= CONTEXT_SEGMENTS) {
      historyStorySummaryRef.current = '';
      return;
    }

    const older = arcSegments.slice(0, arcSegments.length - CONTEXT_SEGMENTS);
    const summaryChunks = older.map((segment, index) => {
      const prefix = index + 1;
      return `${prefix}. ${segment.authorName}: ${segment.text}`;
    });

    let summary = summaryChunks.join(' ');
    summary = summary.replace(/\s+/g, ' ').trim();

    if (summary.length > 420) {
      summary = `${summary.slice(0, 420).trimEnd()}…`;
    }

    historyStorySummaryRef.current = `Сжатая сводка предыдущих событий: ${summary}`;
  }, []);

  const fetchHistoryStoryChunk = useCallback(
    async (choice?: HistoryStoryOption, authorOverride?: StoryAuthor) => {
      if (!hasAiCredentials) {
        setHistoryStoryLoading(false);
        if (!historyStoryAwaitingKeys) {
          setHistoryStoryAwaitingKeys(true);
        }
        historyStoryPendingChoiceRef.current = choice;
        return;
      }

      abortHistoryStoryRequest();

      const controller = new AbortController();
      historyStoryFetchControllerRef.current = controller;

      setHistoryStoryLoading(true);
      setHistoryStoryError(null);
      historyStoryPendingChoiceRef.current = choice;

      try {
        const activeAuthor = authorOverride ?? historyStoryAuthor;
        if (!activeAuthor) {
          throw new Error('History story author is not available');
        }

        const arcSegments = historyStorySegmentsRef.current.filter(segment => segment.kind === 'arc');
        const recentSegments = arcSegments.slice(-4);
        const response = await generateHistoryStoryChunk({
          segments: recentSegments.map((segment, index) => ({
            text: segment.text,
            arc: segment.arcNumber ?? arcSegments.length - recentSegments.length + index + 1,
            optionTitle: segment.option?.title,
            optionDescription: segment.option?.description,
          })),
          currentChoice: choice,
          summary: historyStorySummaryRef.current || undefined,
          author: {
            name: activeAuthor.name,
            stylePrompt: activeAuthor.prompt,
            genre: activeAuthor.genre,
          },
          arcLimit: STORY_ARC_LIMIT,
          mode: 'arc',
          currentArc: arcSegments.length + 1,
          contract: historyStoryMetaRef.current?.contract,
          signal: controller.signal,
          claudeApiKey: effectiveClaudeKey,
          claudeProxyUrl: effectiveClaudeProxyUrl,
          openAIApiKey: effectiveOpenAIKey,
          openAIProxyUrl: effectiveOpenAIProxyUrl,
        });

        if (controller.signal.aborted) {
          return;
        }

        if (response.meta) {
          setHistoryStoryMeta(response.meta);
          historyStoryMetaRef.current = response.meta;
        }

        // Останавливаем анимацию генерации и переходим в режим очистки диалога планет
        stopGenerationAnimation();
        setHistoryStoryPhase('clearing');

        const newSegment: HistoryStorySegment = {
          id: `segment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          kind: 'arc',
          arcNumber: response.node?.arc ?? arcSegments.length + 1,
          stageLabel: response.node?.stage,
          text: response.node?.scene ?? '',
          authorId: activeAuthor.id,
          authorName: activeAuthor.name,
          option: choice,
          choices: response.options,
          timestamp: new Date().toISOString(),
        };

        historyStoryPendingOptionsRef.current = response.options;
        startTypingHistorySegment(newSegment);
        historyStoryPendingChoiceRef.current = undefined;
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to generate history story chunk', error);
        setHistoryStoryError('Не удалось придумать продолжение. Попробуй ещё раз.');
        historyStoryPendingOptionsRef.current = null;
        setHistoryStoryOptions([]);
        setHistoryStoryTyping(false);
      } finally {
        if (!controller.signal.aborted) {
          setHistoryStoryLoading(false);
          historyStoryFetchControllerRef.current = null;
        }
      }
    },
    [
      abortHistoryStoryRequest,
      historyStoryAuthor,
      hasAiCredentials,
      historyStoryAwaitingKeys,
      effectiveClaudeKey,
      effectiveClaudeProxyUrl,
      effectiveOpenAIKey,
      effectiveOpenAIProxyUrl,
      startTypingHistorySegment,
      stopGenerationAnimation,
    ],
  );

  const fetchHistoryStoryFinale = useCallback(
    async (choice?: HistoryStoryOption) => {
      if (!hasAiCredentials) {
        setHistoryStoryLoading(false);
        if (!historyStoryAwaitingKeys) {
          setHistoryStoryAwaitingKeys(true);
        }
        historyStoryPendingChoiceRef.current = choice;
        return;
      }

      abortHistoryStoryRequest();

      const controller = new AbortController();
      historyStoryFetchControllerRef.current = controller;

      setHistoryStoryLoading(true);
      setHistoryStoryError(null);
      historyStoryPendingChoiceRef.current = choice;

      try {
        const activeAuthor = historyStoryAuthor;
        if (!activeAuthor) {
          throw new Error('History story author is not available');
        }

        const arcSegments = historyStorySegmentsRef.current.filter(segment => segment.kind === 'arc');
        const recentSegments = arcSegments.slice(-4);

        const response = await generateHistoryStoryChunk({
          segments: recentSegments.map((segment, index) => ({
            text: segment.text,
            arc: segment.arcNumber ?? arcSegments.length - recentSegments.length + index + 1,
            optionTitle: segment.option?.title,
            optionDescription: segment.option?.description,
          })),
          currentChoice: choice,
          summary: historyStorySummaryRef.current || undefined,
          author: {
            name: activeAuthor.name,
            stylePrompt: activeAuthor.prompt,
            genre: activeAuthor.genre,
          },
          arcLimit: STORY_ARC_LIMIT,
          mode: 'finale',
          contract: historyStoryMetaRef.current?.contract,
          signal: controller.signal,
          claudeApiKey: effectiveClaudeKey,
          claudeProxyUrl: effectiveClaudeProxyUrl,
          openAIApiKey: effectiveOpenAIKey,
          openAIProxyUrl: effectiveOpenAIProxyUrl,
        });

        if (controller.signal.aborted) {
          return;
        }

        if (response.meta) {
          setHistoryStoryMeta(response.meta);
          historyStoryMetaRef.current = response.meta;
        }

        historyStoryPendingOptionsRef.current = null;
        setHistoryStoryOptions([]);

        if (response.finale) {
          const finaleSegment: HistoryStorySegment = {
            id: `segment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            kind: 'finale',
            stageLabel: 'Финал',
            text: response.finale.resolution,
            authorId: activeAuthor.id,
            authorName: activeAuthor.name,
            option: choice,
            timestamp: new Date().toISOString(),
          };
          startTypingHistorySegment(finaleSegment);

          setHistoryStoryFinalSummary({
            human: response.finale.humanInterpretation,
            astrological: response.finale.astrologicalInterpretation,
          });
        } else {
          setHistoryStoryFinalSummary(null);
        }

        historyStoryPendingChoiceRef.current = undefined;
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to generate history story finale', error);
        setHistoryStoryError('Не удалось сформировать финал. Попробуй ещё раз.');
        setHistoryStoryTyping(false);
      } finally {
        if (!controller.signal.aborted) {
          setHistoryStoryLoading(false);
          historyStoryFetchControllerRef.current = null;
        }
      }
    },
    [
      abortHistoryStoryRequest,
      historyStoryAuthor,
      hasAiCredentials,
      historyStoryAwaitingKeys,
      effectiveClaudeKey,
      effectiveClaudeProxyUrl,
      effectiveOpenAIKey,
      effectiveOpenAIProxyUrl,
      startTypingHistorySegment,
    ],
  );

  const startGenerationAnimation = useCallback(() => {
    // Очищаем предыдущие таймеры
    planetMessagesTimeoutRef.current.forEach(timer => window.clearTimeout(timer));
    planetMessagesTimeoutRef.current = [];

    // Сбрасываем сообщения
    setPlanetChatMessages([]);
    setCurrentTypingPlanet(null);

    let messagePoolRef: Array<{ planet: string; message: string }> = [];

    // ВСЕГДА показываем пролог и подключения планет
    showIntroductionMessage();

    // Проверяем статус персонализированных сообщений
    if (personalizedPlanetMessages &&
        personalizedPlanetMessages.dialogue &&
        Array.isArray(personalizedPlanetMessages.dialogue) &&
        personalizedPlanetMessages.dialogue.length > 0) {
      // Персонализированный диалог уже загружен - запускаем его ПОСЛЕ подключения планет
      console.log('[GenerationAnimation] ✅ Personalized dialogue ready, will start after planets connect');

      // Задержка после последнего подключения планет (Нептун: 4800ms) + пауза 600ms
      const startDialogueTimer = window.setTimeout(() => {
        console.log('[GenerationAnimation] Starting personalized dialogue');
        const pool: Array<{ planet: string; message: string }> = [];
        for (const dialogueMessage of personalizedPlanetMessages.dialogue) {
          pool.push({ planet: dialogueMessage.planet, message: dialogueMessage.message });
        }
        startMessageGeneration(pool, false);
      }, 5400);

      planetMessagesTimeoutRef.current.push(startDialogueTimer);
    } else if (isLoadingPersonalizedMessages) {
      // Диалог загружается - ждём
      console.log('[GenerationAnimation] ⏳ Waiting for personalized dialogue to load...');
      waitForPersonalizedMessages();
    } else {
      console.log('[GenerationAnimation] ⚠️ No personalized dialogue available and not loading');
    }

    // Функция показа вступительного сообщения и подключения планет
    function showIntroductionMessage() {
      const messageTime = new Date();
      const hours = messageTime.getHours().toString().padStart(2, '0');
      const minutes = messageTime.getMinutes().toString().padStart(2, '0');

      // Сначала приветствие от Луны
      setPlanetChatMessages([{
        planet: 'Луна',
        message: 'Так, коллеги, собираемся! Сейчас обсудим, какую историю для Насти придумать...',
        time: `${hours}:${minutes}`,
        id: 'intro-message',
      }]);

      // Потом планеты по очереди подключаются с индивидуальными задержками
      // Задержки отражают характер планеты: быстрые подключаются раньше, медленные позже
      const planetsWithDelays = [
        { planet: 'Меркурий', delay: 600 },   // Самый быстрый - первый
        { planet: 'Марс', delay: 900 },       // Быстрый, решительный
        { planet: 'Венера', delay: 1300 },    // Легкая, но не спешит
        { planet: 'Уран', delay: 1500 },      // Непредсказуемый - может и быстро
        { planet: 'Плутон', delay: 2200 },    // Медленный, тяжеловесный
        { planet: 'Юпитер', delay: 2700 },    // Философский, неторопливый
        { planet: 'Сатурн', delay: 3300 },    // Строгий, размеренный
        { planet: 'Хирон', delay: 4000 },     // Задумчивый, медленный
        { planet: 'Нептун', delay: 4800 },    // Самый медленный - последний
      ];

      planetsWithDelays.forEach(({ planet, delay }) => {
        const timer = window.setTimeout(() => {
          const time = new Date();
          const h = time.getHours().toString().padStart(2, '0');
          const m = time.getMinutes().toString().padStart(2, '0');

          setPlanetChatMessages(prev => [
            ...prev,
            {
              planet,
              message: `подключился к чату...`,
              id: `planet-join-${planet}-${Date.now()}`,
              time: `${h}:${m}`,
              isSystem: true,
            },
          ]);
        }, delay);

        planetMessagesTimeoutRef.current.push(timer);
      });
    }

    // Функция ожидания загрузки персонализированных сообщений
    function waitForPersonalizedMessages() {
      const checkInterval = 200;
      let checkCount = 0;
      const maxChecks = 150; // Максимум 30 секунд (150 * 200ms)

      const checkMessages = () => {
        checkCount++;

        const currentMessages = personalizedPlanetMessagesRef.current;
        const currentLoading = isLoadingPersonalizedMessagesRef.current;

        // Проверяем, загрузились ли сообщения
        if (currentMessages &&
            currentMessages.dialogue &&
            Array.isArray(currentMessages.dialogue) &&
            currentMessages.dialogue.length > 0) {
          console.log('[GenerationAnimation] ✅ Personalized dialogue loaded, continuing dialogue!');

          // Проверяем, не запущена ли уже генерация
          if (planetMessagesGenerationStartedRef.current) {
            console.log('[GenerationAnimation] ⚠️ Generation already started, skipping duplicate');
            return;
          }

          // НЕ очищаем чат - диалог продолжается в том же чате!
          // Создаём пул сообщений
          const newPool: Array<{ planet: string; message: string }> = [];
          for (const dialogueMessage of currentMessages.dialogue) {
            newPool.push({ planet: dialogueMessage.planet, message: dialogueMessage.message });
          }

          // Запускаем анимацию - сообщения добавятся к уже существующим
          planetMessagesGenerationStartedRef.current = true;
          startMessageGeneration(newPool, false);
          return;
        }

        // Если произошла ошибка
        if (!currentLoading) {
          console.log('[GenerationAnimation] ❌ Failed to load personalized messages');
          return;
        }

        // Продолжаем проверять
        if (checkCount < maxChecks) {
          const timer = window.setTimeout(checkMessages, checkInterval);
          planetMessagesTimeoutRef.current.push(timer);
        } else {
          console.log('[GenerationAnimation] ⏱️ Timeout waiting for personalized messages');
        }
      };

      // Начинаем проверять
      const timer = window.setTimeout(checkMessages, checkInterval);
      planetMessagesTimeoutRef.current.push(timer);
    }

    // Функция для запуска генерации сообщений
    function startMessageGeneration(
      initialMessagePool: Array<{ planet: string; message: string }>,
      shouldWatchForPersonalized: boolean
    ) {
      // Диалог идёт строго по порядку - это связный разговор!
      let shuffledPool = [...initialMessagePool];
      let messageIndex = 0;

      // Функция для генерации одного сообщения с индивидуальными задержками для каждой планеты
      const generatePlanetMessage = (delay: number) => {
        // Если сообщения закончились, останавливаем генерацию
        if (messageIndex >= shuffledPool.length) {
          console.log('[GenerationAnimation] ✅ All personalized messages shown');
          return;
        }

        const { planet, message } = shuffledPool[messageIndex];
        messageIndex++;

        // Рассчитываем индивидуальную паузу перед началом печати для этой планеты
        const pauseBefore = calculatePauseBefore(planet);

        // Показываем индикатор печати с индивидуальной задержкой
        const typingTimer = window.setTimeout(() => {
          setCurrentTypingPlanet(planet);
        }, delay + pauseBefore);
        planetMessagesTimeoutRef.current.push(typingTimer);

        // Рассчитываем индивидуальную длительность печати на основе длины сообщения и скорости планеты
        const typingDuration = calculateTypingDuration(message, planet);
        const messageId = `planet-msg-${Date.now()}-${Math.random()}`;

        const messageTimer = window.setTimeout(() => {
          setCurrentTypingPlanet(null);

          // Рассчитываем время для сообщения
          const messageTime = new Date();
          const hours = messageTime.getHours().toString().padStart(2, '0');
          const minutes = messageTime.getMinutes().toString().padStart(2, '0');

          // Добавляем сообщение
          setPlanetChatMessages(prev => [
            ...prev,
            {
              planet,
              message,
              id: messageId,
              time: `${hours}:${minutes}`,
            },
          ]);

          // Рассчитываем индивидуальную паузу после сообщения для этой планеты
          const pauseAfter = calculatePauseAfter(planet);
          generatePlanetMessage(pauseAfter);
        }, delay + pauseBefore + typingDuration);
        planetMessagesTimeoutRef.current.push(messageTimer);
      };

      // Запускаем первое сообщение через небольшую начальную задержку
      generatePlanetMessage(0);
    }
  }, [personalizedPlanetMessages, isLoadingPersonalizedMessages]);

  const startIntroMessagesAnimation = useCallback(() => {
    clearIntroAnimationTimers();
    setIntroMessagesVisible(0);
    setIntroTyping(false);

    // Добавляем сообщение от "История" о контракте напрямую в planetChatMessages
    const now = new Date();

    // Показываем индикатор печати для контракта
    const contractTypingTimer = window.setTimeout(() => {
      setCurrentTypingPlanet('История');
    }, 600);
    introAnimationTimeoutsRef.current.push(contractTypingTimer);

    // Через 1.5 сек показываем сообщение с контрактом (без слова "Контракт:")
    const contractMessageTimer = window.setTimeout(() => {
      setCurrentTypingPlanet(null);
      const messageTime = new Date(now.getTime() + 2100);
      const hours = messageTime.getHours().toString().padStart(2, '0');
      const minutes = messageTime.getMinutes().toString().padStart(2, '0');
      const contractMessage = {
        planet: 'История',
        message: historyStoryMetaRef.current?.contract ?? 'Контракт не определён',
        id: `story-contract-${Date.now()}`,
        time: `${hours}:${minutes}`,
      };
      setPlanetChatMessages(prev => [...prev, contractMessage]);

      // После показа контракта переходим в ready
      setIntroMessagesVisible(4);
    }, 2100);
    introAnimationTimeoutsRef.current.push(contractMessageTimer);
  }, [clearIntroAnimationTimers, historyStoryAuthor]);

  const handleCancelGeneration = useCallback(() => {
    console.log('[HistoryStory] Cancelling generation');
    resetHistoryStoryState();
    setHistoryStoryPhase('idle');
  }, [resetHistoryStoryState]);

  const handleFinaleInterpretationToggle = useCallback((mode: 'human' | 'astrological') => {
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
    setFinaleInterpretationMode(mode);
    requestAnimationFrame(() => {
      window.scrollTo({ top: currentScroll, behavior: 'auto' });
    });
  }, []);

  const initiateHistoryStory = useCallback(() => {
    if (!hasAiCredentials) {
      if (!historyStoryAwaitingKeys) {
        console.log('[HistoryStory] Waiting for AI credentials before starting story');
        setHistoryStoryAwaitingKeys(true);
      }
      return;
    }

    if (historyStoryAwaitingKeys) {
      setHistoryStoryAwaitingKeys(false);
    }

    resetHistoryStoryState();

    // Переходим в фазу генерации
    setHistoryStoryPhase('generating');

    // Сразу запускаем анимацию - она будет ждать загрузки персонализированных сообщений
    startGenerationAnimation();

    // Выбираем случайный текст для кнопки отмены
    const cancelText = CANCEL_GENERATION_TEXTS[Math.floor(Math.random() * CANCEL_GENERATION_TEXTS.length)];
    setHistoryCancelButtonText(cancelText);

    const persona = STORY_AUTHORS[Math.floor(Math.random() * STORY_AUTHORS.length)];
    setHistoryStoryAuthor(persona);

    // Запускаем генерацию истории
    void fetchHistoryStoryChunk(undefined, persona);
  }, [
    fetchHistoryStoryChunk,
    hasAiCredentials,
    historyStoryAwaitingKeys,
    resetHistoryStoryState,
    startGenerationAnimation,
  ]);

  const handleHistoryOptionSelect = useCallback(
    (option: HistoryStoryOption) => {
      setHistoryStoryMode('story');
      setHistoryButtonsHiding(true);
      clearButtonAnimationTimers();
      setVisibleButtonsCount(0);

      setHistoryStorySegments(prevSegments => {
        const updated = [...prevSegments];
        for (let index = updated.length - 1; index >= 0; index -= 1) {
          const segment = updated[index];
          if (segment.kind === 'arc') {
            if (segment.selectedOptionId === option.id) {
              break;
            }
            updated[index] = { ...segment, selectedOptionId: option.id, option: option };
            break;
          }
        }
        historyStorySegmentsRef.current = updated;
        return updated;
      });

      const arcCount = historyStorySegmentsRef.current.filter(segment => segment.kind === 'arc').length;

      setTimeout(() => {
        setHistoryStoryOptions([]);
        setHistoryButtonsHiding(false);
        // Показываем индикатор загрузки сразу
        setHistoryStoryLoading(true);
        if (arcCount >= STORY_ARC_LIMIT) {
          void fetchHistoryStoryFinale(option);
        } else {
          void fetchHistoryStoryChunk(option);
        }
      }, 550); // 350ms анимация + 160ms последняя задержка + запас
    },
    [clearButtonAnimationTimers, fetchHistoryStoryChunk, fetchHistoryStoryFinale],
  );


  const handleHistoryRetry = useCallback(() => {
    if (historyStoryLoading) {
      return;
    }

    const arcSegments = historyStorySegmentsRef.current.filter(segment => segment.kind === 'arc');
    const isFinalPhase = arcSegments.length >= STORY_ARC_LIMIT;

    const pendingChoice = historyStoryPendingChoiceRef.current;
    if (pendingChoice) {
      if (isFinalPhase) {
        void fetchHistoryStoryFinale(pendingChoice);
      } else {
        void fetchHistoryStoryChunk(pendingChoice);
      }
      return;
    }

    const lastSegment = historyStorySegmentsRef.current[historyStorySegmentsRef.current.length - 1];
    if (lastSegment?.option) {
      if (isFinalPhase) {
        void fetchHistoryStoryFinale(lastSegment.option);
      } else {
        void fetchHistoryStoryChunk(lastSegment.option);
      }
      return;
    }

    initiateHistoryStory();
  }, [fetchHistoryStoryChunk, fetchHistoryStoryFinale, historyStoryLoading, initiateHistoryStory]);
  const readIdsRef = useRef(readIds);
  const notificationsRequestSeqRef = useRef(0);
  const isMountedRef = useRef(true);
  const sergeyRequestControllerRef = useRef<AbortController | null>(null);
  const sergeyBannerCopyControllerRef = useRef<AbortController | null>(null);
  const sergeyLoadingControllerRef = useRef<AbortController | null>(null);
  const sergeyLoadingMeasureRef = useRef<HTMLDivElement | null>(null);
  const dataHydratedRef = useRef(false);
  const horoscopeMemoryRef = useRef<HoroscopeMemoryEntry[]>([]);
  const cyclesRef = useRef<CycleData[]>([]);
  const dailyHoroscopeBodyRef = useRef<HTMLDivElement | null>(null);
  const sergeyBannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    readIdsRef.current = readIds;
  }, [readIds]);

  useEffect(() => {
    historyStoryMetaRef.current = historyStoryMeta;
  }, [historyStoryMeta]);

  useEffect(() => {
    historyStorySegmentsRef.current = historyStorySegments;
  }, [historyStorySegments]);

  useEffect(() => {
    updateHistoryStorySummary(historyStorySegments);
  }, [historyStorySegments, updateHistoryStorySummary]);

  useEffect(() => {
    if (!historyStoryMenuOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (historyStoryMenuRef.current?.contains(target)) {
        return;
      }
      if (historyStoryMenuButtonRef.current?.contains(target)) {
        return;
      }
      setHistoryStoryMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [historyStoryMenuOpen]);

  // Автоскролл для планетарных сообщений в фазе generating
  useEffect(() => {
    if (historyStoryPhase !== 'generating') {
      return;
    }

    if (planetChatMessages.length === 0 && !currentTypingPlanet) {
      return;
    }

    // Используем тройной requestAnimationFrame для гарантированного ожидания рендера
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Скроллим весь window до конца страницы
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
          });
        });
      });
    });
  }, [planetChatMessages, currentTypingPlanet, historyStoryPhase]);

  // Автоскролл для сообщений истории в фазе ready
  useEffect(() => {
    if (historyStoryPhase !== 'ready') {
      return;
    }

    // Проверяем, это Arc 1 и есть ли история с кнопками
    const currentArc = historyStorySegments.length > 0 ? historyStorySegments[historyStorySegments.length - 1].arcNumber : undefined;
    const isArc1 = currentArc === 1;
    const hasChoices = historyStoryOptions.length > 0;

    if (isArc1 && hasChoices && !moonScrollPerformedRef.current && !historyStoryLoading && !historyStoryTyping) {
      // Arc 1: скроллим к сообщению Луны после того, как появились кнопки
      const buttonCount = historyStoryOptions.length;
      const waitTime = (buttonCount * 500) + 700; // Время анимации кнопок + запас

      setTimeout(() => {
        const moonEl = document.querySelector('[data-author="Luna"]');
        if (moonEl) {
          const rect = (moonEl as HTMLElement).getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetTop = scrollTop + rect.top - 20; // 20px отступ сверху

          window.scrollTo({
            top: targetTop,
            behavior: 'smooth'
          });
          moonScrollPerformedRef.current = true;
        }
      }, waitTime);
    } else if (!isArc1) {
      // Все остальные дуги: скроллим вниз
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: 'smooth'
            });
          });
        });
      });
    }
  }, [historyStorySegments, historyStoryLoading, historyStoryTyping, historyStoryPhase, historyStoryOptions]);

  // Анимация удаления сообщений планет и показ контракта при переходе в фазу 'clearing'
  useEffect(() => {
    if (historyStoryPhase !== 'clearing') {
      return;
    }

    console.log('[HistoryStory] Story is ready, clearing planet messages with animation');

    // Устанавливаем флаг начала анимации удаления
    setPlanetMessagesClearing(true);

    // Даем время на CSS анимацию удаления сообщений планет (600ms)
    const clearTimer = window.setTimeout(() => {
      // Удаляем ТОЛЬКО сообщения планет, оставляем сообщения от "История" (контракт)
      setPlanetChatMessages(prev => prev.filter(msg => msg.planet === 'История'));
      setCurrentTypingPlanet(null);
      setPlanetMessagesClearing(false);
      console.log('[HistoryStory] Planet messages cleared, contract preserved');
    }, 600);

    // Сразу после завершения анимации удаления (600ms) + пауза (400ms) = 1000ms
    const contractTimer = window.setTimeout(() => {
      console.log('[HistoryStory] Starting intro messages animation (contract)');
      // Показываем контракт с анимацией печати
      startIntroMessagesAnimation();
    }, 1000);

    // Переходим в фазу 'ready' после показа контракта:
    // 1000ms (удаление + пауза) + 2700ms (анимация контракта) = 3700ms
    const readyTimer = window.setTimeout(() => {
      setHistoryStoryPhase('ready');
      console.log('[HistoryStory] Showing story');
    }, 3700);

    return () => {
      window.clearTimeout(clearTimer);
      window.clearTimeout(contractTimer);
      window.clearTimeout(readyTimer);
    };
  }, [historyStoryPhase, startIntroMessagesAnimation]);

  // Сбрасываем badge при переходе на вкладку "Узнай себя" и прокручиваем вниз
  useEffect(() => {
    if (activeTab === 'discover') {
      setHasNewStoryMessage(false);

      // Прокручиваем до конца содержимого вкладки "Узнай себя"
      // Используем тройной requestAnimationFrame для гарантированного ожидания рендера
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: 'smooth'
            });
          });
        });
      });
    }
  }, [activeTab]);

  // Устанавливаем badge, когда появляются новые варианты выбора
  useEffect(() => {
    if (
      historyStoryPhase === 'ready' &&
      historyStoryOptions.length > 0 &&
      !historyStoryLoading &&
      !historyStoryTyping &&
      activeTab !== 'discover'
    ) {
      setHasNewStoryMessage(true);
    }
  }, [historyStoryPhase, historyStoryOptions.length, historyStoryLoading, historyStoryTyping, activeTab]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (sergeyRequestControllerRef.current) {
        sergeyRequestControllerRef.current.abort();
        sergeyRequestControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      abortHistoryStoryRequest();
      clearHistoryStoryTypingTimer();
    };
  }, [abortHistoryStoryRequest, clearHistoryStoryTypingTimer]);

  useEffect(() => {
    horoscopeMemoryRef.current = horoscopeMemory;
  }, [horoscopeMemory]);

  useEffect(() => {
    cyclesRef.current = cycles;
  }, [cycles]);

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') {
        return;
      }
      if (historyScrollTimeoutRef.current !== null) {
        window.clearTimeout(historyScrollTimeoutRef.current);
        historyScrollTimeoutRef.current = null;
      }
      historyScrollContainerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (historyStoryMode !== 'story' && historyScrollTimeoutRef.current !== null) {
      window.clearTimeout(historyScrollTimeoutRef.current);
      historyScrollTimeoutRef.current = null;
    }
    if (historyStoryMode !== 'story') {
      historyScrollContainerRef.current = null;
    }
  }, [historyStoryMode]);

  // Устанавливаем случайную фразу при открытии вкладки
  useEffect(() => {
    if (activeTab !== 'discover') {
      setHistoryStoryMenuOpen(false);
      return;
    }

    // Устанавливаем случайную фразу, если она ещё не установлена
    if (!historyStartPrompt) {
      const randomPromptIndex = Math.floor(Math.random() * HISTORY_START_PROMPTS.length);
      const randomButtonIndex = Math.floor(Math.random() * HISTORY_START_BUTTONS.length);
      const randomDescriptionIndex = Math.floor(Math.random() * HISTORY_START_DESCRIPTIONS.length);
      setHistoryStartPrompt(HISTORY_START_PROMPTS[randomPromptIndex]);
      setHistoryStartButton(HISTORY_START_BUTTONS[randomButtonIndex]);
      setHistoryStartDescription(HISTORY_START_DESCRIPTIONS[randomDescriptionIndex]);
    }
  }, [activeTab, historyStartPrompt]);

  // Автозапуск отключен - теперь история запускается только по кнопке
  // useEffect(() => {
  //   if (!historyStoryAwaitingKeys) {
  //     return;
  //   }
  //   if (!hasAiCredentials) {
  //     return;
  //   }
  //   if (historyStorySegmentsRef.current.length > 0 || historyStoryLoading) {
  //     return;
  //   }
  //   if (activeTab !== 'discover') {
  //     return;
  //   }
  //   initiateHistoryStory();
  // }, [
  //   activeTab,
  //   hasAiCredentials,
  //   historyStoryAwaitingKeys,
  //   historyStoryLoading,
  //   initiateHistoryStory,
  // ]);

  useEffect(() => {
    if (activeTab !== 'cycles' || cycles.length === 0) {
      setVisibleCycleIds([]);
      return;
    }

    setVisibleCycleIds([]);
    const sortedCycles = [...cycles].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );

    const timers = sortedCycles.map((cycle, index) =>
      window.setTimeout(() => {
        setVisibleCycleIds(prev => (prev.includes(cycle.id) ? prev : [...prev, cycle.id]));
      }, 150 * index + 100)
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [activeTab, cycles]);

  // Анимация элементов календаря
  useEffect(() => {
    if (activeTab !== 'calendar') {
      setVisibleCalendarElements([]);
      return;
    }

    setVisibleCalendarElements([]);

    // Определяем элементы для анимации в порядке сверху вниз
    const elementsToAnimate = [
      'calendar-header',
      'calendar-weekdays',
      'calendar-grid',
      'calendar-legend',
      'insights-card',
      'stats-card',
    ];

    const timers = elementsToAnimate.map((elementId, index) =>
      window.setTimeout(() => {
        setVisibleCalendarElements(prev => (prev.includes(elementId) ? prev : [...prev, elementId]));
      }, 80 * index + 50)
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [activeTab, currentDate]);

  // Синхронизация ref с state для персонализированных сообщений
  useEffect(() => {
    personalizedPlanetMessagesRef.current = personalizedPlanetMessages;
  }, [personalizedPlanetMessages]);

  useEffect(() => {
    isLoadingPersonalizedMessagesRef.current = isLoadingPersonalizedMessages;
  }, [isLoadingPersonalizedMessages]);

  // Фоновая загрузка персонализированных сообщений от планет при переходе на вкладку "Узнай себя"
  useEffect(() => {
    if (activeTab !== 'discover') {
      return;
    }

    // Если уже есть загруженные сообщения (не старше 1 часа), не загружаем заново
    if (personalizedPlanetMessages) {
      const age = Date.now() - personalizedPlanetMessages.timestamp;
      const oneHour = 60 * 60 * 1000;
      if (age < oneHour) {
        console.log('[PersonalizedMessages] Using cached messages');
        return;
      }
    }

    // Если уже идет загрузка, не запускаем новую (используем ref для проверки)
    if (isLoadingPersonalizedMessagesRef.current) {
      return;
    }

    // Очищаем старый кэш (одноразово)
    try {
      localStorage.removeItem('nastia_personalized_planet_messages');
    } catch (e) {
      // ignore
    }

    // Проверяем наличие API ключей
    if (!hasAiCredentials) {
      console.log('[PersonalizedMessages] No AI credentials available');
      return;
    }

    // Запускаем фоновую загрузку
    console.log('[PersonalizedMessages] Starting background load');
    setIsLoadingPersonalizedMessages(true);

    const abortController = new AbortController();
    personalizedMessagesAbortControllerRef.current = abortController;

    void generatePersonalizedPlanetMessages(
      effectiveClaudeKey,
      effectiveClaudeProxyUrl,
      effectiveOpenAIKey,
      effectiveOpenAIProxyUrl
    )
      .then(messages => {
        if (!abortController.signal.aborted) {
          console.log('[PersonalizedMessages] Successfully loaded personalized messages');
          setPersonalizedPlanetMessages(messages);
          setIsLoadingPersonalizedMessages(false);
        }
      })
      .catch(error => {
        if (!abortController.signal.aborted) {
          console.error('[PersonalizedMessages] Failed to load:', error);
          setIsLoadingPersonalizedMessages(false);
        }
      });

    return () => {
      abortController.abort();
      personalizedMessagesAbortControllerRef.current = null;
    };
  }, [activeTab, hasAiCredentials, effectiveClaudeKey, effectiveClaudeProxyUrl, effectiveOpenAIKey, effectiveOpenAIProxyUrl, personalizedPlanetMessages]);

  // Анимация элементов вкладки "Узнай себя"
  useEffect(() => {
    if (activeTab !== 'discover') {
      setVisibleDiscoverElements([]);
      return;
    }

    setVisibleDiscoverElements([]);

    // Определяем элементы для анимации в зависимости от фазы
    const elementsToAnimate: string[] = [];

    if (historyStoryPhase === 'idle') {
      elementsToAnimate.push('discover-start-icon', 'discover-start-prompt', 'discover-start-description', 'discover-start-button');
    } else if (historyStoryPhase === 'generating') {
      elementsToAnimate.push('discover-gen-icon', 'discover-gen-phrase');
    } else if (historyStoryPhase === 'ready') {
      elementsToAnimate.push('discover-meta-bar', 'discover-messages');
    }

    const timers = elementsToAnimate.map((elementId, index) =>
      window.setTimeout(() => {
        setVisibleDiscoverElements(prev => (prev.includes(elementId) ? prev : [...prev, elementId]));
      }, 100 * index + 50)
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [activeTab, historyStoryPhase]);

  // Анимация интро-сообщений при переходе в фазу 'ready' ТОЛЬКО ПЕРВЫЙ РАЗ
  useEffect(() => {
    // Показываем жанр и контракт только если нет ещё сегментов истории (первый раз)
    if (historyStoryPhase === 'ready' && historyStoryMeta && historyStorySegments.length === 0) {
      startIntroMessagesAnimation();
    }
  }, [historyStoryPhase, historyStoryMeta, historyStorySegments.length, startIntroMessagesAnimation]);

  const resolveHistoryScrollContainer = useCallback((): HTMLElement | null => {
    if (typeof window === 'undefined') {
      return null;
    }

    const existing = historyScrollContainerRef.current;
    if (existing && existing.isConnected) {
      return existing;
    }

    const messagesElement = historyMessagesRef.current;
    if (!messagesElement) {
      return null;
    }

    let current: HTMLElement | null = messagesElement.parentElement;

    while (current) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      const overflow = style.overflow;
      const isScrollable =
        overflowY === 'auto' ||
        overflowY === 'scroll' ||
        overflowY === 'overlay' ||
        overflow === 'auto' ||
        overflow === 'scroll' ||
        overflow === 'overlay';

      if (isScrollable) {
        historyScrollContainerRef.current = current;
        return current;
      }

      current = current.parentElement;
    }

    const documentElement =
      (document.scrollingElement as HTMLElement | null) ?? document.documentElement ?? document.body ?? null;
    historyScrollContainerRef.current = documentElement;
    return documentElement;
  }, []);

  useEffect(() => {
    if (historyStoryMode !== 'story') {
      return;
    }
    resolveHistoryScrollContainer();
  }, [historyStoryMode, resolveHistoryScrollContainer]);

  // Функция для плавного скролла
  const scrollToBottom = useCallback(
    ({ delay = 0, behavior = 'smooth' }: { delay?: number; behavior?: ScrollBehavior } = {}) => {
      if (typeof window === 'undefined') {
        return;
      }

      const scheduleScroll = () => {
        if (typeof window === 'undefined') {
          return;
        }

        const scrollContainer = resolveHistoryScrollContainer();
        const anchor =
          historyScrollAnchorRef.current ??
          (historyMessagesRef.current?.lastElementChild as HTMLElement | null);

        if (!scrollContainer || !anchor) {
          return;
        }

        const execute = () => {
          if (!scrollContainer.isConnected) {
            historyScrollContainerRef.current = null;
            return;
          }

          const anchorRect = anchor.getBoundingClientRect();

          const containerRect =
            scrollContainer === document.documentElement || scrollContainer === document.body
              ? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
              : scrollContainer.getBoundingClientRect();

          const delta = anchorRect.bottom - containerRect.bottom;

          if (delta <= 1) {
            return;
          }

          const scrollByOptions = { top: delta, behavior } as ScrollToOptions;

          if (scrollContainer === document.documentElement || scrollContainer === document.body) {
            window.scrollBy(scrollByOptions);
            return;
          }

          if (typeof scrollContainer.scrollBy === 'function') {
            scrollContainer.scrollBy(scrollByOptions);
            return;
          }

          if (typeof scrollContainer.scrollTo === 'function') {
            scrollContainer.scrollTo({
              top: scrollContainer.scrollTop + delta,
              behavior,
            });
            return;
          }

          scrollContainer.scrollTop += delta;
        };

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(execute);
        });
      };

      if (historyScrollTimeoutRef.current !== null) {
        window.clearTimeout(historyScrollTimeoutRef.current);
        historyScrollTimeoutRef.current = null;
      }

      if (delay > 0) {
        historyScrollTimeoutRef.current = window.setTimeout(() => {
          scheduleScroll();
          historyScrollTimeoutRef.current = null;
        }, delay);
        return;
      }

      scheduleScroll();
    },
    [resolveHistoryScrollContainer],
  );

  // Автоскролл при появлении интро-сообщений
  useEffect(() => {
    if (historyStoryPhase === 'ready' && historyStoryMode === 'story' && introMessagesVisible > 0) {
      scrollToBottom({ delay: 200 });
    }
  }, [introMessagesVisible, historyStoryPhase, historyStoryMode, scrollToBottom]);

  useEffect(() => {
    if (historyStoryMode !== 'story') {
      return;
    }
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      return;
    }

    const container = historyMessagesRef.current;
    if (!container) {
      return;
    }

    let rafId: number | null = null;

    const observer = new ResizeObserver(entries => {
      if (!entries.length) {
        return;
      }
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        scrollToBottom({ behavior: 'smooth' });
      });
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [historyStoryMode, scrollToBottom]);

  // Автоскролл при появлении typing indicator
  useEffect(() => {
    if (historyStoryMode !== 'story') {
      return;
    }

    if (historyStoryTyping) {
      scrollToBottom({ delay: 350 });
    }
  }, [historyStoryTyping, historyStoryMode, scrollToBottom]);

  // Автоскролл при появлении нового сообщения
  useEffect(() => {
    if (historyStoryMode !== 'story') {
      return;
    }

    if (historyStorySegments.length > 0 && !historyStoryTyping) {
      scrollToBottom({ delay: 400 });
    }
  }, [historyStorySegments.length, historyStoryTyping, historyStoryMode, scrollToBottom]);

  // Автоскролл при выборе опции (добавлении сообщения от Насти)
  useEffect(() => {
    if (historyStoryMode !== 'story') {
      return;
    }

    const lastSegment = historyStorySegments[historyStorySegments.length - 1];
    if (lastSegment?.selectedOptionId) {
      scrollToBottom({ delay: 150 });
    }
  }, [historyStorySegments, historyStoryMode, scrollToBottom]);

  // Последовательное появление кнопок с прокруткой после каждой
  useEffect(() => {
    if (historyStoryMode !== 'story') {
      return;
    }

    if (historyStoryOptions.length === 0) {
      setVisibleButtonsCount(0);
      return;
    }

    if (historyStoryTyping || historyButtonsHiding) {
      return;
    }

    clearButtonAnimationTimers();

    // Начинаем показывать кнопки по одной
    const totalButtons = historyStoryOptions.length;
    const delayBetweenButtons = 500; // Задержка между кнопками

    for (let i = 0; i < totalButtons; i++) {
      const timeoutId = window.setTimeout(() => {
        setVisibleButtonsCount(i + 1);
        scrollToBottom({ delay: 200 });
      }, delayBetweenButtons * (i + 1));

      buttonAnimationTimeoutsRef.current.push(timeoutId);
    }

    return () => {
      clearButtonAnimationTimers();
    };
  }, [historyStoryOptions, historyStoryMode, historyStoryTyping, historyButtonsHiding, scrollToBottom, clearButtonAnimationTimers]);

  const fallbackPeriodContent = useMemo(
    () => getFallbackPeriodContent(PRIMARY_USER_NAME),
    [],
  );

  const renderedPeriodContent = periodContent ?? (periodContentStatus !== 'loading' ? fallbackPeriodContent : null);
  useEffect(() => {
    if (!selectedDate || periodContentStatus === 'loading') {
      setShowQuestionBubble(false);
      setShowJokeBubble(false);
      return;
    }

    setShowQuestionBubble(false);
    setShowJokeBubble(false);

    const questionTimer = window.setTimeout(() => setShowQuestionBubble(true), 80);
    const jokeTimer = window.setTimeout(() => setShowJokeBubble(true), 420);

    return () => {
      window.clearTimeout(questionTimer);
      window.clearTimeout(jokeTimer);
    };
  }, [selectedDate, periodContentStatus, renderedPeriodContent]);

  const activePeriodContent = renderedPeriodContent ?? fallbackPeriodContent;

  const stats = useMemo(() => calculateCycleStats(cycles), [cycles]);
  const nextPredictionDate = stats.nextPrediction;
  const fertileWindow = useMemo(() => calculateFertileWindow(cycles), [cycles]);
  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + (notification.read ? 0 : 1), 0),
    [notifications]
  );

  const currentDailyLoadingMessage = dailyLoadingMessages[dailyLoadingIndex] ?? DEFAULT_LOADING_MESSAGES[0];
  const currentSergeyLoadingMessage =
    sergeyLoadingMessages.length > 0
      ? sergeyLoadingMessages[sergeyLoadingIndex % sergeyLoadingMessages.length]
      : initialSergeyLoadingMessages[0];
  const effectiveSergeyBannerCopy = useMemo(
    () => sergeyBannerCopy ?? DEFAULT_SERGEY_BANNER_COPY,
    [sergeyBannerCopy]
  );

  useEffect(() => {
    if (!showNotifications) {
      setVisibleNotificationIds([]);
      return;
    }
    if (notificationsLoading) {
      setVisibleNotificationIds([]);
      return;
    }
    if (notifications.length === 0) {
      setVisibleNotificationIds([]);
      return;
    }

    setVisibleNotificationIds([]);
    const timers = notifications.map((notification, index) =>
      window.setTimeout(() => {
        setVisibleNotificationIds(prev =>
          prev.includes(notification.id) ? prev : [...prev, notification.id]
        );
      }, 140 * index + 120)
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [showNotifications, notificationsLoading, notifications]);

  const persistNotifications = useCallback((items: StoredNotification[]): StoredNotification[] => {
    const limited = items.slice(0, MAX_STORED_NOTIFICATIONS);
    saveLocalNotifications(limited);
    return limited;
  }, []);

  useEffect(() => {
    setNotifications(prev => persistNotifications(prev));
  }, [persistNotifications]);

  const refreshRemoteNotifications = useCallback(async (options: { markAsRead?: boolean } = {}) => {
    if (!githubToken) {
      setNotificationsError('Добавьте GitHub токен, чтобы получать уведомления');
      return;
    }

    const requestId = notificationsRequestSeqRef.current + 1;
    notificationsRequestSeqRef.current = requestId;

    setNotificationsLoading(true);
    setNotificationsError(null);

    try {
      const remoteNotifications = await fetchRemoteNotifications(githubToken);
      if (!isMountedRef.current || notificationsRequestSeqRef.current !== requestId) {
        return;
      }

      const mapped: StoredNotification[] = remoteNotifications
        .map(item => ({
          ...item,
          read: readIdsRef.current.has(item.id),
        }))
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

      let next: StoredNotification[];

      if (options.markAsRead) {
        const { updated } = markAllAsRead(mapped);
        next = updated;
      } else {
        next = mapped;
      }

      const limited = persistNotifications(next);
      const limitedReadSet = options.markAsRead
        ? new Set(limited.map(notification => notification.id))
        : new Set(limited.filter(notification => notification.read).map(notification => notification.id));

      readIdsRef.current = limitedReadSet;
      saveReadSet(limitedReadSet);
      setReadIds(limitedReadSet);
      setNotifications(limited);
    } catch (error) {
      console.error('Failed to refresh notifications from cloud:', error);
      if (!isMountedRef.current || notificationsRequestSeqRef.current !== requestId) {
        return;
      }
      setNotificationsError('Не удалось обновить уведомления');
    } finally {
      if (!isMountedRef.current || notificationsRequestSeqRef.current !== requestId) {
        return;
      }
      setNotificationsLoading(false);
    }
  }, [githubToken, persistNotifications]);

  const normalizeNotificationType = (value?: string): NotificationCategory => {
    switch (value) {
      case 'fertile_window':
      case 'ovulation_day':
      case 'period_forecast':
      case 'period_start':
      case 'period_check':
      case 'period_waiting':
      case 'period_delay_warning':
      case 'period_confirmed_day0':
      case 'period_confirmed_day1':
      case 'period_confirmed_day2':
      case 'birthday':
        return value;
      default:
        return 'generic';
    }
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

  const handleOpenNotifications = useCallback(() => {
    clearLocalNotifications();
    setNotifications([]);
    const emptySet = new Set<string>();
    setReadIds(emptySet);
    readIdsRef.current = emptySet;
    setVisibleNotificationIds([]);
    setNotificationsError(null);
    setShowNotifications(true);
    void refreshRemoteNotifications({ markAsRead: true });
  }, [refreshRemoteNotifications]);

  const handleCloseNotifications = () => {
    setShowNotifications(false);
    setNotificationsError(null);
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
      setPeriodHoroscope(null);
      setPeriodHoroscopeStatus('idle');
      setHoroscopeVisible(false);
      return;
    }

    const controller = new AbortController();
    setPeriodContentStatus('loading');
    setPeriodContentError(null);
    setPeriodContent(null);
    const timingContext = buildPeriodTimingContext(selectedDate, cycles);

    generatePeriodModalContent({
      userName: PRIMARY_USER_NAME,
      cycleStartISODate: selectedDate.toISOString(),
      cycleTimingContext: timingContext ?? undefined,
      signal: controller.signal,
      apiKey: effectiveClaudeKey,
      claudeProxyUrl: effectiveClaudeProxyUrl,
      openAIApiKey: effectiveOpenAIKey,
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
  }, [
    selectedDate,
    cycles,
    effectiveClaudeKey,
    effectiveClaudeProxyUrl,
    effectiveOpenAIKey,
    fallbackPeriodContent,
  ]);

  useEffect(() => {
    if (!selectedDate || !horoscopeVisible) {
      if (!selectedDate) {
        setHoroscopeVisible(false);
      }
      return;
    }

    const controller = new AbortController();
    setPeriodHoroscopeStatus('loading');
    setPeriodHoroscope(null);

    const isoDate = selectedDate.toISOString().split('T')[0];

    fetchDailyHoroscope(
      isoDate,
      controller.signal,
      effectiveClaudeKey,
      effectiveClaudeProxyUrl,
      effectiveOpenAIKey,
      cycles,
    )
      .then(result => {
        const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        const formattedDate = dateFormatter.format(selectedDate);

        setPeriodHoroscope({
          text: result.text,
          date: result.date || formattedDate,
          weekRange: result.weekRange,
        });
        setPeriodHoroscopeStatus('idle');
      })
      .catch(error => {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Не удалось получить гороскоп для Насти:', error);
        setPeriodHoroscopeStatus('error');
      });

    return () => {
      controller.abort();
    };
  }, [
    selectedDate,
    horoscopeVisible,
    effectiveClaudeKey,
    effectiveClaudeProxyUrl,
    effectiveOpenAIKey,
    cycles,
  ]);

  useEffect(() => {
    if (!showDailyHoroscopeModal) {
      setDailyHoroscope(null);
      setDailyHoroscopeStatus('idle');
      setDailyHoroscopeError(null);
      setDailyLoadingMessages([]);
      setDailyLoadingIndex(0);
      setSergeyBannerDismissed(false);
      setSergeyHoroscope(null);
      setSergeyHoroscopeStatus('idle');
      setSergeyHoroscopeError(null);
      setSergeyLoadingIndex(0);
      setSergeyLoadingMessages(getSergeyLoadingFallback());
      setSergeyLoadingMaxHeight(null);
      setSergeyBannerCopy(null);
      setSergeyBannerCopyStatus('idle');
      setSergeyBannerCopyError(null);
      if (sergeyRequestControllerRef.current) {
        sergeyRequestControllerRef.current.abort();
        sergeyRequestControllerRef.current = null;
      }
      if (sergeyBannerCopyControllerRef.current) {
        sergeyBannerCopyControllerRef.current.abort();
        sergeyBannerCopyControllerRef.current = null;
      }
      if (sergeyLoadingControllerRef.current) {
        sergeyLoadingControllerRef.current.abort();
        sergeyLoadingControllerRef.current = null;
      }
      return;
    }

    const controller = new AbortController();
    const sergeyCopyController = new AbortController();
    const sergeyLoadingController = new AbortController();
    sergeyBannerCopyControllerRef.current = sergeyCopyController;
    sergeyLoadingControllerRef.current = sergeyLoadingController;
    const todayIso = new Date().toISOString().split('T')[0];

    setDailyHoroscopeStatus('loading');
    setDailyHoroscopeError(null);
    setDailyLoadingMessages(DEFAULT_LOADING_MESSAGES);
    setDailyLoadingIndex(0);
    setSergeyBannerCopy(null);
    setSergeyBannerCopyStatus('loading');
    setSergeyBannerCopyError(null);
    setSergeyLoadingIndex(0);
    setSergeyLoadingMessages(getSergeyLoadingFallback());
    setSergeyLoadingMaxHeight(null);

    fetchHoroscopeLoadingMessages(
      effectiveClaudeKey,
      effectiveClaudeProxyUrl,
      effectiveOpenAIKey,
      controller.signal,
    )
      .then(messages => {
        if (!controller.signal.aborted && messages.length > 0) {
          setDailyLoadingMessages(messages);
          setDailyLoadingIndex(0);
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          console.warn('Не удалось получить шуточные статусы загрузки:', error);
        }
      });

    fetchDailyHoroscopeForDate(
      todayIso,
      controller.signal,
      effectiveClaudeKey,
      effectiveClaudeProxyUrl,
      effectiveOpenAIKey,
      cyclesRef.current,
      horoscopeMemoryRef.current,
    )
      .then(result => {
        if (controller.signal.aborted) {
          return;
        }
        const memoryEntry = result.memoryEntry;
        if (memoryEntry) {
          setHoroscopeMemory(prev => mergeHoroscopeMemoryEntries(prev, memoryEntry));
        }
        setDailyHoroscope(result);
        setDailyHoroscopeStatus('idle');
      })
      .catch(error => {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Не удалось получить дневной гороскоп:', error);
        setDailyHoroscope(null);
        setDailyHoroscopeStatus('error');
        setDailyHoroscopeError('Не удалось загрузить гороскоп. Попробуй ещё раз позже.');
      });

    fetchSergeyBannerCopy(
      todayIso,
      sergeyCopyController.signal,
      effectiveClaudeKey,
      effectiveClaudeProxyUrl,
      effectiveOpenAIKey,
      horoscopeMemoryRef.current,
    )
      .then(copy => {
        if (sergeyCopyController.signal.aborted) {
          return;
        }
        sergeyBannerCopyControllerRef.current = null;
        setSergeyBannerCopy(copy);
        setSergeyBannerCopyStatus('success');
      })
      .catch(error => {
        if (sergeyCopyController.signal.aborted) {
          return;
        }
        sergeyBannerCopyControllerRef.current = null;
        console.error('Не удалось получить тексты карточки Серёжи:', error);
        setSergeyBannerCopy(DEFAULT_SERGEY_BANNER_COPY);
        setSergeyBannerCopyStatus('error');
        setSergeyBannerCopyError(
          error instanceof Error ? error.message : 'Не удалось придумать новые фразы.',
        );
      });

    fetchSergeyLoadingMessages(
      effectiveClaudeKey,
      effectiveClaudeProxyUrl,
      effectiveOpenAIKey,
      sergeyLoadingController.signal,
    )
      .then(messages => {
        if (sergeyLoadingController.signal.aborted) {
          return;
        }
        sergeyLoadingControllerRef.current = null;
        if (messages.length > 0) {
          setSergeyLoadingMessages(messages);
        } else {
          setSergeyLoadingMessages(getSergeyLoadingFallback());
        }
      })
      .catch(error => {
        if (sergeyLoadingController.signal.aborted) {
          return;
        }
        console.warn('Не удалось получить статусы загрузки Серёжи:', error);
        sergeyLoadingControllerRef.current = null;
        setSergeyLoadingMessages(getSergeyLoadingFallback());
      });

    return () => {
      controller.abort();
      sergeyCopyController.abort();
      sergeyLoadingController.abort();
      if (sergeyBannerCopyControllerRef.current === sergeyCopyController) {
        sergeyBannerCopyControllerRef.current = null;
      }
      if (sergeyLoadingControllerRef.current === sergeyLoadingController) {
        sergeyLoadingControllerRef.current = null;
      }
    };
  }, [
    showDailyHoroscopeModal,
    effectiveClaudeKey,
    effectiveClaudeProxyUrl,
    effectiveOpenAIKey,
  ]);

  useEffect(() => {
    if (!showDailyHoroscopeModal || dailyHoroscopeStatus !== 'loading' || dailyLoadingMessages.length === 0) {
      return () => undefined;
    }

    const interval = window.setInterval(() => {
      setDailyLoadingIndex(prev => (prev + 1) % dailyLoadingMessages.length);
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [showDailyHoroscopeModal, dailyHoroscopeStatus, dailyLoadingMessages]);

  useEffect(() => {
    if (
      !showDailyHoroscopeModal ||
      sergeyHoroscopeStatus !== 'loading' ||
      sergeyLoadingMessages.length === 0
    ) {
      return () => undefined;
    }

    const interval = window.setInterval(() => {
      setSergeyLoadingIndex(prev => (prev + 1) % sergeyLoadingMessages.length);
    }, 2600);

    return () => {
      window.clearInterval(interval);
    };
  }, [showDailyHoroscopeModal, sergeyHoroscopeStatus, sergeyLoadingMessages.length]);

  useEffect(() => {
    setSergeyLoadingIndex(0);
  }, [sergeyLoadingMessages]);

  useEffect(() => {
    if (!showDailyHoroscopeModal) {
      setSergeyLoadingMaxHeight(null);
      return;
    }
    if (sergeyLoadingMessages.length === 0) {
      setSergeyLoadingMaxHeight(null);
      return;
    }

    const measure = () => {
      const container = sergeyLoadingMeasureRef.current;
      if (!container) {
        return;
      }
      const heights = Array.from(container.children).map(child =>
        (child as HTMLElement).getBoundingClientRect().height,
      );
      if (heights.length === 0) {
        setSergeyLoadingMaxHeight(null);
        return;
      }
      setSergeyLoadingMaxHeight(Math.max(...heights));
    };

    const raf = window.requestAnimationFrame(measure);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [sergeyLoadingMessages, showDailyHoroscopeModal]);

  useEffect(() => {
    if (
      !showDailyHoroscopeModal ||
      (sergeyHoroscopeStatus !== 'loading' && sergeyHoroscopeStatus !== 'success')
    ) {
      return;
    }
    const banner = sergeyBannerRef.current;
    if (!banner) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [sergeyHoroscopeStatus, showDailyHoroscopeModal]);

  const handleSergeyBannerDismiss = useCallback(() => {
    if (sergeyRequestControllerRef.current) {
      sergeyRequestControllerRef.current.abort();
      sergeyRequestControllerRef.current = null;
    }
    setSergeyBannerDismissed(true);
    setSergeyHoroscopeStatus('idle');
    setSergeyHoroscopeError(null);
    setSergeyHoroscope(null);
    setSergeyLoadingIndex(0);
  }, []);

  const handleSergeyHoroscopeRequest = useCallback(() => {
    if (sergeyHoroscopeStatus === 'loading') {
      return;
    }

    const controller = new AbortController();
    sergeyRequestControllerRef.current = controller;

    setSergeyHoroscopeStatus('loading');
    setSergeyHoroscopeError(null);
    setSergeyHoroscope(null);
    setSergeyLoadingIndex(0);

    const todayIso = new Date().toISOString().split('T')[0];

    fetchSergeyDailyHoroscopeForDate(
      todayIso,
      controller.signal,
      effectiveClaudeKey,
      effectiveClaudeProxyUrl,
      effectiveOpenAIKey,
      cyclesRef.current,
      horoscopeMemoryRef.current,
    )
      .then(result => {
        if (controller.signal.aborted) {
          return;
        }
        sergeyRequestControllerRef.current = null;
        const memoryEntry = result.memoryEntry;
        if (memoryEntry) {
          setHoroscopeMemory(prev => mergeHoroscopeMemoryEntries(prev, memoryEntry));
        }
        setSergeyHoroscope(result);
        setSergeyHoroscopeStatus('success');
      })
      .catch(error => {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Не удалось получить гороскоп для Серёжи:', error);
        sergeyRequestControllerRef.current = null;
        setSergeyHoroscopeStatus('error');
        setSergeyHoroscopeError('Звёзды послали Серёжу подождать. Попробуй ещё раз позже.');
      });
  }, [
    sergeyHoroscopeStatus,
    effectiveClaudeKey,
    effectiveClaudeProxyUrl,
    effectiveOpenAIKey,
  ]);

  const handleInsightToggle = useCallback((type: InsightType) => {
    // Проверяем, открыт ли этот инсайт
    const isExpanded = expandedInsights.has(type);

    if (isExpanded) {
      // Закрываем инсайт
      setExpandedInsights(prev => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });

      // Отменяем запрос для этого инсайта, если он есть
      if (insightControllersRef.current[type]) {
        insightControllersRef.current[type]!.abort();
        insightControllersRef.current[type] = null;
      }
      return;
    }

    // Раскрываем инсайт
    setExpandedInsights(prev => {
      const next = new Set(prev);
      next.add(type);
      return next;
    });

    // Сбрасываем стиль на "научный" при новом раскрытии
    setInsightStyleMode(prev => ({ ...prev, [type]: 'scientific' }));

    // Отменяем предыдущий запрос для этого инсайта, если есть
    if (insightControllersRef.current[type]) {
      insightControllersRef.current[type]!.abort();
      insightControllersRef.current[type] = null;
    }

    // ВСЕГДА делаем новый запрос при раскрытии — сбрасываем старый контент
    setInsightDescriptions(prev => ({ ...prev, [type]: null }));
    setInsightLoadingStates(prev => ({ ...prev, [type]: true }));
    setInsightLoadingPhrases(prev => ({ ...prev, [type]: getRandomLoadingPhrase() }));

    const controller = new AbortController();
    insightControllersRef.current[type] = controller;

    // Подготавливаем данные в зависимости от типа
    let metricData: { value: string; variability?: number; confidence?: number; trend?: number };
    switch (type) {
      case 'cycle-length':
        metricData = {
          value: `${stats.averageLength6Months} дней`,
          variability: stats.variability,
        };
        break;
      case 'next-period':
        metricData = {
          value: formatShortDate(stats.nextPrediction),
          variability: stats.variability,
          confidence: stats.predictionConfidence,
        };
        break;
      case 'fertile-window':
        metricData = {
          value: fertileWindow
            ? `${formatShortDate(fertileWindow.fertileStart)} - ${formatShortDate(fertileWindow.ovulationDay)}`
            : 'Недостаточно данных',
        };
        break;
      case 'trend':
        metricData = {
          value: stats.trend > 0 ? 'Увеличение' : 'Уменьшение',
          trend: stats.trend,
        };
        break;
    }

    generateInsightDescription({
      metricType: type,
      metricData,
      signal: controller.signal,
      apiKey: effectiveClaudeKey,
      claudeProxyUrl: effectiveClaudeProxyUrl,
      openAIApiKey: effectiveOpenAIKey,
    })
      .then(description => {
        if (controller.signal.aborted) {
          return;
        }
        setInsightDescriptions(prev => ({ ...prev, [type]: description }));
        setInsightLoadingStates(prev => ({ ...prev, [type]: false }));
        insightControllersRef.current[type] = null;
      })
      .catch(error => {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to generate insight description:', error);
        // Используем fallback
        const fallback = getFallbackInsightDescription(type);
        setInsightDescriptions(prev => ({ ...prev, [type]: fallback }));
        setInsightLoadingStates(prev => ({ ...prev, [type]: false }));
        insightControllersRef.current[type] = null;
      });
  }, [
    expandedInsights,
    stats,
    fertileWindow,
    effectiveClaudeKey,
    effectiveClaudeProxyUrl,
    effectiveOpenAIKey,
  ]);

  const handleInsightStyleToggle = useCallback((type: InsightType) => {
    setInsightStyleMode(prev => ({
      ...prev,
      [type]: prev[type] === 'scientific' ? 'human' : 'scientific',
    }));
  }, []);

  useEffect(() => {
    if (!githubToken) {
      return;
    }

    let cancelled = false;

    void refreshRemoteNotifications();

    fetchRemoteConfig(githubToken)
      .then(config => {
        if (cancelled || !config) {
          console.log('[Config] No remote config loaded');
          return;
        }
        console.log('[Config] Remote config loaded:', {
          hasClaudeKey: Boolean(config.claude?.apiKey),
          hasClaudeProxyUrl: Boolean(config.claudeProxy?.url),
          hasOpenAIKey: Boolean(config.openAI?.apiKey),
          hasOpenAIProxyUrl: Boolean(config.openAIProxy?.url),
        });
        if (config.claude?.apiKey) {
          setRemoteClaudeKey(config.claude.apiKey);
          console.log('[Config] ✅ Claude API key loaded from remote config');
        }
        const claudeProxyUrl = config.claudeProxy?.url ?? null;
        setRemoteClaudeProxyUrl(claudeProxyUrl);
        if (claudeProxyUrl) {
          console.log('[Config] ✅ Claude proxy URL loaded from remote config');
        }
        if (config.openAI?.apiKey) {
          setRemoteOpenAIKey(config.openAI.apiKey);
          console.log('[Config] ✅ OpenAI API key loaded from remote config');
        }
        const openAIProxyUrl = config.openAIProxy?.url ?? null;
        setRemoteOpenAIProxyUrl(openAIProxyUrl);
        if (openAIProxyUrl) {
          console.log('[Config] ✅ OpenAI proxy URL loaded from remote config');
        }
      })
      .catch(error => {
        if (!cancelled) {
          console.error('[Config] ❌ Failed to load remote config:', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cloudEnabled, githubToken, refreshRemoteNotifications]);

  const handleDeepLink = useCallback((url: string) => {
    try {
      const parsed = new URL(url, window.location.origin);
      const openValue = parsed.searchParams.get('open');
      if (openValue === 'daily-horoscope') {
        setShowDailyHoroscopeModal(true);
      } else if (openValue === 'notifications') {
        handleOpenNotifications();
      }
    } catch (error) {
      console.warn('Failed to handle deep link:', error);
    }
  }, [handleOpenNotifications]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) {
        return;
      }

      if (data.type === 'nastia-open' && data.payload?.url) {
        handleDeepLink(String(data.payload.url));
        return;
      }

      if (data.type !== 'nastia-notification' || !data.payload) {
        return;
      }

      const payload = data.payload as {
        id?: string;
        title?: string;
        body?: string;
        type?: string;
        sentAt?: string;
        url?: string;
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
  }, [handleDeepLink, persistNotifications]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const openValue = params.get('open');
      if (openValue === 'daily-horoscope') {
        setShowDailyHoroscopeModal(true);
        params.delete('open');
        const nextQuery = params.toString();
        const newUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
        window.history.replaceState({}, document.title, newUrl);
      }
    } catch (error) {
      console.warn('Failed to parse query params for deep link:', error);
    }
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
          if (cloudData) {
            hydratePsychContractHistory(cloudData.psychContractHistory);
            const convertedCycles = (cloudData.cycles ?? []).map((cycle: any) => ({
              ...cycle,
              startDate: new Date(cycle.startDate),
              endDate: cycle.endDate ? new Date(cycle.endDate) : undefined,
            }));
            const cloudMemory = Array.isArray(cloudData.horoscopeMemory)
              ? cloudData.horoscopeMemory
              : [];
            const trimmedCloudMemory = cloudMemory.slice(-HOROSCOPE_MEMORY_LIMIT);

            if (convertedCycles.length > 0 || trimmedCloudMemory.length > 0) {
              setCycles(convertedCycles);
              setHoroscopeMemory(trimmedCloudMemory);
              // Сохраняем локально как резерв
              saveData({
                ...cloudData,
                cycles: convertedCycles,
                horoscopeMemory: trimmedCloudMemory,
              });
              return;
            }
          }
        } catch (error) {
          console.error('Cloud load error:', error);
        }
      }

      // Если облако недоступно или пусто, загружаем локальные данные
      const localData = loadData();
      if (localData) {
        hydratePsychContractHistory(localData.psychContractHistory);
        setCycles(localData.cycles);
        const localMemory = (localData.horoscopeMemory ?? []).slice(-HOROSCOPE_MEMORY_LIMIT);
        setHoroscopeMemory(localMemory);
        // Если есть локальные данные и облако настроено, загружаем в облако
        if (
          (localData.cycles.length > 0 || localMemory.length > 0) &&
          cloudSync.isConfigured()
        ) {
          try {
            await cloudSync.uploadToCloud({
              ...localData,
              horoscopeMemory: localMemory,
            });
          } catch (error) {
            console.error('Cloud upload error:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      dataHydratedRef.current = true;
    }
  };

  // Сохранение данных при изменении
  useEffect(() => {
    if (!dataHydratedRef.current) {
      return;
    }

    const nastiaData: NastiaData = {
      cycles,
      settings: {
        averageCycleLength: 28,
        periodLength: 5,
        notifications: true,
      },
      horoscopeMemory,
      psychContractHistory: getPsychContractHistorySnapshot(),
    };

    // Сохраняем локально
    saveData(nastiaData);

    // Автоматически сохраняем в облако, если есть что синхронизировать
    if (cloudSync.isConfigured() && (cycles.length > 0 || horoscopeMemory.length > 0)) {
      syncToCloud(nastiaData);
    }
  }, [cycles, horoscopeMemory]);

  // Тихая синхронизация с облаком
  const syncToCloud = async (data: NastiaData) => {
    try {
      setSyncStatus('syncing');
      await cloudSync.uploadToCloud(data);
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Cloud sync failed:', errorMsg);

      // Показываем более дружелюбное сообщение в зависимости от типа ошибки
      if (errorMsg.includes('409') || errorMsg.includes('Conflict')) {
        console.log('💡 Tip: Multiple devices are syncing. Auto-retry in progress...');
      } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
        console.error('🔐 Authentication error: Please check your GitHub token');
      } else if (errorMsg.includes('404')) {
        console.error('📁 Repository not found: Please ensure nastia-data repo exists');
      } else {
        console.error('🌐 Network error: Check your internet connection');
      }

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
            if (cloudData && (cloudData.cycles.length > 0 || (cloudData.horoscopeMemory?.length ?? 0) > 0)) {
              // Если в облаке есть данные, загружаем их
              // Конвертируем строки дат в Date объекты
              const convertedCycles = cloudData.cycles.map((cycle: any) => ({
                ...cycle,
                startDate: new Date(cycle.startDate),
                endDate: cycle.endDate ? new Date(cycle.endDate) : undefined,
              }));
              const cloudMemory = Array.isArray(cloudData.horoscopeMemory)
                ? cloudData.horoscopeMemory
                : [];
              const trimmedCloudMemory = cloudMemory.slice(-HOROSCOPE_MEMORY_LIMIT);
              setCycles(convertedCycles);
              setHoroscopeMemory(trimmedCloudMemory);
              saveData({ ...cloudData, cycles: convertedCycles, horoscopeMemory: trimmedCloudMemory });
              alert(`Загружено ${convertedCycles.length} циклов и ${trimmedCloudMemory.length} заметок из облака`);
            } else if (cycles.length > 0 || horoscopeMemory.length > 0) {
              // Если в облаке пусто, но есть локальные данные - загружаем их в облако
              const nastiaData: NastiaData = {
                cycles,
                settings: {
                  averageCycleLength: 28,
                  periodLength: 5,
                  notifications: true,
                },
                horoscopeMemory: horoscopeMemory.slice(-HOROSCOPE_MEMORY_LIMIT),
                psychContractHistory: getPsychContractHistorySnapshot(),
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
    } else if (isPeriodStartDay(date, cycles)) {
      // Показываем только первый день цикла (начало менструации)
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

  return (
    <div className={styles.container}>
      <div className={styles.appWrapper}>
        {/* Заголовок */}
        {/* Header скрыт на вкладке "Узнай себя" */}
        {activeTab !== 'discover' && (
          <div className={styles.header}>
            {cloudEnabled && (
              <div className={styles.syncIndicatorLeft}>
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

            <div className={styles.headerHoroscopeCard}>
              <button
                className={styles.headerHoroscopeButton}
                onClick={() => setShowDailyHoroscopeModal(true)}
                type="button"
              >
                <span className={styles.dailyHoroscopeIcon} aria-hidden="true">🔮</span>
                <div>
                  <div className={styles.dailyHoroscopeTitle}>Гороскоп на сегодня</div>
                  <div className={styles.dailyHoroscopeSubtitle}>Правда, только правда.</div>
                </div>
              </button>
              <button
                onClick={handleOpenNotifications}
                className={styles.headerNotificationButton}
                type="button"
                aria-label={unreadCount > 0 ? `Есть ${unreadCount} новых уведомлений` : 'Открыть уведомления'}
              >
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span className={styles.notificationBadge}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Старая навигация убрана - теперь используется GlassTabBar внизу */}

        {/* Календарь */}
        {activeTab === 'calendar' && (
          <div className={styles.calendarPanel}>
            {/* Навигация по месяцам */}
            <div className={`${styles.calendarHeader} ${styles.calendarElementAnimated} ${visibleCalendarElements.includes('calendar-header') ? styles.calendarElementVisible : ''}`}>
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
            <div className={`${styles.weekDays} ${styles.calendarElementAnimated} ${visibleCalendarElements.includes('calendar-weekdays') ? styles.calendarElementVisible : ''}`}>
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                <div key={day} className={styles.weekDay}>
                  {day}
                </div>
              ))}
            </div>

            {/* Дни месяца */}
            <div className={`${styles.calendarGrid} ${styles.calendarElementAnimated} ${visibleCalendarElements.includes('calendar-grid') ? styles.calendarElementVisible : ''}`}>
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
            <div className={`${styles.legend} ${styles.calendarElementAnimated} ${visibleCalendarElements.includes('calendar-legend') ? styles.calendarElementVisible : ''}`}>
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
          <div className={`${styles.insightsCard} ${styles.calendarElementAnimated} ${visibleCalendarElements.includes('insights-card') ? styles.calendarElementVisible : ''}`}>
            <h3 className={styles.insightsTitle}>⚡️ Твои показатели</h3>

            <div className={styles.insightsGrid}>
              {/* Средняя длина и вариативность */}
              <div className={styles.insightCard}>
                <div className={styles.insightHeader}>
                  <div>
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
                  <button
                    type="button"
                    className={`${styles.insightExpandButton} ${expandedInsights.has('cycle-length') ? styles.expanded : ''}`}
                    onClick={() => handleInsightToggle('cycle-length')}
                    aria-label="Развернуть описание"
                  >
                    <ChevronDown size={24} />
                  </button>
                </div>
                {expandedInsights.has('cycle-length') && (
                  <div className={styles.insightExpandedContent}>
                    {insightLoadingStates['cycle-length'] ? (
                      <div className={styles.insightLoading}>
                        <div className={styles.insightLoadingEmoji}>{insightLoadingPhrases['cycle-length']?.emoji}</div>
                        <div className={styles.insightLoadingText}>{insightLoadingPhrases['cycle-length']?.text}</div>
                      </div>
                    ) : insightDescriptions['cycle-length'] ? (
                      <>
                        <div className={styles.insightStyleToggle}>
                          <button
                            type="button"
                            className={`${styles.insightStyleButton} ${insightStyleMode['cycle-length'] === 'scientific' ? styles.active : ''}`}
                            onClick={() => handleInsightStyleToggle('cycle-length')}
                          >
                            На научном
                          </button>
                          <button
                            type="button"
                            className={`${styles.insightStyleButton} ${insightStyleMode['cycle-length'] === 'human' ? styles.active : ''}`}
                            onClick={() => handleInsightStyleToggle('cycle-length')}
                          >
                            На человеческом
                          </button>
                        </div>
                        <div key={insightStyleMode['cycle-length']} className={styles.insightDescription}>
                          {insightStyleMode['cycle-length'] === 'scientific'
                            ? insightDescriptions['cycle-length'].scientific
                            : insightDescriptions['cycle-length'].human}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Следующая менструация */}
              <div className={styles.insightCard}>
                <div className={styles.insightHeader}>
                  <div>
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
                  <button
                    type="button"
                    className={`${styles.insightExpandButton} ${expandedInsights.has('next-period') ? styles.expanded : ''}`}
                    onClick={() => handleInsightToggle('next-period')}
                    aria-label="Развернуть описание"
                  >
                    <ChevronDown size={24} />
                  </button>
                </div>
                {expandedInsights.has('next-period') && (
                  <div className={styles.insightExpandedContent}>
                    {insightLoadingStates['next-period'] ? (
                      <div className={styles.insightLoading}>
                        <div className={styles.insightLoadingEmoji}>{insightLoadingPhrases['next-period']?.emoji}</div>
                        <div className={styles.insightLoadingText}>{insightLoadingPhrases['next-period']?.text}</div>
                      </div>
                    ) : insightDescriptions['next-period'] ? (
                      <>
                        <div className={styles.insightStyleToggle}>
                          <button
                            type="button"
                            className={`${styles.insightStyleButton} ${insightStyleMode['next-period'] === 'scientific' ? styles.active : ''}`}
                            onClick={() => handleInsightStyleToggle('next-period')}
                          >
                            На научном
                          </button>
                          <button
                            type="button"
                            className={`${styles.insightStyleButton} ${insightStyleMode['next-period'] === 'human' ? styles.active : ''}`}
                            onClick={() => handleInsightStyleToggle('next-period')}
                          >
                            На человеческом
                          </button>
                        </div>
                        <div key={insightStyleMode['next-period']} className={styles.insightDescription}>
                          {insightStyleMode['next-period'] === 'scientific'
                            ? insightDescriptions['next-period'].scientific
                            : insightDescriptions['next-period'].human}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Фертильное окно */}
              {fertileWindow && (
                <div className={styles.insightCard}>
                  <div className={styles.insightHeader}>
                    <div>
                      <div className={styles.insightLabel}>Фертильное окно</div>
                      <div className={styles.insightValue}>
                        {formatShortDate(fertileWindow.fertileStart)} - {formatShortDate(fertileWindow.ovulationDay)}
                      </div>
                      <div className={styles.insightSubtext}>
                        Овуляция: {formatShortDate(fertileWindow.ovulationDay)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`${styles.insightExpandButton} ${expandedInsights.has('fertile-window') ? styles.expanded : ''}`}
                      onClick={() => handleInsightToggle('fertile-window')}
                      aria-label="Развернуть описание"
                    >
                      <ChevronDown size={24} />
                    </button>
                  </div>
                  {expandedInsights.has('fertile-window') && (
                    <div className={styles.insightExpandedContent}>
                      {insightLoadingStates['fertile-window'] ? (
                        <div className={styles.insightLoading}>
                          <div className={styles.insightLoadingEmoji}>{insightLoadingPhrases['fertile-window']?.emoji}</div>
                          <div className={styles.insightLoadingText}>{insightLoadingPhrases['fertile-window']?.text}</div>
                        </div>
                      ) : insightDescriptions['fertile-window'] ? (
                        <>
                          <div className={styles.insightStyleToggle}>
                            <button
                              type="button"
                              className={`${styles.insightStyleButton} ${insightStyleMode['fertile-window'] === 'scientific' ? styles.active : ''}`}
                              onClick={() => handleInsightStyleToggle('fertile-window')}
                            >
                              На научном
                            </button>
                            <button
                              type="button"
                              className={`${styles.insightStyleButton} ${insightStyleMode['fertile-window'] === 'human' ? styles.active : ''}`}
                              onClick={() => handleInsightStyleToggle('fertile-window')}
                            >
                              На человеческом
                            </button>
                          </div>
                          <div key={insightStyleMode['fertile-window']} className={styles.insightDescription}>
                            {insightStyleMode['fertile-window'] === 'scientific'
                              ? insightDescriptions['fertile-window'].scientific
                              : insightDescriptions['fertile-window'].human}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {/* Тренд */}
              {Math.abs(stats.trend) > 0.1 && (
                <div className={styles.insightCard}>
                  <div className={styles.insightHeader}>
                    <div>
                      <div className={styles.insightLabel}>Тренд</div>
                      <div className={styles.insightValue}>
                        {stats.trend > 0 ? '📈 Увеличение' : '📉 Уменьшение'}
                      </div>
                      <div className={styles.insightSubtext}>
                        {Math.abs(stats.trend).toFixed(1)} дня/цикл
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`${styles.insightExpandButton} ${expandedInsights.has('trend') ? styles.expanded : ''}`}
                      onClick={() => handleInsightToggle('trend')}
                      aria-label="Развернуть описание"
                    >
                      <ChevronDown size={24} />
                    </button>
                  </div>
                  {expandedInsights.has('trend') && (
                    <div className={styles.insightExpandedContent}>
                      {insightLoadingStates['trend'] ? (
                        <div className={styles.insightLoading}>
                          <div className={styles.insightLoadingEmoji}>{insightLoadingPhrases['trend']?.emoji}</div>
                          <div className={styles.insightLoadingText}>{insightLoadingPhrases['trend']?.text}</div>
                        </div>
                      ) : insightDescriptions['trend'] ? (
                        <>
                          <div className={styles.insightStyleToggle}>
                            <button
                              type="button"
                              className={`${styles.insightStyleButton} ${insightStyleMode['trend'] === 'scientific' ? styles.active : ''}`}
                              onClick={() => handleInsightStyleToggle('trend')}
                            >
                              На научном
                            </button>
                            <button
                              type="button"
                              className={`${styles.insightStyleButton} ${insightStyleMode['trend'] === 'human' ? styles.active : ''}`}
                              onClick={() => handleInsightStyleToggle('trend')}
                            >
                              На человеческом
                            </button>
                          </div>
                          <div key={insightStyleMode['trend']} className={styles.insightDescription}>
                            {insightStyleMode['trend'] === 'scientific'
                              ? insightDescriptions['trend'].scientific
                              : insightDescriptions['trend'].human}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Краткая статистика */}
        {activeTab === 'calendar' && (
          <div className={`${styles.card} ${styles.statsCard} ${styles.calendarElementAnimated} ${visibleCalendarElements.includes('stats-card') ? styles.calendarElementVisible : ''}`}>
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

        {/* Вкладка: Узнай себя (интерактивная история) */}
        {activeTab === 'discover' && (
          <div className={styles.historyChatContainer}>
                {/* Начальный экран (idle) */}
                {historyStoryPhase === 'idle' && (
                  <div className={styles.historyStartScreen}>
                    <div className={`${styles.historyStartIconContainer} ${styles.calendarElementAnimated} ${visibleDiscoverElements.includes('discover-start-icon') ? styles.calendarElementVisible : ''}`}>
                      <div className={styles.historyStartIcon}>✨</div>
                    </div>
                    <div>
                      <div className={`${styles.historyStartPrompt} ${styles.calendarElementAnimated} ${visibleDiscoverElements.includes('discover-start-prompt') ? styles.calendarElementVisible : ''}`}>{historyStartPrompt}</div>
                      <div className={`${styles.historyStartDescription} ${styles.calendarElementAnimated} ${visibleDiscoverElements.includes('discover-start-description') ? styles.calendarElementVisible : ''}`}>
                        {historyStartDescription}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`${styles.historyStartButton} ${styles.calendarElementAnimated} ${visibleDiscoverElements.includes('discover-start-button') ? styles.calendarElementVisible : ''}`}
                      onClick={initiateHistoryStory}
                      disabled={!hasAiCredentials}
                    >
                      {historyStartButton}
                    </button>
                  </div>
                )}

                {/* Экран генерации и готовности - единый чат-интерфейс */}
                {(historyStoryPhase === 'generating' || historyStoryPhase === 'clearing' || historyStoryPhase === 'ready') && (
                  <>
                    {/* Заголовок с кнопкой отмены/завершения */}
                    <div className={styles.historyStoryHeader}>
                      <h2 className={styles.historyStoryTitle}>История</h2>
                      {historyStoryPhase === 'generating' && historyCancelButtonText && (
                        <button
                          type="button"
                          className={styles.historyEndButton}
                          onClick={handleCancelGeneration}
                        >
                          {historyCancelButtonText}
                        </button>
                      )}
                      {historyStoryPhase === 'ready' && (
                        <button
                          type="button"
                          className={styles.historyEndButton}
                          onClick={resetHistoryStoryState}
                        >
                          Закончить историю
                        </button>
                      )}
                    </div>
                  </>
                )}

                <div
                  className={`${styles.historyChatMessages} ${
                    historyStoryPhase !== 'ready' ? styles.calendarElementAnimated : ''
                  } ${
                    (historyStoryPhase === 'generating' || historyStoryPhase === 'ready' || visibleDiscoverElements.includes('discover-messages'))
                      ? styles.calendarElementVisible
                      : ''
                  }`}
                  ref={historyMessagesRef}
                >
                  {/* Планетарные сообщения и контракт (фазы generating, clearing, ready) */}
                  {(historyStoryPhase === 'generating' || historyStoryPhase === 'clearing' || (historyStoryPhase === 'ready' && historyStorySegments.length === 0)) && planetChatMessages.map((msg) => (
                    msg.isSystem ? (
                      // Системное сообщение о подключении
                      <div
                        key={msg.id}
                        className={`${styles.historyChatSystem} ${planetMessagesClearing ? styles.clearing : styles.visible}`}
                      >
                        <span className={styles.historyChatSystemPlanet}>{msg.planet}</span> {msg.message}
                      </div>
                    ) : (
                      // Обычное сообщение
                      <div
                        key={msg.id}
                        className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${msg.planet === 'История' ? styles.historyMessage : styles.planetMessage} ${planetMessagesClearing ? styles.clearing : styles.visible}`}
                        data-author={msg.planet === 'Luna' ? 'Luna' : undefined}
                      >
                        <div className={msg.planet === 'История' ? styles.historyChatStoryTitle : styles.historyChatSender}>
                          {msg.planet}
                        </div>
                        <div className={styles.historyChatContent}>{msg.message}</div>
                        <div className={styles.historyChatTime}>{msg.time}</div>
                      </div>
                    )
                  ))}

                  {/* Индикатор печати для планет (НЕ для "История") */}
                  {historyStoryPhase === 'generating' && currentTypingPlanet && currentTypingPlanet !== 'История' && (
                    <div className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${styles.planetMessage} ${styles.visible}`}>
                      <div className={styles.historyChatSender}>
                        {currentTypingPlanet}
                      </div>
                      <div className={styles.historyChatTyping}>
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  )}

                  {/* Интро-сообщения для жанра и контракта */}
                  {historyStoryPhase === 'ready' && historyStoryMeta && false && (
                    <>
                      {/* Сообщение 1: "Жанр" от Пользователя (Настя) */}
                      {introMessagesVisible >= 1 && (
                        <div className={`${styles.historyChatBubble} ${styles.historyChatOutgoing} ${styles.historyIntroMessage} ${styles.visible}`}>
                          <div className={styles.historyChatSender}>Настя</div>
                          <div className={styles.historyChatContent}>
                            Жанр
                          </div>
                        </div>
                      )}
                      {/* Анимация печати от Истории перед ответом на жанр */}
                      {introMessagesVisible >= 1 && introMessagesVisible < 2 && introTyping && (
                        <div className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${styles.historyIntroMessage} ${styles.visible}`}>
                          <div className={styles.historyChatStoryTitle}>История</div>
                          <div className={styles.historyChatTyping}>
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                      )}
                      {/* Сообщение 2: Ответ Истории на жанр */}
                      {introMessagesVisible >= 2 && (
                        <div className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${styles.historyIntroMessage} ${styles.visible}`}>
                          <div className={styles.historyChatStoryTitle}>История</div>
                          <div className={styles.historyChatContent}>
                            {historyStoryMeta?.genre ?? historyStoryAuthor?.genre}
                          </div>
                        </div>
                      )}
                      {/* Сообщение 3: "Контракт" от Пользователя (Настя) */}
                      {introMessagesVisible >= 3 && (
                        <div className={`${styles.historyChatBubble} ${styles.historyChatOutgoing} ${styles.historyIntroMessage} ${styles.visible}`}>
                          <div className={styles.historyChatSender}>Настя</div>
                          <div className={styles.historyChatContent}>
                            Контракт
                          </div>
                        </div>
                      )}
                      {/* Анимация печати от Истории перед ответом на контракт */}
                      {introMessagesVisible >= 3 && introMessagesVisible < 4 && introTyping && (
                        <div className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${styles.historyIntroMessage} ${styles.visible}`}>
                          <div className={styles.historyChatStoryTitle}>История</div>
                          <div className={styles.historyChatTyping}>
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                      )}
                      {/* Сообщение 4: Ответ Истории на контракт */}
                      {introMessagesVisible >= 4 && (
                        <div className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${styles.historyIntroMessage} ${styles.visible}`}>
                          <div className={styles.historyChatStoryTitle}>История</div>
                          <div className={styles.historyChatContent}>
                            {historyStoryMeta?.contract ?? 'Контракт формируется'}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {/* Основные сообщения истории */}
                  {historyStorySegments.map((segment, segmentIndex) => {
                    const timestamp = new Date(segment.timestamp);
                    const timeStr = timestamp.toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const storyTitle = historyStoryMeta?.title ?? 'История';

                    const selectedChoice = segment.option;

                    return (
                      <React.Fragment key={segment.id}>
                        <div
                          className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${styles.visible}`}
                        >
                          <div className={styles.historyChatStoryTitle}>{storyTitle}</div>
                          <div className={styles.historyChatMessageWrapper}>
                            <div className={styles.historyChatTextBlock}>
                              <div className={styles.historyChatContent}>
                                <div className={styles.historyChatScene}>{segment.text}</div>
                                <div className={styles.historyChatTime}>{timeStr}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                        {selectedChoice && (
                          <div className={`${styles.historyChatBubble} ${styles.historyChatOutgoing} ${styles.nastiaReplyStatic} ${styles.visible}`}>
                            <div className={styles.historyChatSender}>Настя</div>
                            <div className={styles.historyChatMessageWrapper}>
                              <div className={styles.historyChatTextBlock}>
                                <div className={styles.historyChatContent}>
                                  {selectedChoice.title}
                                  {selectedChoice.description && (
                                    <>
                                      <br />
                                      {selectedChoice.description}
                                    </>
                                  )}
                                  <div className={styles.historyChatTime}>{timeStr}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {/* Индикатор печати для самой истории (только в фазе ready) */}
                  {historyStoryPhase === 'ready' && (historyStoryTyping || (historyStoryLoading && !historyStoryTyping)) && (
                    <div className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${styles.visible}`}>
                      <div className={styles.historyChatStoryTitle}>{historyStoryMeta?.title ?? 'История'}</div>
                      <div className={styles.historyChatTyping}>
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  )}
                  {historyStoryFinalSummary && !historyStoryTyping && (
                    <div className={`${styles.historyChatBubble} ${styles.historyFinalSummaryBubble}`}>
                      <div className={styles.historyFinalSummaryHeader}>
                        <div className={styles.historyFinalSummaryLabel}>Что мы о тебе узнали</div>
                        <div className={styles.insightStyleToggle}>
                          <button
                            type="button"
                            className={`${styles.insightStyleButton} ${finaleInterpretationMode === 'human' ? styles.active : ''}`}
                            onClick={() => handleFinaleInterpretationToggle('human')}
                          >
                            На человеческом
                          </button>
                          <button
                            type="button"
                            className={`${styles.insightStyleButton} ${finaleInterpretationMode === 'astrological' ? styles.active : ''}`}
                            onClick={() => handleFinaleInterpretationToggle('astrological')}
                          >
                            На астрологическом
                          </button>
                        </div>
                      </div>
                      <div className={styles.historyFinalSummaryText}>
                        {finaleInterpretationMode === 'human' ? historyStoryFinalSummary.human : historyStoryFinalSummary.astrological}
                      </div>
                    </div>
                  )}
                </div>
                {historyStoryError && (
                  <div className={styles.historyStoryError}>
                    <span>{historyStoryError}</span>
                    <button
                      type="button"
                      className={styles.historyStoryRetry}
                      onClick={handleHistoryRetry}
                      disabled={historyStoryLoading}
                    >
                      Попробовать снова
                    </button>
                  </div>
                )}
                {!historyStoryTyping && historyStoryOptions.length > 0 && (
                  <div className={`${styles.historyChatReplies} ${historyButtonsHiding ? styles.historyChatRepliesHiding : ''}`}>
                    {historyStoryOptions.map((option, index) => {
                      const accentClass = index === 0 ? styles.historyChatReplyPrimary : styles.historyChatReplyAlt;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`${styles.historyChatReplyButton} ${accentClass} ${index < visibleButtonsCount ? styles.visible : ''}`}
                          onClick={() => handleHistoryOptionSelect(option)}
                          disabled={historyStoryLoading}
                        >
                          <span className={styles.historyChatReplyTitle}>{option.title}</span>
                          <span className={styles.historyChatReplyDescription}>{option.description}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div ref={historyScrollAnchorRef} className={styles.historyScrollAnchor} aria-hidden />
          </div>
        )}

        {/* Вкладка: Циклы */}
        {activeTab === 'cycles' && (
          <div className={`${styles.card} ${styles.historyCyclesCard}`}>
            <div className={styles.historyCyclesHeader}>
              <h3 className={styles.statsTitle}>Все циклы ({cycles.length})</h3>
            </div>
            {cycles.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Нет записанных циклов</p>
                <p className={styles.emptyStateHint}>
                  Перейдите на вкладку "Календарь" и нажмите на дату начала цикла
                </p>
              </div>
            ) : (
              <div className={styles.cyclesListContainer}>
                {cycles
                  .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                  .map((cycle, index, sortedCycles) => {
                    const nextCycle = sortedCycles[index + 1];
                    const daysBetween = nextCycle
                      ? diffInDays(new Date(cycle.startDate), new Date(nextCycle.startDate))
                      : null;
                    const isVisible = visibleCycleIds.includes(cycle.id);

                    return (
                      <React.Fragment key={cycle.id}>
                        <div className={`${styles.cycleItem} ${isVisible ? styles.cycleItemVisible : ''}`}>
                          <div className={styles.cycleInfo}>
                            <div className={styles.cycleDateRow}>
                              <span className={styles.cycleDateMarker} aria-hidden="true" />
                              <span className={styles.cycleDateText}>
                                {formatDate(new Date(cycle.startDate))}
                              </span>
                            </div>
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
                        {daysBetween !== null && (
                          <div className={`${styles.timelineGap} ${isVisible ? styles.timelineGapVisible : ''}`}>
                            <div className={styles.timelineGapLine} />
                            <div className={styles.timelineGapBadge}>
                              <span className={styles.timelineGapDays}>{daysBetween}</span>
                              <span className={styles.timelineGapLabel}>
                                {daysBetween === 1 ? 'день' : daysBetween < 5 ? 'дня' : 'дней'}
                              </span>
                            </div>
                            <div className={styles.timelineGapLine} />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
              </div>
            )}
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
              {notificationsLoading ? (
                <div className={styles.notificationsSkeletonList}>
                  {[0, 1, 2].map(index => (
                    <div key={index} className={styles.notificationSkeletonCard}>
                      <div className={styles.notificationSkeletonTitle} />
                      <div className={styles.notificationSkeletonLine} />
                      <div className={styles.notificationSkeletonMeta}>
                        <span />
                        <span />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notificationsError ? (
                <div className={styles.notificationErrorState}>
                  <p>{notificationsError}</p>
                  <button
                    type="button"
                    className={styles.notificationRetryButton}
                    onClick={() => {
                      setNotificationsError(null);
                      void refreshRemoteNotifications();
                    }}
                  >
                    Обновить
                  </button>
                </div>
              ) : notifications.length === 0 ? (
                <div className={styles.notificationEmptyState}>
                  <img
                    src={process.env.PUBLIC_URL + '/nastia-empty.png'}
                    alt="Нет уведомлений"
                    className={styles.emptyStateImage}
                  />
                  <p className={styles.notificationEmpty}>
                    Пока никакой язвительной драмы — новых уведомлений нет.
                  </p>
                </div>
              ) : (
                <div className={styles.notificationsList}>
                  {notifications.map(notification => (
                    <div
                      key={notification.id}
                      className={`${styles.notificationCard} ${visibleNotificationIds.includes(notification.id) ? styles.notificationCardVisible : ''}`}
                    >
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
                  <div className={styles.periodChatSkeleton}>
                    <div className={styles.periodSkeletonBubble} style={{ width: '78%' }}></div>
                    <div className={styles.periodSkeletonBubble} style={{ width: '90%' }}></div>
                  </div>
                ) : (
                  <div className={styles.periodMessages} aria-live="polite">
                    <div
                      className={`${styles.periodMessage} ${styles.questionBubble} ${showQuestionBubble ? styles.periodMessageVisible : ''}`}
                    >
                      {activePeriodContent.question}
                    </div>
                    <div
                      className={`${styles.periodMessage} ${styles.jokeBubble} ${showJokeBubble ? styles.periodMessageVisible : ''}`}
                    >
                      <span className={styles.periodWisdomLabel}>Народная мудрость</span>
                      <div className={styles.periodWisdomContent}>
                        {activePeriodContent.joke.emoji ? (
                          <span className={styles.periodHintEmoji} aria-hidden="true">
                            {activePeriodContent.joke.emoji}
                          </span>
                        ) : null}
                        <span>{activePeriodContent.joke.text}</span>
                      </div>
                    </div>
                  </div>
                )}

                {periodContentStatus === 'error' && periodContentError && (
                  <p className={styles.periodContentError}>{periodContentError}</p>
                )}
              </div>

              <div className={styles.periodHoroscopeSection}>
                {horoscopeVisible ? (
                  periodHoroscopeStatus === 'loading' ? (
                    <div className={styles.periodHoroscopeSkeleton}>
                      <div className={styles.periodHoroscopeSkeletonHeader} />
                      <div className={styles.periodHoroscopeSkeletonLine} />
                      <div className={styles.periodHoroscopeSkeletonLine} style={{ width: '85%' }} />
                      <div className={styles.periodHoroscopeSkeletonLine} style={{ width: '78%' }} />
                    </div>
                  ) : periodHoroscope ? (
                    <div className={styles.periodHoroscopeCard}>
                      <div className={styles.periodHoroscopeHeader}>
                        <span className={styles.periodHoroscopeTitle}>Гороскоп для Настеньки</span>
                        {periodHoroscope.weekRange ? (
                          <span className={styles.periodHoroscopeRange}>{periodHoroscope.weekRange}</span>
                        ) : null}
                      </div>
                      <div className={styles.periodHoroscopeText}>
                        {periodHoroscope.text.split('\n\n').map((paragraph, index) => (
                          <p key={index}>{paragraph.replace(/\*\*/g, '').replace(/\*\*/g, '')}</p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.periodHoroscopeError}>
                      Не удалось загрузить гороскоп. Попробуй ещё раз позже.
                    </div>
                  )
                ) : (
                  <button
                    type="button"
                    className={styles.periodHoroscopeCTA}
                    onClick={() => {
                      setHoroscopeVisible(true);
                      setPeriodHoroscopeStatus('loading');
                    }}
                  >
                    <span className={styles.periodHoroscopeCTAIcon}>🔮</span>
                    <div>
                      <div className={styles.periodHoroscopeCTATitle}>Показать твой гороскоп на неделю</div>
                      <div className={styles.periodHoroscopeCTASubtitle}>
                        Правду и только правду, ничего кроме правды.
                      </div>
                    </div>
                  </button>
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
                </div>
              )}

              <div className={styles.formGroup}>
                <p className={styles.formInfo}>
                  ✓ Данные будут автоматически сохраняться в приватный репозиторий GitHub
                </p>
              </div>

              {cloudEnabled && (
                <div className={styles.formGroup}>
                  <p className={styles.formInfo}>
                    ✓ Claude API ключ подтянут из GitHub Secrets — Настя с лучшим сарказмом генерирует тексты.
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

      {/* Модальное окно дневного гороскопа */}
      {showDailyHoroscopeModal && (
        <div className={styles.modal}>
          <div className={`${styles.modalContent} ${styles.dailyHoroscopeModal}`}>
            <div className={styles.dailyHoroscopeHeader}>
              <h3 className={styles.dailyHoroscopeHeading}>Гороскоп на сегодня</h3>
              <button
                onClick={() => setShowDailyHoroscopeModal(false)}
                className={`${styles.closeButton} ${styles.closeButtonLight}`}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            <div className={styles.dailyHoroscopeBody} ref={dailyHoroscopeBodyRef}>
              {dailyHoroscopeStatus === 'loading' ? (
                <div className={styles.dailyHoroscopeLoading}>
                  <div className={styles.starsBackground}>
                    {Array.from({ length: 50 }).map((_, index) => (
                      <div
                        key={index}
                        className={styles.star}
                        style={{
                          left: `${Math.random() * 100}%`,
                          top: `${Math.random() * 100}%`,
                          '--duration': `${2 + Math.random() * 3}s`,
                          '--delay': `${Math.random() * 3}s`,
                          '--max-opacity': Math.random() * 0.5 + 0.3,
                        } as React.CSSProperties}
                      />
                    ))}
                  </div>
                  <div
                    key={`daily-loading-${dailyLoadingIndex}-${currentDailyLoadingMessage.text}`}
                    className={styles.dailyHoroscopeLoadingContent}
                  >
                    <div className={styles.dailyHoroscopeLoadingEmoji} aria-hidden="true">
                      {currentDailyLoadingMessage.emoji}
                    </div>
                    <p className={styles.dailyHoroscopeLoadingText}>{currentDailyLoadingMessage.text}</p>
                  </div>
                </div>
              ) : dailyHoroscopeStatus === 'error' ? (
                <div className={styles.dailyHoroscopeError}>{dailyHoroscopeError}</div>
              ) : dailyHoroscope ? (
                <>
                  <div className={styles.dailyHoroscopeText}>
                    {dailyHoroscope.text.split('\n\n').map((paragraph, index) => (
                      <p key={index}>{paragraph.replace(/\*\*/g, '').replace(/\*\*/g, '')}</p>
                    ))}
                  </div>
                  {activeTab === 'calendar' && !sergeyBannerDismissed && (
                    <div
                      className={styles.sergeyBanner}
                      aria-live="polite"
                      ref={sergeyBannerRef}
                    >
                      {sergeyBannerCopyStatus === 'loading' ? (
                        <div className={styles.sergeyBannerTitle} aria-hidden="true">
                          <span className={styles.sergeyBannerSkeletonTitle} />
                        </div>
                      ) : (
                        <div className={styles.sergeyBannerTitle}>{effectiveSergeyBannerCopy.title}</div>
                      )}
                      <div
                        className={styles.sergeyBannerLoadingMeasure}
                        ref={sergeyLoadingMeasureRef}
                        aria-hidden="true"
                      >
                        {sergeyLoadingMessages.map((message, index) => (
                          <div
                            key={`sergey-loading-measure-${index}-${message.text}`}
                            className={styles.sergeyBannerLoading}
                          >
                            <div className={styles.sergeyBannerLoadingContent}>
                              <span className={styles.sergeyBannerEmoji}>{message.emoji}</span>
                              <span className={styles.sergeyBannerLoadingText}>{message.text}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {sergeyHoroscopeStatus === 'loading' ? (
                        <>
                          <div
                            className={styles.sergeyBannerLoading}
                            style={sergeyLoadingMaxHeight ? { minHeight: sergeyLoadingMaxHeight } : undefined}
                          >
                            <div
                              key={`sergey-loading-${sergeyLoadingIndex}-${currentSergeyLoadingMessage.text}`}
                              className={styles.sergeyBannerLoadingContent}
                            >
                              <span className={styles.sergeyBannerEmoji} aria-hidden="true">
                                {currentSergeyLoadingMessage.emoji}
                              </span>
                              <span className={styles.sergeyBannerLoadingText}>{currentSergeyLoadingMessage.text}</span>
                            </div>
                          </div>
                        </>
                      ) : sergeyHoroscopeStatus === 'error' ? (
                        <>
                          <div className={styles.sergeyBannerError}>
                            {sergeyHoroscopeError ?? 'Звёзды молчат — Серёжа остаётся в тумане.'}
                          </div>
                          <div className={styles.sergeyBannerActions}>
                            <button
                              type="button"
                              className={`${styles.sergeyBannerButton} ${styles.sergeyBannerPrimary}`}
                              onClick={handleSergeyHoroscopeRequest}
                            >
                              Попробовать ещё раз
                            </button>
                          </div>
                        </>
                      ) : sergeyHoroscopeStatus === 'success' && sergeyHoroscope ? (
                        sergeyHoroscope.text
                          .split('\n')
                          .map((line, index) => (
                            <p key={index} className={styles.sergeyBannerParagraph}>
                              {line.replace(/\*\*/g, '')}
                            </p>
                          ))
                      ) : sergeyBannerCopyStatus === 'loading' ? (
                        <div className={styles.sergeyBannerSkeletonBody} aria-hidden="true">
                          <span className={styles.sergeyBannerSkeletonLine} />
                          <span className={styles.sergeyBannerSkeletonLineShort} />
                          <div className={styles.sergeyBannerSkeletonButtons}>
                            <span className={styles.sergeyBannerSkeletonButton} />
                            <span className={styles.sergeyBannerSkeletonButtonSecondary} />
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className={styles.sergeyBannerSubtitle}>
                            {effectiveSergeyBannerCopy.subtitle}
                          </p>
                          <div className={styles.sergeyBannerActions}>
                            <button
                              type="button"
                              className={`${styles.sergeyBannerButton} ${styles.sergeyBannerPrimary}`}
                              onClick={handleSergeyHoroscopeRequest}
                            >
                              <span>{effectiveSergeyBannerCopy.primaryButton}</span>
                            </button>
                            <button
                              type="button"
                              className={`${styles.sergeyBannerButton} ${styles.sergeyBannerSecondary}`}
                              onClick={handleSergeyBannerDismiss}
                            >
                              {effectiveSergeyBannerCopy.secondaryButton}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Стеклянное нижнее меню */}
      <GlassTabBar
        activeTab={activeTab}
        onTabChange={(tabId) => {
          if (tabId === 'settings') {
            setShowSettings(true);
          } else {
            setActiveTab(tabId);
          }
        }}
        cycleCount={cycles.length}
        daysUntilNext={getDaysUntilNext(cycles)}
        hasNewStory={hasNewStoryMessage}
      />
    </div>
  );
};

export default ModernNastiaApp;
