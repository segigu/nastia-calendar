/**
 * DiscoverTabV2 - новая версия вкладки "Узнай себя" с централизованным ChatManager
 *
 * Основные отличия от старой версии:
 * - Использует ChatManager для унифицированного управления чатом
 * - Единый useChatScroll для автоскролла
 * - Чистая архитектура без разрозненных состояний
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChatManager, type ChatManagerHandle } from './chat/ChatManager';
import type { HistoryStoryOption } from '../utils/historyStory';
import {
  generateHistoryStoryChunk,
  generateCustomHistoryOption,
  type HistoryStoryMeta
} from '../utils/historyStory';
import { transcribeAudioBlob } from '../utils/audioTranscription';
import {
  calculateTypingDuration,
  calculatePauseBefore,
  calculatePauseAfter,
} from '../utils/planetMessages';
import {
  loadDiscoverTabState,
  saveDiscoverTabState,
  clearDiscoverTabState,
} from '../utils/discoverTabStorage';
import styles from './NastiaApp.module.css';

// Константы для рандомных промптов
const HISTORY_START_PROMPTS = [
  'Давай проверим, насколько ты правдива с собой сегодня',
  'Готова разобрать себя на части? Звёзды уже наточили скальпель',
  'Что если астрология знает о тебе больше, чем ты думаешь?',
  'Твоя карта готова рассказать правду — ты?',
  'Проверь себя на честность, пока никто не видит',
];

const HISTORY_START_BUTTONS = [
  'Начать историю',
  'Проверить себя',
  'Узнать правду',
  'Погнали',
  'Давай',
  'Поехали',
];

const HISTORY_START_DESCRIPTIONS = [
  'Я создам для тебя персональную историю, в которой ты будешь делать выборы. А потом разберу каждое твоё решение по косточкам',
  'Тебя ждёт интерактивная история с выборами. В конце я проанализирую твои решения и скажу, где ты была честна с собой',
  'Пройдёшь через историю с развилками. Я буду следить за твоими выборами, а потом расскажу, что они говорят о тебе',
];

interface PersonalizedPlanetMessages {
  dialogue: Array<{ planet: string; message: string }>;
  timestamp: number;
}

interface DiscoverTabV2Props {
  // Общие данные приложения
  hasAiCredentials: boolean;
  effectiveClaudeKey: string | null | undefined;
  effectiveClaudeProxyUrl: string | null | undefined;
  effectiveOpenAIKey: string | null | undefined;
  effectiveOpenAIProxyUrl: string | null | undefined;

  // Персонализированные сообщения планет (загружаются фоном)
  personalizedPlanetMessages: PersonalizedPlanetMessages | null;
  isLoadingPersonalizedMessages: boolean;

  // Callback для обновления badge
  onNewStoryMessage?: () => void;
}

export const DiscoverTabV2: React.FC<DiscoverTabV2Props> = ({
  hasAiCredentials,
  effectiveClaudeKey,
  effectiveClaudeProxyUrl,
  effectiveOpenAIKey,
  effectiveOpenAIProxyUrl,
  personalizedPlanetMessages,
  isLoadingPersonalizedMessages,
  onNewStoryMessage,
}) => {
  // ============================================================================
  // STATE & REFS
  // ============================================================================

  const chatManagerRef = useRef<ChatManagerHandle>(null);
  const [isStarted, setIsStarted] = useState(false); // Просто флаг: начали ли диалог
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storyMeta, setStoryMeta] = useState<HistoryStoryMeta | null>(null);
  const [currentArc, setCurrentArc] = useState(1);
  const [storyContract, setStoryContract] = useState<string | null>(null);

  // Finale interpretations
  const [finaleInterpretations, setFinaleInterpretations] = useState<{ human: string; astrological: string } | null>(null);
  const [finaleInterpretationMode, setFinaleInterpretationMode] = useState<'human' | 'astrological'>('human');

  // Custom voice option state
  type CustomOptionStatus = 'idle' | 'recording' | 'transcribing' | 'generating' | 'ready' | 'error';
  const [customOption, setCustomOption] = useState<{
    status: CustomOptionStatus;
    option: HistoryStoryOption | null;
    transcript?: string;
    error?: string;
  }>({
    status: 'idle',
    option: null,
  });
  const [customRecordingLevel, setCustomRecordingLevel] = useState(0);
  const [hasChoices, setHasChoices] = useState(false); // Track if choices are available for button visibility

  // Рандомные тексты для idle экрана (генерируются один раз)
  const [startPrompt] = useState(() =>
    HISTORY_START_PROMPTS[Math.floor(Math.random() * HISTORY_START_PROMPTS.length)]
  );
  const [startButton] = useState(() =>
    HISTORY_START_BUTTONS[Math.floor(Math.random() * HISTORY_START_BUTTONS.length)]
  );
  const [startDescription] = useState(() =>
    HISTORY_START_DESCRIPTIONS[Math.floor(Math.random() * HISTORY_START_DESCRIPTIONS.length)]
  );

  // Анимация появления элементов idle экрана
  const [visibleElements, setVisibleElements] = useState<string[]>([]);

  // Refs для таймеров
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Refs для актуальных значений props (для использования в callback'ах)
  const personalizedMessagesRef = useRef(personalizedPlanetMessages);
  const isLoadingRef = useRef(isLoadingPersonalizedMessages);

  // Ref для результата AI генерации (чтобы не прерывать диалог планет)
  const aiResultRef = useRef<any>(null);

  // Флаг для остановки диалога после текущего сообщения
  const stopDialogueAfterCurrentRef = useRef<boolean>(false);

  // Флаг: был ли диалог запущен
  const dialogueStartedRef = useRef<boolean>(false);

  // История сегментов для передачи в AI
  interface StorySegment {
    text: string;
    arc: number;
    optionTitle?: string;
    optionDescription?: string;
  }
  const storySegmentsRef = useRef<StorySegment[]>([]);

  // Refs для голосового ввода
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array | null>(null);
  const recordingAnimationFrameRef = useRef<number | null>(null);
  const customOptionAbortControllerRef = useRef<AbortController | null>(null);

  // Ref для текущих choices (чтобы можно было обновить только customOption)
  const currentChoicesRef = useRef<HistoryStoryOption[]>([]);

  // Ref для контекста последней генерации (для retry без потери прогресса)
  const lastGenerationContextRef = useRef<{
    type: 'story' | 'dialogue';
    choice?: HistoryStoryOption;
    nextArc?: number;
    arcLimit?: number;
    isFinaleTime?: boolean;
  } | null>(null);

  // Флаг для отслеживания, было ли уже загружено состояние
  const stateLoadedRef = useRef(false);

  // ============================================================================
  // STATE LOADING (MOUNT)
  // ============================================================================

  // Загружаем сохраненное состояние при монтировании компонента
  useEffect(() => {
    // Предотвращаем повторную загрузку
    if (stateLoadedRef.current) {
      console.log('[DiscoverV2] State already loaded, skipping');
      return;
    }

    // Предотвращаем загрузку, если история уже запущена (не сбрасываем текущее состояние)
    if (isStarted) {
      console.log('[DiscoverV2] Story already started, skipping state load');
      stateLoadedRef.current = true;
      return;
    }

    const savedState = loadDiscoverTabState();

    if (savedState && savedState.isStarted) {
      console.log('[DiscoverV2] Loading saved state:', {
        phase: savedState.phase,
        messagesCount: savedState.messages.length,
        currentArc: savedState.currentArc,
        choicesCount: savedState.choices.length,
      });

      // Восстанавливаем основные состояния
      setIsStarted(savedState.isStarted);
      setCurrentArc(savedState.currentArc);
      setStoryContract(savedState.storyMeta?.contract || null);

      if (savedState.storyMeta) {
        setStoryMeta({
          author: savedState.storyMeta.author,
          title: savedState.storyMeta.title,
          genre: savedState.storyMeta.genre,
          moonSummary: savedState.storyMeta.moonSummary,
          arcLimit: savedState.storyMeta.arcLimit,
          contract: savedState.storyMeta.contract,
        });
      }

      // Восстанавливаем сегменты истории
      storySegmentsRef.current = savedState.storySegments;

      // Восстанавливаем финальные интерпретации
      if (savedState.finaleInterpretations) {
        setFinaleInterpretations(savedState.finaleInterpretations);
        setFinaleInterpretationMode(savedState.finaleInterpretationMode);
      }

      // Восстанавливаем сообщения и фазу через ChatManager
      // Делаем это асинхронно, чтобы дать React время на рендер
      setTimeout(() => {
        if (savedState.phase) {
          chatManagerRef.current?.setPhase(savedState.phase);
        }

        if (savedState.messages.length > 0) {
          chatManagerRef.current?.addMessages(savedState.messages);
        }

        // Восстанавливаем choices
        if (savedState.choices.length > 0) {
          currentChoicesRef.current = savedState.choices;
          setHasChoices(true);
          chatManagerRef.current?.setChoices(savedState.choices);
        }
      }, 100);

      console.log('[DiscoverV2] ✅ State restored successfully');
      stateLoadedRef.current = true;
    } else {
      console.log('[DiscoverV2] No saved state to restore');
      stateLoadedRef.current = true;
    }
  }, []); // Запускаем только при монтировании

  // ============================================================================
  // STATE SAVING (AUTO)
  // ============================================================================

  // Автоматически сохраняем состояние при изменении ключевых данных
  useEffect(() => {
    // Не сохраняем, если еще не началось или еще не загрузилось состояние
    if (!isStarted || !stateLoadedRef.current) {
      return;
    }

    // Получаем текущее состояние из ChatManager
    const currentPhase = chatManagerRef.current?.getPhase();
    const currentMessages = chatManagerRef.current?.getMessages() || [];
    const currentChoices = chatManagerRef.current?.getChoices() || [];

    // Определяем, есть ли непрочитанные варианты
    const hasUnreadChoices = currentChoices.length > 0 && currentPhase === 'story';

    const stateToSave = {
      isStarted,
      phase: currentPhase || null,
      messages: currentMessages,
      storyMeta: storyMeta ? {
        author: storyMeta.author,
        title: storyMeta.title,
        genre: storyMeta.genre,
        moonSummary: storyMeta.moonSummary,
        arcLimit: storyMeta.arcLimit,
        contract: storyMeta.contract || storyContract || '',
      } : null,
      currentArc,
      storySegments: storySegmentsRef.current,
      choices: currentChoices,
      finaleInterpretations,
      finaleInterpretationMode,
      hasUnreadChoices,
      lastUpdated: new Date().toISOString(),
    };

    saveDiscoverTabState(stateToSave);

    // Уведомляем родителя, если есть непрочитанные варианты
    if (hasUnreadChoices && onNewStoryMessage) {
      onNewStoryMessage();
    }

  }, [
    isStarted,
    currentArc,
    storyMeta,
    storyContract,
    finaleInterpretations,
    finaleInterpretationMode,
    onNewStoryMessage,
  ]);

  // ============================================================================
  // AUTOSCROLL & STATE SYNC
  // ============================================================================

  const handleMessagesChange = useCallback(() => {
    // Тройной RAF для гарантированного рендера
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Скроллим до конца - tab bar учитывается через padding-bottom контейнера
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth',
          });
          console.log('[DiscoverV2] Auto-scroll to:', document.documentElement.scrollHeight);
        });
      });
    });

    // Сохраняем состояние при каждом изменении сообщений (если история уже началась)
    if (isStarted && stateLoadedRef.current) {
      const currentPhase = chatManagerRef.current?.getPhase();
      const currentMessages = chatManagerRef.current?.getMessages() || [];
      const currentChoices = chatManagerRef.current?.getChoices() || [];

      const stateToSave = {
        isStarted: true,
        phase: currentPhase || null,
        messages: currentMessages,
        storyMeta: storyMeta ? {
          author: storyMeta.author,
          title: storyMeta.title,
          genre: storyMeta.genre,
          moonSummary: storyMeta.moonSummary,
          arcLimit: storyMeta.arcLimit,
          contract: storyMeta.contract || storyContract || '',
        } : null,
        currentArc,
        storySegments: storySegmentsRef.current,
        choices: currentChoices,
        finaleInterpretations,
        finaleInterpretationMode,
        hasUnreadChoices: currentChoices.length > 0 && currentPhase === 'story',
        lastUpdated: new Date().toISOString(),
      };

      saveDiscoverTabState(stateToSave);
    }
  }, [isStarted, storyMeta, storyContract, currentArc, finaleInterpretations, finaleInterpretationMode]);

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const getCurrentTime = () =>
    new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // ============================================================================
  // PLANET DIALOGUE GENERATION
  // ============================================================================

  const startPlanetDialogue = useCallback(async () => {
    if (!hasAiCredentials) {
      setError('Необходимо настроить API ключи в настройках');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setIsStarted(true);
    stateLoadedRef.current = true; // Новая история началась - разрешаем сохранение

    // Очистка предыдущих таймеров
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];

    // Сохраняем контекст генерации для возможного retry
    lastGenerationContextRef.current = {
      type: 'dialogue',
    };

    // Очистка чата
    chatManagerRef.current?.clearMessages();

    console.log('[DiscoverV2] Starting planet dialogue animation...');

    // Сохраняем состояние сразу после начала, чтобы при переключении вкладок не сбрасывалось
    setTimeout(() => {
      const stateToSave = {
        isStarted: true,
        phase: 'dialogue' as const,
        messages: chatManagerRef.current?.getMessages() || [],
        storyMeta: null,
        currentArc: 1,
        storySegments: [],
        choices: [],
        finaleInterpretations: null,
        finaleInterpretationMode: 'human' as const,
        hasUnreadChoices: false,
        lastUpdated: new Date().toISOString(),
      };
      saveDiscoverTabState(stateToSave);
      console.log('[DiscoverV2] Initial state saved after start');
    }, 200);

    // ВАЖНО: Устанавливаем фазу и добавляем первое сообщение с задержкой
    // чтобы гарантировать, что React успел обновить state после clearMessages
    setTimeout(() => {
      chatManagerRef.current?.setPhase('dialogue');

      // Добавляем первое сообщение сразу после установки фазы
      setTimeout(() => {
        chatManagerRef.current?.addMessage({
          type: 'planet',
          author: 'Луна',
          content: 'Так, коллеги, собираемся! Сейчас обсудим, какую историю для Насти придумать...',
          time: getCurrentTime(),
          id: generateId(),
        });
      }, 50);
    }, 100);

    // 2. Планеты "подключаются" (системные сообщения)
    // Индивидуальные задержки отражают характер каждой планеты
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
      const t = setTimeout(() => {
        chatManagerRef.current?.addMessage({
          type: 'system',
          author: planet as any,
          content: 'подключился к чату...',
          time: getCurrentTime(),
          id: generateId(),
        });
      }, delay);
      timeoutsRef.current.push(t);
    });

    // 3. Диалог планет (показывается ПОКА грузится AI)
    // Используем ТОЛЬКО персонализированные сообщения (без fallback!)

    // Функция для запуска диалога с вариативными паузами
    const startDialogue = (dialogue: Array<{ planet: string; message: string }>) => {
      console.log('[DiscoverV2] Starting planet dialogue with', dialogue.length, 'messages');

      // Устанавливаем флаг, что диалог запущен
      dialogueStartedRef.current = true;

      // Если AI УЖЕ готова - устанавливаем флаг остановки сразу
      if (aiResultRef.current) {
        stopDialogueAfterCurrentRef.current = true;
        console.log('[DiscoverV2] AI already ready, dialogue will stop after first message');
      } else {
        // Сбрасываем флаг остановки
        stopDialogueAfterCurrentRef.current = false;
      }

      // Задержка после последнего подключения планет (Нептун: 4800ms) + пауза 600ms
      const startDelay = 5400;
      let messageIndex = 0;

      // Рекурсивная функция для генерации сообщений с индивидуальными паузами
      const generateMessage = (delay: number) => {
        // Проверяем, не нужно ли остановиться
        if (stopDialogueAfterCurrentRef.current) {
          console.log('[DiscoverV2] ⛔ Stopping dialogue as requested, showing AI result');
          if (aiResultRef.current) {
            showAIResult(aiResultRef.current);
            aiResultRef.current = null;
          }
          return;
        }

        if (messageIndex >= dialogue.length) {
          console.log('[DiscoverV2] ✅ All personalized messages shown');
          // Если AI уже готова - показываем результат
          if (aiResultRef.current) {
            console.log('[DiscoverV2] Dialogue complete, AI result ready, showing now');
            showAIResult(aiResultRef.current);
            aiResultRef.current = null;
          }
          return;
        }

        const { planet, message } = dialogue[messageIndex];
        messageIndex++;

        // Рассчитываем индивидуальную паузу перед началом печати для этой планеты
        const pauseBefore = calculatePauseBefore(planet);

        // Показываем индикатор печати с индивидуальной задержкой
        const t1 = setTimeout(() => {
          chatManagerRef.current?.setTyping(planet as any);
        }, delay + pauseBefore);
        timeoutsRef.current.push(t1);

        // Рассчитываем индивидуальную длительность печати на основе длины сообщения и скорости планеты
        const typingDuration = calculateTypingDuration(message, planet);

        // Добавляем сообщение после typing
        const t2 = setTimeout(() => {
          chatManagerRef.current?.setTyping(null);
          chatManagerRef.current?.addMessage({
            type: 'planet',
            author: planet as any,
            content: message,
            time: getCurrentTime(),
            id: generateId(),
          });

          // ПОСЛЕ отображения сообщения - проверяем, не нужно ли остановиться
          if (stopDialogueAfterCurrentRef.current) {
            console.log('[DiscoverV2] ⛔ Current message displayed, stopping dialogue, showing AI result');
            if (aiResultRef.current) {
              showAIResult(aiResultRef.current);
              aiResultRef.current = null;
            }
            return;
          }

          // Рассчитываем индивидуальную паузу после сообщения для этой планеты
          const pauseAfter = calculatePauseAfter(planet);
          generateMessage(pauseAfter);
        }, delay + pauseBefore + typingDuration);
        timeoutsRef.current.push(t2);
      };

      // Запускаем первое сообщение через начальную задержку (ПОСЛЕ подключения всех планет)
      generateMessage(startDelay);
    };

    // Проверяем, загружены ли персонализированные сообщения
    const currentMessages = personalizedMessagesRef.current;
    const currentLoading = isLoadingRef.current;

    if (currentMessages?.dialogue && currentMessages.dialogue.length > 0) {
      // Уже загружены - используем сразу
      console.log('[DiscoverV2] Using cached personalized messages');
      startDialogue(currentMessages.dialogue);
    } else if (currentLoading) {
      // Загружаются - ждём с polling (БЕЗ таймаута, пока AI не готова)
      console.log('[DiscoverV2] Waiting for personalized messages to load...');
      const checkInterval = 200; // проверяем каждые 200ms

      const checkMessages = () => {
        // Проверяем актуальное значение через ref
        const messages = personalizedMessagesRef.current;

        if (messages?.dialogue && messages.dialogue.length > 0) {
          console.log('[DiscoverV2] ✅ Personalized messages loaded, starting dialogue');
          startDialogue(messages.dialogue);
          return;
        }

        // Если AI уже готова и диалог не запустился - прекращаем ждать
        if (aiResultRef.current && !dialogueStartedRef.current) {
          console.log('[DiscoverV2] ⚠️ AI ready but no dialogue messages, showing AI result');
          showAIResult(aiResultRef.current);
          aiResultRef.current = null;
          return;
        }

        // Продолжаем проверять
        const t = setTimeout(checkMessages, checkInterval);
        timeoutsRef.current.push(t);
      };

      // Начинаем проверку через 200ms
      const t = setTimeout(checkMessages, checkInterval);
      timeoutsRef.current.push(t);
    } else {
      // Не загружаются и не загружены - пропускаем диалог
      console.log('[DiscoverV2] No personalized messages available, skipping dialogue');
    }

    // 4. Запускаем AI генерацию ПАРАЛЛЕЛЬНО (но НЕ прерываем диалог!)
    console.log('[DiscoverV2] Starting AI generation in background...');

    // Функция для показа результата AI (вызывается после завершения диалога)
    const showAIResult = (result: any) => {
      console.log('[DiscoverV2] Showing AI result');

      chatManagerRef.current?.setTyping(null);

      // Сохраняем метаданные
      if (result.meta) {
        setStoryMeta(result.meta);
        setStoryContract(result.meta.contract);
      }

      const moonSummary = result.meta?.moonSummary || 'Сейчас расскажу вам историю...';
      const arc = result.node?.scene || 'История начинается...';

      // Переходим к фазе moon и показываем сообщение от Луны
      chatManagerRef.current?.setPhase('moon');
      chatManagerRef.current?.setTyping('Луна');

      setTimeout(() => {
        chatManagerRef.current?.setTyping(null);
        chatManagerRef.current?.addMessage({
          type: 'moon',
          author: 'Луна',
          content: moonSummary,
          time: getCurrentTime(),
          id: generateId(),
        });

        // Переходим к истории
        setTimeout(() => {
          chatManagerRef.current?.setPhase('story');
          chatManagerRef.current?.addMessage({
            type: 'story',
            author: 'История',
            content: arc,
            time: getCurrentTime(),
            id: generateId(),
          });

          storySegmentsRef.current.push({
            text: arc,
            arc: 1,
          });

          setTimeout(() => {
            const options = result.options || [];
            currentChoicesRef.current = options;
            setHasChoices(options.length > 0); // Update state for button visibility
            chatManagerRef.current?.setChoices(options);
            setIsGenerating(false);

            // Для ПЕРВОГО сегмента истории делаем красивый скролл
            // Ждём появления ВСЕХ кнопок (анимация 500ms на кнопку)
            const expectedButtonCount = options.length + 1; // +1 для кастомной кнопки "Свой вариант"
            const animationDuration = expectedButtonCount * 500; // 500ms на кнопку

            console.log('[DiscoverV2] First story segment, will wait for', expectedButtonCount, 'buttons (', animationDuration, 'ms)');

            // Ждём окончания анимации появления ВСЕХ кнопок
            setTimeout(() => {
              console.log('[DiscoverV2] Button animation complete, performing reveal scroll');

              // Шаг 1: Скролл вниз до конца (показываем всё, включая кнопки)
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    window.scrollTo({
                      top: document.documentElement.scrollHeight,
                      behavior: 'smooth',
                    });
                    console.log('[DiscoverV2] Scrolled down to show everything');

                    // Шаг 2: Через 800ms откатываем к началу сообщения Луны
                    setTimeout(() => {
                      // Ищем сообщение Луны (type="moon")
                      const moonMessage = document.querySelector('[data-message-type="moon"]');
                      if (moonMessage) {
                        const rect = moonMessage.getBoundingClientRect();
                        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
                        const moonTop = rect.top + currentScroll;

                        // Скроллим так, чтобы начало сообщения было под шапкой
                        // Шапка "История (NEW v2 🧪)" примерно 60px
                        const headerHeight = 60;
                        const targetScroll = moonTop - headerHeight;

                        console.log('[DiscoverV2] Scrolling back to moon message at', targetScroll);
                        window.scrollTo({
                          top: targetScroll,
                          behavior: 'smooth',
                        });
                      } else {
                        console.warn('[DiscoverV2] Moon message not found for scroll-back');
                      }
                    }, 800); // Пауза чтобы пользователь увидел всё
                  });
                });
              });
            }, animationDuration + 200); // +200ms запас после анимации
          }, 500);
        }, 1000);
      }, 1500);
    };

    (async () => {
      try {
        const result = await generateHistoryStoryChunk({
          segments: [],
          currentChoice: undefined,
          summary: undefined,
          author: {
            name: 'История',
            stylePrompt: 'Пиши простым, современным языком. Используй короткие предложения. Избегай штампов.',
            genre: 'психологическая драма',
          },
          arcLimit: 7,
          mode: 'arc',
          currentArc: 1,
          contract: undefined,
          signal: undefined,
          claudeApiKey: effectiveClaudeKey || undefined,
          claudeProxyUrl: effectiveClaudeProxyUrl || undefined,
          openAIApiKey: effectiveOpenAIKey || undefined,
          openAIProxyUrl: effectiveOpenAIProxyUrl || undefined,
        });

        console.log('[DiscoverV2] AI generation completed!');

        // Сохраняем результат
        aiResultRef.current = result;

        // Если диалог УЖЕ запущен - устанавливаем флаг остановки
        if (dialogueStartedRef.current) {
          stopDialogueAfterCurrentRef.current = true;
          console.log('[DiscoverV2] Dialogue running, will stop after current message completes');
        } else {
          // Диалог не запущен - результат покажет polling при загрузке сообщений (или сразу если сообщения не загрузятся)
          console.log('[DiscoverV2] Dialogue not started yet, result saved for polling to handle');
        }

      } catch (err) {
        console.error('[DiscoverV2] Error generating story:', err);
        setError(err instanceof Error ? err.message : 'Ошибка генерации истории');
        setIsGenerating(false);
        chatManagerRef.current?.setTyping(null);
      }
    })();

  }, [
    hasAiCredentials,
    effectiveClaudeKey,
    effectiveClaudeProxyUrl,
    effectiveOpenAIKey,
    effectiveOpenAIProxyUrl,
  ]);

  // ============================================================================
  // RETRY LOGIC (БЕЗ ПОТЕРИ ПРОГРЕССА)
  // ============================================================================

  const retryCurrentAction = useCallback(async () => {
    const context = lastGenerationContextRef.current;

    if (!context) {
      console.warn('[DiscoverV2] No generation context to retry');
      setError('Нет контекста для повтора. Начните заново.');
      return;
    }

    console.log('[DiscoverV2] Retrying last action:', context.type);

    // Если ошибка была в диалоге планет - начинаем заново
    if (context.type === 'dialogue') {
      await startPlanetDialogue();
      return;
    }

    // Если ошибка была в генерации истории - повторяем БЕЗ очистки чата
    if (context.type === 'story' && context.choice) {
      setIsGenerating(true);
      setError(null);

      // НЕ очищаем чат! НЕ добавляем user message повторно!
      // Просто повторяем генерацию

      chatManagerRef.current?.setTyping('История');

      try {
        const recentSegments = storySegmentsRef.current.slice(-4);

        const result = await generateHistoryStoryChunk({
          segments: recentSegments,
          currentChoice: context.choice,
          summary: undefined,
          author: {
            name: storyMeta?.author || 'История',
            stylePrompt: 'Пиши простым, современным языком. Используй короткие предложения. Избегай штампов.',
            genre: storyMeta?.genre || 'психологическая драма',
          },
          arcLimit: context.arcLimit || 7,
          mode: context.isFinaleTime ? 'finale' : 'arc',
          currentArc: context.nextArc || currentArc + 1,
          contract: storyContract || undefined,
          signal: undefined,
          claudeApiKey: effectiveClaudeKey || undefined,
          claudeProxyUrl: effectiveClaudeProxyUrl || undefined,
          openAIApiKey: effectiveOpenAIKey || undefined,
          openAIProxyUrl: effectiveOpenAIProxyUrl || undefined,
        });

        chatManagerRef.current?.setTyping(null);

        if (context.isFinaleTime && result.finale) {
          // Показываем финал
          chatManagerRef.current?.setPhase('finale');

          chatManagerRef.current?.addMessage({
            type: 'story',
            author: 'История',
            content: result.finale.resolution,
            time: getCurrentTime(),
            id: generateId(),
          });

          // Сохраняем интерпретации для показа с переключателями
          setTimeout(() => {
            setFinaleInterpretations({
              human: result.finale!.humanInterpretation,
              astrological: result.finale!.astrologicalInterpretation,
            });
            setFinaleInterpretationMode('human');
            setError(null);
            setIsGenerating(false);
          }, 500);
        } else {
          // Обычный arc
          const arcText = result.node?.scene || 'История продолжается...';

          chatManagerRef.current?.addMessage({
            type: 'story',
            author: 'История',
            content: arcText,
            time: getCurrentTime(),
            id: generateId(),
          });

          // Сохраняем сегмент
          storySegmentsRef.current.push({
            text: arcText,
            arc: context.nextArc || currentArc + 1,
            optionTitle: context.choice.title,
            optionDescription: context.choice.description,
          });

          setCurrentArc(context.nextArc || currentArc + 1);

          // Показываем choices
          const options = result.options || [];
          currentChoicesRef.current = options;
          setHasChoices(options.length > 0);
          chatManagerRef.current?.setChoices(options);

          setError(null);
          setIsGenerating(false);
        }
      } catch (err) {
        console.error('[DiscoverV2] Retry failed:', err);
        setError(err instanceof Error ? err.message : 'Ошибка при повторной попытке');
        setIsGenerating(false);
        chatManagerRef.current?.setTyping(null);
      }
    }
  }, [
    currentArc,
    storyMeta,
    storyContract,
    effectiveClaudeKey,
    effectiveClaudeProxyUrl,
    effectiveOpenAIKey,
    effectiveOpenAIProxyUrl,
    startPlanetDialogue,
  ]);

  // ============================================================================
  // INTERACTIVE STORY
  // ============================================================================

  const handleChoiceSelect = useCallback(async (choice: HistoryStoryOption) => {
    console.log('[DiscoverV2] Choice selected:', choice.id, choice.title);

    setIsGenerating(true);

    // Скрываем кнопки и добавляем user message
    currentChoicesRef.current = [];
    setHasChoices(false); // Hide custom button
    setCustomOption({ status: 'idle', option: null }); // Reset custom button state
    chatManagerRef.current?.setChoices([]);

    setTimeout(async () => {
      // Добавляем выбор пользователя как сообщение
      chatManagerRef.current?.addMessage({
        type: 'user',
        author: 'Настя',
        content: choice.description || choice.title,
        time: getCurrentTime(),
        id: generateId(),
      });

      // Показываем typing indicator
      setTimeout(async () => {
        chatManagerRef.current?.setTyping('История');

        try {
          const nextArc = currentArc + 1;
          const arcLimit = storyMeta?.arcLimit || 7;

          // Берём последние 4 сегмента для контекста
          const recentSegments = storySegmentsRef.current.slice(-4);

          // Проверяем, нужен ли финал
          const isFinaleTime = nextArc > arcLimit;

          // Сохраняем контекст генерации для возможного retry
          lastGenerationContextRef.current = {
            type: 'story',
            choice,
            nextArc,
            arcLimit,
            isFinaleTime,
          };

          const result = await generateHistoryStoryChunk({
            segments: recentSegments,
            currentChoice: choice,
            summary: undefined,
            author: {
              name: storyMeta?.author || 'История',
              stylePrompt: 'Пиши простым, современным языком. Используй короткие предложения. Избегай штампов.',
              genre: storyMeta?.genre || 'психологическая драма',
            },
            arcLimit,
            mode: isFinaleTime ? 'finale' : 'arc',
            currentArc: nextArc,
            contract: storyContract || undefined,
            signal: undefined,
            claudeApiKey: effectiveClaudeKey || undefined,
            claudeProxyUrl: effectiveClaudeProxyUrl || undefined,
            openAIApiKey: effectiveOpenAIKey || undefined,
            openAIProxyUrl: effectiveOpenAIProxyUrl || undefined,
          });

          chatManagerRef.current?.setTyping(null);

          if (isFinaleTime && result.finale) {
            // Показываем финал
            chatManagerRef.current?.setPhase('finale');

            chatManagerRef.current?.addMessage({
              type: 'story',
              author: 'История',
              content: result.finale.resolution,
              time: getCurrentTime(),
              id: generateId(),
            });

            // Сохраняем интерпретации для показа с переключателями
            setTimeout(() => {
              setFinaleInterpretations({
                human: result.finale!.humanInterpretation,
                astrological: result.finale!.astrologicalInterpretation,
              });
              setIsGenerating(false);

              // Reveal scroll для финала - откатываем к началу финального story-сообщения
              setTimeout(() => {
                console.log('[DiscoverV2] Finale interpretations ready, performing reveal scroll');

                // Шаг 1: Скролл вниз до конца
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      window.scrollTo({
                        top: document.documentElement.scrollHeight,
                        behavior: 'smooth',
                      });
                      console.log('[DiscoverV2] Scrolled down to show finale interpretations');

                      // Шаг 2: Через 800ms откатываем к началу финального story-сообщения
                      setTimeout(() => {
                        const allStoryMessages = document.querySelectorAll('[data-message-type="story"]');
                        const finaleStoryMessage = allStoryMessages[allStoryMessages.length - 1];

                        if (finaleStoryMessage) {
                          const rect = finaleStoryMessage.getBoundingClientRect();
                          const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
                          const storyTop = rect.top + currentScroll;

                          const headerHeight = 60;
                          const targetScroll = storyTop - headerHeight;

                          console.log('[DiscoverV2] Scrolling back to finale story message at', targetScroll);
                          window.scrollTo({
                            top: targetScroll,
                            behavior: 'smooth',
                          });
                        }
                      }, 800);
                    });
                  });
                });
              }, 100);
            }, 800);
          } else {
            // Обычная дуга
            const arcText = result.node?.scene || 'История продолжается...';

            chatManagerRef.current?.addMessage({
              type: 'story',
              author: 'История',
              content: arcText,
              time: getCurrentTime(),
              id: generateId(),
            });

            // Сохраняем сегмент
            storySegmentsRef.current.push({
              text: arcText,
              arc: nextArc,
              optionTitle: choice.title,
              optionDescription: choice.description,
            });

            setCurrentArc(nextArc);

            // Показываем новые кнопки выбора
            setTimeout(() => {
              const options = result.options || [];
              currentChoicesRef.current = options;
              setHasChoices(options.length > 0); // Update state for button visibility
              chatManagerRef.current?.setChoices(options);
              setIsGenerating(false);

              // Для сегментов 2-6 делаем reveal scroll к началу текущего story-сообщения
              const expectedButtonCount = options.length + 1; // +1 для кастомной кнопки
              const animationDuration = expectedButtonCount * 500; // 500ms на кнопку

              console.log('[DiscoverV2] Arc', nextArc, '- will wait for', expectedButtonCount, 'buttons (', animationDuration, 'ms)');

              // Ждём окончания анимации появления ВСЕХ кнопок
              setTimeout(() => {
                console.log('[DiscoverV2] Button animation complete, performing reveal scroll for arc', nextArc);

                // Шаг 1: Скролл вниз до конца
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      window.scrollTo({
                        top: document.documentElement.scrollHeight,
                        behavior: 'smooth',
                      });
                      console.log('[DiscoverV2] Scrolled down to show everything');

                      // Шаг 2: Через 800ms откатываем к началу ТЕКУЩЕГО story-сообщения
                      setTimeout(() => {
                        // Ищем последнее story-сообщение (текущий сегмент истории)
                        const allStoryMessages = document.querySelectorAll('[data-message-type="story"]');
                        const currentStoryMessage = allStoryMessages[allStoryMessages.length - 1];

                        if (currentStoryMessage) {
                          const rect = currentStoryMessage.getBoundingClientRect();
                          const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
                          const storyTop = rect.top + currentScroll;

                          const headerHeight = 60;
                          const targetScroll = storyTop - headerHeight;

                          console.log('[DiscoverV2] Scrolling back to story segment', nextArc, 'at', targetScroll);
                          window.scrollTo({
                            top: targetScroll,
                            behavior: 'smooth',
                          });
                        }
                      }, 800); // Пауза чтобы пользователь увидел всё
                    });
                  });
                });
              }, animationDuration + 200); // +200ms запас после анимации
            }, 500);
          }

        } catch (err) {
          console.error('[DiscoverV2] Error generating story continuation:', err);
          setError(err instanceof Error ? err.message : 'Ошибка генерации истории');
          setIsGenerating(false);
          chatManagerRef.current?.setTyping(null);
        }
      }, 800);
    }, 350); // Задержка для анимации скрытия кнопок

  }, [
    currentArc,
    storyMeta,
    storyContract,
    effectiveClaudeKey,
    effectiveClaudeProxyUrl,
    effectiveOpenAIKey,
    effectiveOpenAIProxyUrl,
  ]);

  // ============================================================================
  // VOICE RECORDING FUNCTIONS
  // ============================================================================

  const cleanupCustomOptionResources = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (error) {
          console.warn('[DiscoverV2] Failed to stop recorder during cleanup', error);
        }
      }
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (error) {
          console.warn('[DiscoverV2] Failed to stop media track', error);
        }
      });
      mediaStreamRef.current = null;
    }
    if (recordingAnimationFrameRef.current !== null) {
      cancelAnimationFrame(recordingAnimationFrameRef.current);
      recordingAnimationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (error) {
        console.warn('[DiscoverV2] Failed to close audio context', error);
      }
      audioContextRef.current = null;
    }
    audioAnalyserRef.current = null;
    analyserDataRef.current = null;
  }, []);

  const cancelCustomOptionProcessing = useCallback(() => {
    if (customOptionAbortControllerRef.current) {
      customOptionAbortControllerRef.current.abort();
      customOptionAbortControllerRef.current = null;
    }
  }, []);

  const processRecordedCustomOption = useCallback(async () => {
    const chunks = [...audioChunksRef.current];
    audioChunksRef.current = [];

    if (chunks.length === 0) {
      setCustomOption(prev => ({
        status: 'error',
        option: prev.option && prev.status === 'ready' ? prev.option : null,
        transcript: undefined,
        error: 'Кажется, запись получилась пустой. Попробуй ещё раз.',
      }));
      return;
    }

    cleanupCustomOptionResources();

    const audioBlob = new Blob(chunks, { type: 'audio/webm' });
    const controller = new AbortController();
    customOptionAbortControllerRef.current = controller;

    setCustomOption(prev => ({
      status: 'transcribing',
      option: prev.option && prev.status === 'ready' ? prev.option : null,
      transcript: undefined,
      error: undefined,
    }));

    try {
      const transcript = await transcribeAudioBlob(audioBlob, {
        openAIApiKey: effectiveOpenAIKey || undefined,
        openAIProxyUrl: effectiveOpenAIProxyUrl || undefined,
        language: 'ru',
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      setCustomOption(prev => ({
        status: 'generating',
        option: prev.option && prev.status === 'ready' ? prev.option : null,
        transcript,
        error: undefined,
      }));

      const arcSegments = storySegmentsRef.current.map((segment, index) => ({
        text: segment.text,
        arc: segment.arc ?? index + 1,
        optionTitle: segment.optionTitle,
        optionDescription: segment.optionDescription,
      }));

      const activeAuthorStyle = {
        name: storyMeta?.author || 'История',
        stylePrompt: 'Пиши простым, современным языком. Используй короткие предложения. Избегай штампов.',
        genre: storyMeta?.genre || 'психологическая драма',
      };

      const customOptionResult = await generateCustomHistoryOption({
        transcript,
        segments: arcSegments,
        summary: undefined,
        author: activeAuthorStyle,
        signal: controller.signal,
        claudeApiKey: effectiveClaudeKey || undefined,
        claudeProxyUrl: effectiveClaudeProxyUrl || undefined,
        openAIApiKey: effectiveOpenAIKey || undefined,
        openAIProxyUrl: effectiveOpenAIProxyUrl || undefined,
      });

      if (controller.signal.aborted) {
        return;
      }

      setCustomOption({
        status: 'ready',
        option: customOptionResult,
        transcript,
        error: undefined,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        console.warn('[DiscoverV2] Custom option processing aborted');
        return;
      }
      console.error('[DiscoverV2] Failed to process custom option', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Не удалось обработать запись. Попробуй ещё раз.';
      setCustomOption({
        status: 'error',
        option: null,
        transcript: undefined,
        error: message,
      });
    } finally {
      if (customOptionAbortControllerRef.current === controller) {
        customOptionAbortControllerRef.current = null;
      }
    }
  }, [
    cleanupCustomOptionResources,
    effectiveClaudeKey,
    effectiveClaudeProxyUrl,
    effectiveOpenAIKey,
    effectiveOpenAIProxyUrl,
    storyMeta,
  ]);

  const stopCustomRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.stop();
      } catch (error) {
        console.error('[DiscoverV2] Failed to stop recording', error);
        cleanupCustomOptionResources();
        setCustomOption(prev => ({
          status: 'error',
          option: prev.option && prev.status === 'ready' ? prev.option : null,
          transcript: undefined,
          error: 'Не получилось остановить запись. Попробуй снова.',
        }));
      }
    }
  }, [cleanupCustomOptionResources]);

  const startRecordingLevelMonitor = useCallback(async (stream: MediaStream) => {
    try {
      const AudioContextClass: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      const audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
        } catch (error) {
          console.warn('[DiscoverV2] Failed to resume audio context', error);
        }
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      audioContextRef.current = audioContext;
      audioAnalyserRef.current = analyser;
      analyserDataRef.current = dataArray;

      const updateLevel = () => {
        if (!audioAnalyserRef.current || !analyserDataRef.current) {
          return;
        }

        audioAnalyserRef.current.getByteTimeDomainData(analyserDataRef.current);
        let sumSquares = 0;
        for (let index = 0; index < analyserDataRef.current.length; index += 1) {
          const deviation = analyserDataRef.current[index] - 128;
          sumSquares += deviation * deviation;
        }
        const rms = Math.sqrt(sumSquares / analyserDataRef.current.length) / 128;
        const normalized = Math.min(1, rms * 2.4);

        setCustomRecordingLevel(prev => prev * 0.55 + normalized * 0.45);

        recordingAnimationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      recordingAnimationFrameRef.current = requestAnimationFrame(updateLevel);
    } catch (error) {
      console.warn('[DiscoverV2] Failed to initialize audio analyser', error);
    }
  }, []);

  const startCustomRecording = useCallback(async () => {
    const activeRecorder = mediaRecorderRef.current;
    if (activeRecorder && activeRecorder.state === 'recording') {
      stopCustomRecording();
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCustomOption(prev => ({
        status: 'error',
        option: prev.status === 'ready' ? prev.option : null,
        transcript: undefined,
        error: 'Браузер не поддерживает запись звука.',
      }));
      return;
    }

    cancelCustomOptionProcessing();
    cleanupCustomOptionResources();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
        },
      });

      let recorder: MediaRecorder | null = null;
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ];

      for (const candidate of candidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidate)) {
          try {
            recorder = new MediaRecorder(stream, { mimeType: candidate });
            break;
          } catch {
            recorder = null;
          }
        }
      }

      if (!recorder) {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      recorder.addEventListener('dataavailable', event => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        cleanupCustomOptionResources();
        void processRecordedCustomOption();
      });

      setCustomOption(prev => ({
        status: 'recording',
        option: prev.option && prev.status === 'ready' ? prev.option : null,
        transcript: undefined,
        error: undefined,
      }));

      void startRecordingLevelMonitor(stream);

      recorder.start();
    } catch (error) {
      console.error('[DiscoverV2] Failed to start recording', error);
      cleanupCustomOptionResources();
      setCustomOption(prev => ({
        status: 'error',
        option: prev.option && prev.status === 'ready' ? prev.option : null,
        transcript: undefined,
        error: error instanceof Error
          ? error.message
          : 'Не удалось получить доступ к микрофону. Проверь настройки и попробуй снова.',
      }));
    }
  }, [
    cancelCustomOptionProcessing,
    cleanupCustomOptionResources,
    processRecordedCustomOption,
    stopCustomRecording,
    startRecordingLevelMonitor,
  ]);

  // ============================================================================
  // CUSTOM OPTION UI LOGIC (from ModernNastiaApp)
  // ============================================================================

  const customOptionStatus = customOption.status;
  const customOptionReady = customOption.option;

  const handleCustomOptionClick = useCallback(() => {
    if (customOptionStatus === 'recording') {
      stopCustomRecording();
      return;
    }

    if (customOptionStatus === 'ready' && customOptionReady && !isGenerating) {
      handleChoiceSelect(customOptionReady);
      return;
    }

    if (customOptionStatus === 'transcribing' || customOptionStatus === 'generating') {
      return;
    }

    void startCustomRecording();
  }, [
    customOptionReady,
    customOptionStatus,
    handleChoiceSelect,
    isGenerating,
    startCustomRecording,
    stopCustomRecording,
  ]);

  // Автоскролл при изменении состояния кнопки своего варианта
  useEffect(() => {
    if (!customOptionStatus) {
      return;
    }

    console.log('[AutoScroll CUSTOM OPTION] Status changed to:', customOptionStatus);

    // Используем тройной requestAnimationFrame для гарантированного ожидания рендера после изменения высоты кнопки
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Скроллим весь window до конца страницы
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
          });
          console.log('[AutoScroll CUSTOM OPTION] ✅ Scrolled to BOTTOM after status change');
        });
      });
    });
  }, [customOptionStatus]);

  const handleFinaleInterpretationToggle = useCallback((mode: 'human' | 'astrological') => {
    setFinaleInterpretationMode(mode);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelCustomOptionProcessing();
      cleanupCustomOptionResources();
    };
  }, [cancelCustomOptionProcessing, cleanupCustomOptionResources]);

  // Reset recording level when not recording
  useEffect(() => {
    if (customOption.status !== 'recording') {
      setCustomRecordingLevel(0);
    }
  }, [customOption.status]);

  // ============================================================================
  // RESET
  // ============================================================================

  const resetDiscover = useCallback(() => {
    // Очистка таймеров
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];

    // Очистка голосового ввода
    cancelCustomOptionProcessing();
    cleanupCustomOptionResources();

    chatManagerRef.current?.clearMessages();
    setIsStarted(false);
    setIsGenerating(false);
    setError(null);
    setStoryMeta(null);
    setCurrentArc(1);
    setStoryContract(null);
    setFinaleInterpretations(null);
    setFinaleInterpretationMode('human');
    setCustomOption({ status: 'idle', option: null });
    setCustomRecordingLevel(0);
    storySegmentsRef.current = [];
    currentChoicesRef.current = [];
    setHasChoices(false); // Hide custom button on reset

    // Очистка refs для синхронизации AI и диалога
    aiResultRef.current = null;
    stopDialogueAfterCurrentRef.current = false;
    dialogueStartedRef.current = false;

    // Очистка сохраненного состояния
    clearDiscoverTabState();
    console.log('[DiscoverV2] State cleared from storage');
  }, [cancelCustomOptionProcessing, cleanupCustomOptionResources]);

  // Обновляем refs при изменении props (для актуальности в callback'ах)
  useEffect(() => {
    personalizedMessagesRef.current = personalizedPlanetMessages;
    isLoadingRef.current = isLoadingPersonalizedMessages;
  }, [personalizedPlanetMessages, isLoadingPersonalizedMessages]);

  // Анимация появления элементов idle экрана
  useEffect(() => {
    if (isStarted) {
      setVisibleElements([]);
      return;
    }

    // Сбрасываем и запускаем анимацию
    setVisibleElements([]);
    const elementsToAnimate = ['icon', 'prompt', 'description', 'button'];
    const timers = elementsToAnimate.map((elementId, index) =>
      window.setTimeout(() => {
        setVisibleElements(prev => prev.includes(elementId) ? prev : [...prev, elementId]);
      }, 100 * index + 50)
    );

    return () => {
      timers.forEach(t => window.clearTimeout(t));
    };
  }, [isStarted]);

  // Cleanup при unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={styles.historyChatContainer}>
      {/* Idle screen - кнопка запуска */}
      {!isStarted && (
        <div className={styles.historyStartScreen}>
          <div className={`${styles.historyStartIconContainer} ${styles.calendarElementAnimated} ${visibleElements.includes('icon') ? styles.calendarElementVisible : ''}`}>
            <div className={styles.historyStartIcon}>✨</div>
          </div>
          <div>
            <div className={`${styles.historyStartPrompt} ${styles.calendarElementAnimated} ${visibleElements.includes('prompt') ? styles.calendarElementVisible : ''}`}>
              {startPrompt}
            </div>
            <div className={`${styles.historyStartDescription} ${styles.calendarElementAnimated} ${visibleElements.includes('description') ? styles.calendarElementVisible : ''}`}>
              {startDescription}
            </div>
          </div>
          <button
            type="button"
            className={`${styles.historyStartButton} ${styles.calendarElementAnimated} ${visibleElements.includes('button') ? styles.calendarElementVisible : ''}`}
            onClick={startPlanetDialogue}
            disabled={!hasAiCredentials}
          >
            {hasAiCredentials ? startButton : 'Настройте API ключи'}
          </button>
        </div>
      )}

      {/* Dialogue/Story screen - ChatManager */}
      {isStarted && (
        <>
          {/* Заголовок с кнопкой закрытия */}
          <div className={styles.historyStoryHeader}>
            <h2 className={styles.historyStoryTitle}>
              История
            </h2>
            <button
              type="button"
              className={styles.historyCloseButton}
              onClick={resetDiscover}
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>

          {/* ChatManager - единый компонент для всех сообщений (уже содержит нужную обёртку) */}
          <ChatManager
            ref={chatManagerRef}
            onMessagesChange={handleMessagesChange}
            onChoiceSelect={handleChoiceSelect}
            onCustomOptionClick={handleCustomOptionClick}
            isActive={true}
            storyTitle="История"
            customOption={customOption.option || undefined}
            customStatus={customOption.status}
            recordingLevel={customRecordingLevel}
          />

          {/* Finale interpretations block */}
          {finaleInterpretations && !isGenerating && (
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
                {finaleInterpretationMode === 'human' ? finaleInterpretations.human : finaleInterpretations.astrological}
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className={styles.historyStoryError}>
              <span>{error}</span>
              <button
                type="button"
                className={styles.historyStoryRetry}
                onClick={retryCurrentAction}
                disabled={isGenerating}
              >
                Попробовать снова
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
