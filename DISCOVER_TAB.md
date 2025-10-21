# Discover Tab ("Узнай себя") - Полная документация

**Дата создания**: 2025-10-22
**Версия компонента**: v2 (DiscoverTabV2)
**Статус**: ✅ Работает корректно

Полная документация по вкладке "Узнай себя" - интерактивной истории с психологическими контрактами, астрологическим анализом и voice recording.

---

## Содержание

- [Обзор](#обзор)
- [Архитектура](#архитектура)
- [Жизненный цикл](#жизненный-цикл)
  - [Idle Screen](#idle-screen)
  - [Planet Dialogue](#planet-dialogue)
  - [Interactive Story](#interactive-story)
  - [Finale](#finale)
- [Planet Dialogue Mechanism](#planet-dialogue-mechanism)
- [Interactive Story Generation](#interactive-story-generation)
- [Reveal Scroll Mechanism](#reveal-scroll-mechanism)
- [Auto-scroll](#auto-scroll)
- [Voice Recording](#voice-recording)
- [Props & API](#props--api)
- [UI Components](#ui-components)
- [Стили](#стили)
- [Тестирование](#тестирование)
- [Важные правила](#важные-правила)
- [История изменений](#история-изменений)

---

## Обзор

### Назначение

Вкладка "Узнай себя" - это **интерактивная психологическая игра** с элементами астрологии:

1. Пользователь запускает историю
2. Видит анимированный диалог планет (персонализированный под натальную карту)
3. Проходит интерактивную историю с выборами (7 сегментов)
4. Получает финальную интерпретацию выборов (психологическую + астрологическую)

### Версия v2 vs v1

**DiscoverTabV2** - новая версия с централизованным управлением:

| Аспект | v1 (старая) | v2 (новая) |
|--------|-------------|------------|
| **Управление чатом** | Разрозненный state | Централизованный ChatManager |
| **Автоскролл** | Множественные useEffect | Единый useChatScroll hook |
| **Voice recording** | State в компоненте | Props-based через ChatManager |
| **Код** | ~2000 строк, сложная логика | 1353 строки, чистая архитектура |

**URL для тестирования**:
- v2 (новая): `http://localhost:3000/nastia-calendar?newDiscover=true`
- v1 (старая): `http://localhost:3000/nastia-calendar`

### Связанная документация

- [VOICE_RECORDING.md](VOICE_RECORDING.md) - Документация по кнопке "Свой вариант"
- [AUTOSCROLL_FIX.md](AUTOSCROLL_FIX.md) - Детали автоскролла
- [TECHNICAL_DOCS.md](TECHNICAL_DOCS.md) - Общая техническая документация
- [CLAUDE.md](CLAUDE.md) - Обзор всего проекта

---

## Архитектура

### Структура компонентов

```
App.tsx
  ↓
ModernNastiaApp.tsx (tab switcher)
  ↓
DiscoverTabV2.tsx (state owner)
  ↓
ChatManager.tsx (chat controller)
  ↓
ChatChoices.tsx (buttons UI)
```

### State Management

**В DiscoverTabV2 (state owner)**:

```typescript
// Основной state
const [isStarted, setIsStarted] = useState(false);           // Начали ли историю
const [isGenerating, setIsGenerating] = useState(false);     // AI генерирует контент
const [error, setError] = useState<string | null>(null);     // Ошибки
const [storyMeta, setStoryMeta] = useState<HistoryStoryMeta | null>(null); // Метаданные истории
const [currentArc, setCurrentArc] = useState(1);             // Текущий сегмент (1-7)
const [storyContract, setStoryContract] = useState<string | null>(null); // Психо-контракт

// Finale state
const [finaleInterpretations, setFinaleInterpretations] = useState<{
  human: string;
  astrological: string;
} | null>(null);
const [finaleInterpretationMode, setFinaleInterpretationMode] = useState<'human' | 'astrological'>('human');

// Voice recording state (см. VOICE_RECORDING.md)
const [customOption, setCustomOption] = useState<{
  status: CustomOptionStatus;
  option: HistoryStoryOption | null;
  transcript?: string;
  error?: string;
}>({ status: 'idle', option: null });
const [customRecordingLevel, setCustomRecordingLevel] = useState(0);

// Idle screen
const [startPrompt] = useState(() => random(HISTORY_START_PROMPTS));
const [startButton] = useState(() => random(HISTORY_START_BUTTONS));
const [startDescription] = useState(() => random(HISTORY_START_DESCRIPTIONS));
const [visibleElements, setVisibleElements] = useState<string[]>([]);
```

### Refs для асинхронных операций

```typescript
// ChatManager ref
const chatManagerRef = useRef<ChatManagerHandle>(null);

// Таймеры
const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

// Props refs (для callbacks)
const personalizedMessagesRef = useRef(personalizedPlanetMessages);
const isLoadingRef = useRef(isLoadingPersonalizedMessages);

// AI generation refs
const aiResultRef = useRef<any>(null);                    // Результат AI генерации
const stopDialogueAfterCurrentRef = useRef<boolean>(false); // Флаг остановки диалога
const dialogueStartedRef = useRef<boolean>(false);        // Диалог запущен

// Story refs
const storySegmentsRef = useRef<StorySegment[]>([]);      // История сегментов
const currentChoicesRef = useRef<HistoryStoryOption[]>([]); // Текущие choices

// Voice recording refs (см. VOICE_RECORDING.md)
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const mediaStreamRef = useRef<MediaStream | null>(null);
const audioChunksRef = useRef<Blob[]>([]);
const audioContextRef = useRef<AudioContext | null>(null);
const audioAnalyserRef = useRef<AnalyserNode | null>(null);
const analyserDataRef = useRef<Uint8Array | null>(null);
const recordingAnimationFrameRef = useRef<number | null>(null);
const customOptionAbortControllerRef = useRef<AbortController | null>(null);
```

---

## Жизненный цикл

Вкладка проходит через 4 основные фазы:

```
Idle Screen
    ↓ [клик "Начать историю"]
Planet Dialogue (диалог планет показывается пока грузится AI)
    ↓ [AI сгенерировал первый сегмент]
Interactive Story (arcs 1-7, пользователь делает выборы)
    ↓ [arc 7 → finale mode]
Finale (интерпретация выборов: human + astrological)
    ↓ [клик "✕" → reset]
Idle Screen
```

---

### Idle Screen

**Цель**: Презентация функциональности + кнопка запуска

**UI элементы** (появляются последовательно с задержкой 100ms):
1. **Иконка**: ✨ (анимированная)
2. **Промпт**: Рандомный из `HISTORY_START_PROMPTS[]`
3. **Описание**: Рандомное из `HISTORY_START_DESCRIPTIONS[]`
4. **Кнопка**: Рандомный текст из `HISTORY_START_BUTTONS[]`

**Примеры промптов**:
- "Давай проверим, насколько ты правдива с собой сегодня"
- "Готова разобрать себя на части? Звёзды уже наточили скальпель"
- "Что если астрология знает о тебе больше, чем ты думаешь?"

**Анимация появления**:
```typescript
// useEffect при монтировании isStarted=false
useEffect(() => {
  if (isStarted) return;

  setVisibleElements([]);
  const elementsToAnimate = ['icon', 'prompt', 'description', 'button'];
  const timers = elementsToAnimate.map((elementId, index) =>
    window.setTimeout(() => {
      setVisibleElements(prev => [...prev, elementId]);
    }, 100 * index + 50)
  );

  return () => timers.forEach(t => clearTimeout(t));
}, [isStarted]);
```

**Состояние кнопки**:
- **Активна**: если `hasAiCredentials` (API ключи настроены)
- **Неактивна**: текст "Настройте API ключи"

**При клике на кнопку** → `startPlanetDialogue()`

---

### Planet Dialogue

**Цель**: Развлечь пользователя анимированным диалогом планет **пока AI генерирует историю** (может занять 10-30 секунд)

**Фазы Planet Dialogue**:

#### 1. Очистка и инициализация (0-100ms)
```typescript
setIsGenerating(true);
setIsStarted(true);
chatManagerRef.current?.clearMessages();
chatManagerRef.current?.setPhase('dialogue');
```

#### 2. Первое сообщение Луны (150ms)
```
🌙 Луна: "Так, коллеги, собираемся! Сейчас обсудим, какую историю для Насти придумать..."
```

#### 3. "Подключение" планет (600-4800ms)
Планеты "подключаются" с характерными задержками:

| Планета | Задержка | Характер |
|---------|----------|----------|
| Меркурий | 600ms | Самый быстрый |
| Марс | 900ms | Решительный |
| Венера | 1300ms | Легкая, не спешит |
| Уран | 1500ms | Непредсказуемый |
| Плутон | 2200ms | Тяжеловесный |
| Юпитер | 2700ms | Философский |
| Сатурн | 3300ms | Размеренный |
| Хирон | 4000ms | Задумчивый |
| Нептун | 4800ms | Самый медленный |

**Системное сообщение**:
```
⚡ Меркурий подключился к чату...
```

#### 4. Диалог планет (персонализированный)

**Источник**: `personalizedPlanetMessages` (загружаются фоном в ModernNastiaApp)

**Логика**:
- Если **personalizedPlanetMessages** доступны → показываем их по одному с паузами
- Если **загружаются** (isLoadingPersonalizedMessages=true) → ждём
- Если **нет** → graceful degradation (показываем только "подключение")

**Паузы между сообщениями**:
```typescript
const pauseBefore = calculatePauseBefore(message);  // Пауза ДО печатания
const typingDuration = calculateTypingDuration(message); // Время "печатания"
const pauseAfter = calculatePauseAfter(message);    // Пауза ПОСЛЕ
```

**Polling для AI результата**:
```typescript
// Каждые 500ms проверяем: готов ли результат AI?
const pollResult = () => {
  if (aiResultRef.current) {
    stopDialogueAfterCurrentRef.current = true; // Останавливаем диалог
    // Показываем результат после текущего сообщения
  } else {
    setTimeout(pollResult, 500); // Проверяем снова
  }
};
```

#### 5. Переход к истории

Когда AI результат готов И текущее сообщение завершено:
- Скрываем typing indicator
- Переключаем фазу: `chatManagerRef.current?.setPhase('story')`
- Добавляем сообщение Луны с первым сегментом истории
- Показываем кнопки выбора + reveal scroll

---

### Interactive Story

**Цель**: Пользователь проходит через интерактивную историю, делая выборы

**Параметры**:
- **Arc limit**: 7 (7 сегментов до финала)
- **Current arc**: 1-7 (текущий сегмент)
- **Story contract**: Психологический контракт для поддержания темы

**Структура сегмента**:
```typescript
interface StorySegment {
  text: string;              // Текст сегмента (scene)
  arc: number;               // Номер сегмента (1-7)
  optionTitle?: string;      // Title выбранной опции
  optionDescription?: string; // Description выбранной опции
}
```

**Поток взаимодействия**:

#### 1. Показ сегмента
```
🌙 Луна: [текст сегмента истории]

[Кнопки выбора 1-4]
[Кнопка "Свой вариант" 🎙️]
```

**Reveal scroll**: Анимация показа всех кнопок → откат к началу сообщения Луны

#### 2. Выбор пользователя

Клик на опцию → `handleChoiceSelect(choice)`

```typescript
// 1. Скрываем кнопки
currentChoicesRef.current = [];
chatManagerRef.current?.setChoices([]);

// 2. Добавляем user message (350ms delay)
chatManagerRef.current?.addMessage({
  type: 'user',
  author: 'Настя',
  content: choice.description || choice.title,
});

// 3. Typing indicator (800ms delay)
chatManagerRef.current?.setTyping('История');

// 4. AI генерация следующего сегмента
const result = await generateHistoryStoryChunk({
  segments: storySegmentsRef.current.slice(-4), // Последние 4 для контекста
  currentChoice: choice,
  mode: isFinaleTime ? 'finale' : 'arc',
  currentArc: nextArc,
  contract: storyContract,
  // ... AI keys
});

// 5. Показываем результат
chatManagerRef.current?.addMessage({
  type: 'story',
  author: 'История',
  content: result.node.scene,
});

// 6. Сохраняем сегмент
storySegmentsRef.current.push({
  text: result.node.scene,
  arc: nextArc,
  optionTitle: choice.title,
  optionDescription: choice.description,
});

// 7. Новые кнопки + reveal scroll
chatManagerRef.current?.setChoices(result.options);
```

#### 3. Повторение до arc 7

**Arc 1-6**: обычные сегменты с выборами
**Arc 7**: последний выбор → переход к финалу

---

### Finale

**Триггер**: `currentArc > arcLimit` (arc 8)

**Генерация**:
```typescript
const result = await generateHistoryStoryChunk({
  // ...
  mode: 'finale', // ← Важно!
  currentArc: 8,
});

// result.finale содержит:
// - resolution: финальный текст истории
// - humanInterpretation: психологическая интерпретация выборов
// - astrologicalInterpretation: астрологическая интерпретация
```

**UI**:
```
🌙 Луна: [resolution - финал истории]

┌─────────────────────────────────────────┐
│ 📊 Что мы о тебе узнали                 │
│                                          │
│ [На человеческом] [На астрологическом]  │ ← Toggle buttons
│                                          │
│ [humanInterpretation ИЛИ                │
│  astrologicalInterpretation]            │
└─────────────────────────────────────────┘
```

**State**:
```typescript
setFinaleInterpretations({
  human: result.finale.humanInterpretation,
  astrological: result.finale.astrologicalInterpretation,
});
setFinaleInterpretationMode('human'); // По умолчанию
```

**Переключение режимов**:
```typescript
const handleFinaleInterpretationToggle = (mode: 'human' | 'astrological') => {
  setFinaleInterpretationMode(mode);
};
```

**Reveal scroll**: Анимация показа финального блока → откат к началу finale story message

---

## Planet Dialogue Mechanism

### Персонализированные сообщения планет

**Источник**: `personalizedPlanetMessages` prop (загружается в ModernNastiaApp фоном)

**Структура**:
```typescript
interface PersonalizedPlanetMessages {
  dialogue: Array<{
    planet: string;    // Название планеты (например, "Меркурий")
    message: string;   // Текст сообщения
  }>;
  timestamp: number;   // Timestamp генерации
}
```

**Генерация** (в ModernNastiaApp):
- При монтировании приложения
- Если натальная карта настроена
- Кэширование в localStorage (24 часа)
- Использует AI с astro context

**Пример диалога**:
```
🌙 Луна: "Давайте посмотрим на её Солнце в Раке — домашняя, эмоциональная..."

☿ Меркурий: "А Меркурий у неё в Близнецах — быстрая, любознательная. Интересная комбинация!"

♀ Венера: "Не забудьте про Венеру в Льве — она любит, когда её ценят!"

...
```

### Анимация диалога

**Timing планет** (lines 234-257):
```typescript
const planetsWithDelays = [
  { planet: 'Меркурий', delay: 600 },
  { planet: 'Марс', delay: 900 },
  { planet: 'Венера', delay: 1300 },
  // ... всего 9 планет
];

planetsWithDelays.forEach(({ planet, delay }) => {
  setTimeout(() => {
    chatManagerRef.current?.addMessage({
      type: 'system',
      author: planet,
      content: 'подключился к чату...',
    });
  }, delay);
});
```

### Показ персонализированных сообщений

**Логика** (lines 262-394):
```typescript
const runDialogue = (messages: Array<{ planet: string; message: string }>) => {
  let cumulativeDelay = 5500; // Начинаем после подключения всех планет

  messages.forEach((msg, index) => {
    const pauseBefore = calculatePauseBefore(msg.message);
    const typingDuration = calculateTypingDuration(msg.message);
    const pauseAfter = calculatePauseAfter(msg.message);

    cumulativeDelay += pauseBefore;

    setTimeout(() => {
      // Typing indicator
      chatManagerRef.current?.setTyping(msg.planet);
    }, cumulativeDelay);

    cumulativeDelay += typingDuration;

    setTimeout(() => {
      // Сообщение
      chatManagerRef.current?.addMessage({
        type: 'planet',
        author: msg.planet,
        content: msg.message,
      });
      chatManagerRef.current?.setTyping(null);

      // Проверка: нужно ли остановить диалог?
      if (stopDialogueAfterCurrentRef.current) {
        showAIResult(); // Показываем историю
      } else if (index < messages.length - 1) {
        // Продолжаем диалог
      } else {
        // Диалог закончен, но AI ещё не готов → polling
        pollForResult();
      }
    }, cumulativeDelay);

    cumulativeDelay += pauseAfter;
  });
};
```

### Polling для AI результата

**Зачем**: Диалог может закончиться раньше чем AI сгенерирует историю

```typescript
const pollForResult = () => {
  if (aiResultRef.current) {
    showAIResult();
  } else {
    setTimeout(pollForResult, 500); // Проверяем каждые 500ms
  }
};
```

### Graceful degradation

**Если personalizedPlanetMessages нет**:
- Показываем только "подключение" планет
- Сразу начинаем polling для AI результата
- Пользователь видит список планет → история появляется когда готова

---

## Interactive Story Generation

### AI генерация сегментов

**Функция**: `generateHistoryStoryChunk()` из [src/utils/historyStory.ts](src/utils/historyStory.ts)

**Входные параметры**:
```typescript
{
  segments: StorySegment[],           // Предыдущие сегменты (контекст)
  currentChoice?: HistoryStoryOption, // Выбор пользователя
  summary?: string,                   // Summary истории
  author: {                           // Автор истории
    name: string,
    stylePrompt: string,
    genre: string,
  },
  arcLimit: number,                   // Лимит сегментов (7)
  mode: 'arc' | 'finale',             // Режим генерации
  currentArc: number,                 // Текущий arc (1-7)
  contract?: string,                  // Психологический контракт
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  openAIProxyUrl?: string,
}
```

**Выходные данные** (mode='arc'):
```typescript
{
  node: {
    scene: string,              // Текст сегмента истории
  },
  options: HistoryStoryOption[], // Варианты выбора (обычно 3-4)
  contract?: string,            // Психо-контракт (если новый)
}
```

**Выходные данные** (mode='finale'):
```typescript
{
  finale: {
    resolution: string,                 // Финальный текст истории
    humanInterpretation: string,        // Психологическая интерпретация
    astrologicalInterpretation: string, // Астрологическая интерпретация
  }
}
```

### Психологические контракты

**Цель**: Избегать повторения тем в разных историях

**Хранение**: `NastiaData.psychContractHistory` (localStorage)

**Структура**:
```typescript
interface PsychContractHistory {
  contracts: string[];          // Использованные контракты (макс 10)
  scenarios: string[];          // Использованные сценарии (макс 30)
  contractScenarios: Record<string, string[]>; // Сценарии по контрактам (макс 5/контракт)
}
```

**Логика**:
1. При генерации первого сегмента AI выбирает контракт
2. Контракт сохраняется в `storyContract`
3. Все последующие сегменты используют тот же контракт
4. После финала контракт добавляется в историю

**Примеры контрактов**:
- "Поиск себя через отношения"
- "Карьера vs личная жизнь"
- "Преодоление страхов"

**См.**: [src/data/psychologicalContracts.ts](src/data/psychologicalContracts.ts)

### Контекст для AI

**Сегменты истории**:
```typescript
const recentSegments = storySegmentsRef.current.slice(-4); // Последние 4
```

**Почему не все?**
- Промпт становится слишком длинным
- 4 сегмента (~1000-2000 токенов) достаточно для контекста
- Более старые сегменты влияют слабо

**Модель**: `claude-haiku-4.5` (primary), OpenAI (fallback)

---

## Reveal Scroll Mechanism

**Цель**: Красивая анимация появления кнопок с показом всего контента и откатом

### Зачем нужен?

Проблема: Кнопки появляются постепенно (500ms/кнопка). Если их много, пользователь не видит последние кнопки без скролла.

**Решение**:
1. **Показать всё**: Скроллим вниз после появления ВСЕХ кнопок
2. **Откатить**: Через 800ms откатываем к началу сообщения (чтобы пользователь прочитал)
3. **Профит**: Пользователь видит что есть кнопки → скроллит вниз сам когда готов

### Алгоритм

**Для первого сегмента** (arc 1, lines 457-504):
```typescript
const expectedButtonCount = options.length + 1; // +1 для "Свой вариант"
const animationDuration = expectedButtonCount * 500; // 500ms/кнопка

setTimeout(() => {
  // Шаг 1: Скролл вниз (показать всё)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'smooth',
        });

        // Шаг 2: Откат к началу moon message (через 800ms)
        setTimeout(() => {
          const moonMessage = document.querySelector('[data-message-type="moon"]');
          if (moonMessage) {
            const rect = moonMessage.getBoundingClientRect();
            const currentScroll = window.pageYOffset;
            const moonTop = rect.top + currentScroll;
            const headerHeight = 60;
            const targetScroll = moonTop - headerHeight;

            window.scrollTo({
              top: targetScroll,
              behavior: 'smooth',
            });
          }
        }, 800);
      });
    });
  });
}, animationDuration + 200); // Ждём окончания анимации кнопок
```

**Для сегментов 2-7** (lines 718-762):
- Аналогично, но откатываем к последнему `[data-message-type="story"]`

**Для finale** (lines 643-680):
- Откатываем к последнему finale story message

### Почему triple RAF?

```typescript
requestAnimationFrame(() => {       // 1. Следующий frame
  requestAnimationFrame(() => {     // 2. Ещё один frame
    requestAnimationFrame(() => {   // 3. Гарантия рендера
      window.scrollTo(...);
    });
  });
});
```

**Причина**: Гарантировать что DOM элементы (кнопки, сообщения) полностью отрендерены перед скроллом.

**См.**: [AUTOSCROLL_FIX.md](AUTOSCROLL_FIX.md) для деталей

### ⚠️ ВАЖНО: window.scrollTo, НЕ container

```typescript
// ✅ ПРАВИЛЬНО
window.scrollTo({ top: ..., behavior: 'smooth' });

// ❌ НЕПРАВИЛЬНО
container.scrollTo({ top: ..., behavior: 'smooth' });
```

**Причина**: `.historyChatContainer` НЕ имеет `overflow: scroll`, скроллится весь `window`.

---

## Auto-scroll

**Цель**: Автоматически скроллить вниз при появлении новых сообщений

**Триггер**: `handleMessagesChange()` callback от ChatManager

**Реализация** (lines 167-181):
```typescript
const handleMessagesChange = useCallback(() => {
  // Triple RAF для гарантии рендера
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'smooth',
        });
      });
    });
  });
}, []);
```

**Передача в ChatManager**:
```typescript
<ChatManager
  onMessagesChange={handleMessagesChange}
  // ...
/>
```

**Когда срабатывает**:
- Добавление нового сообщения (`addMessage`)
- Добавление нескольких сообщений (`addMessages`)

**Padding-bottom учёт**:
- `.historyChatContainer` имеет `padding-bottom: 16px`
- Это создает отступ от glass tab bar внизу
- `scrollHeight` автоматически учитывает padding

**См.**: [AUTOSCROLL_FIX.md](AUTOSCROLL_FIX.md) для полной информации

---

## Voice Recording

**Кнопка "Свой вариант"** - позволяет записать голосом свой вариант продолжения истории.

### Краткий обзор

1. **Запись**: MediaRecorder API с audio level visualization
2. **Транскрипция**: OpenAI Whisper API
3. **AI генерация**: Claude/OpenAI создают title + description
4. **Выбор**: Готовый вариант становится кнопкой

### Интеграция в DiscoverTabV2

**Props flow** (props-based architecture):
```typescript
<ChatManager
  customOption={customOption.option || undefined}
  customStatus={customOption.status}
  recordingLevel={customRecordingLevel}
  onCustomOptionClick={handleCustomOptionClick}
  // ...
/>
```

**⚠️ ВАЖНО**: State хранится в DiscoverTabV2, передается через props → ChatManager → ChatChoices

**НЕ используйте** `setChoices()` для обновления custom button state - это создает бесконечный цикл!

### Полная документация

**См.**: [VOICE_RECORDING.md](VOICE_RECORDING.md) для:
- Архитектуры
- Всех состояний (idle/recording/transcribing/generating/ready/error)
- API интеграции (MediaRecorder, Whisper, AI)
- Визуализации audio level
- Troubleshooting бесконечного цикла

---

## Props & API

### Props (DiscoverTabV2)

```typescript
interface DiscoverTabV2Props {
  // AI credentials
  hasAiCredentials: boolean;                              // Есть ли API ключи
  effectiveClaudeKey: string | null | undefined;         // Claude API key
  effectiveClaudeProxyUrl: string | null | undefined;    // Claude proxy URL
  effectiveOpenAIKey: string | null | undefined;         // OpenAI API key
  effectiveOpenAIProxyUrl: string | null | undefined;    // OpenAI proxy URL

  // Персонализированные сообщения планет
  personalizedPlanetMessages: PersonalizedPlanetMessages | null;
  isLoadingPersonalizedMessages: boolean;

  // Callbacks
  onNewStoryMessage?: () => void;                        // Badge update при новом сообщении
}
```

### ChatManager ref methods

```typescript
chatManagerRef.current?.addMessage(message);              // Добавить одно сообщение
chatManagerRef.current?.addMessages(messages);            // Добавить несколько
chatManagerRef.current?.setTyping(author | null);         // Typing indicator
chatManagerRef.current?.setPhase(phase);                  // Сменить фазу
chatManagerRef.current?.clearMessages();                  // Очистить чат
chatManagerRef.current?.setChoices(choices);              // Установить кнопки
chatManagerRef.current?.hideChoices();                    // Скрыть кнопки
chatManagerRef.current?.getPhase();                       // Получить текущую фазу
chatManagerRef.current?.getMessages();                    // Получить все сообщения
chatManagerRef.current?.getCurrentArc();                  // Получить arc из последнего story msg
```

**См.**: [src/components/chat/ChatManager.tsx](src/components/chat/ChatManager.tsx) для полного API

---

## UI Components

### Idle Screen

**Файл**: [src/components/DiscoverTabV2.tsx](src/components/DiscoverTabV2.tsx) (lines 1248-1271)

**Структура**:
```jsx
<div className={styles.historyStartScreen}>
  {/* Иконка */}
  <div className={`${styles.historyStartIconContainer} ${styles.calendarElementAnimated} ${visible ? styles.calendarElementVisible : ''}`}>
    <div className={styles.historyStartIcon}>✨</div>
  </div>

  {/* Промпт */}
  <div className={`${styles.historyStartPrompt} ${styles.calendarElementAnimated} ${visible ? styles.calendarElementVisible : ''}`}>
    {startPrompt}
  </div>

  {/* Описание */}
  <div className={`${styles.historyStartDescription} ${styles.calendarElementAnimated} ${visible ? styles.calendarElementVisible : ''}`}>
    {startDescription}
  </div>

  {/* Кнопка */}
  <button className={`${styles.historyStartButton} ${styles.calendarElementAnimated} ${visible ? styles.calendarElementVisible : ''}`}>
    {hasAiCredentials ? startButton : 'Настройте API ключи'}
  </button>
</div>
```

**Анимация**: `.calendarElementAnimated` → `.calendarElementVisible` (opacity 0→1, transform)

---

### Story Header

**Файл**: [src/components/DiscoverTabV2.tsx](src/components/DiscoverTabV2.tsx) (lines 1277-1292)

```jsx
<div className={styles.historyStoryHeader}>
  <h2 className={styles.historyStoryTitle}>
    История <span style={{ fontSize: '14px', opacity: 0.6 }}>(NEW v2 🧪)</span>
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
```

**При клике "✕"** → `resetDiscover()`:
- Очистка таймеров
- Очистка voice recording ресурсов
- Reset всех state переменных
- Возврат к idle screen

---

### Finale Interpretations

**Файл**: [src/components/DiscoverTabV2.tsx](src/components/DiscoverTabV2.tsx) (lines 1307-1333)

```jsx
{finaleInterpretations && !isGenerating && (
  <div className={`${styles.historyChatBubble} ${styles.historyFinalSummaryBubble}`}>
    <div className={styles.historyFinalSummaryHeader}>
      <div className={styles.historyFinalSummaryLabel}>Что мы о тебе узнали</div>

      {/* Toggle buttons */}
      <div className={styles.insightStyleToggle}>
        <button
          className={`${styles.insightStyleButton} ${finaleInterpretationMode === 'human' ? styles.active : ''}`}
          onClick={() => handleFinaleInterpretationToggle('human')}
        >
          На человеческом
        </button>
        <button
          className={`${styles.insightStyleButton} ${finaleInterpretationMode === 'astrological' ? styles.active : ''}`}
          onClick={() => handleFinaleInterpretationToggle('astrological')}
        >
          На астрологическом
        </button>
      </div>
    </div>

    {/* Interpretation text */}
    <div className={styles.historyFinalSummaryText}>
      {finaleInterpretationMode === 'human'
        ? finaleInterpretations.human
        : finaleInterpretations.astrological}
    </div>
  </div>
)}
```

---

### Error Display

**Файл**: [src/components/DiscoverTabV2.tsx](src/components/DiscoverTabV2.tsx) (lines 1336-1348)

```jsx
{error && (
  <div className={styles.historyStoryError}>
    <span>{error}</span>
    <button
      type="button"
      className={styles.historyStoryRetry}
      onClick={startPlanetDialogue}
      disabled={isGenerating}
    >
      Попробовать снова
    </button>
  </div>
)}
```

**Когда показывается**:
- AI generation failed
- Нет API ключей
- Network errors

---

## Стили

**Файл**: [src/components/NastiaApp.module.css](src/components/NastiaApp.module.css)

### Основной контейнер

```css
.historyChatContainer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.5rem;
  padding-bottom: 16px;        /* ← Отступ от tab bar */
  margin-bottom: 1rem;
  background: transparent;
  min-height: 70vh;
}
```

**⚠️ ВАЖНО**: `padding-bottom: 16px` предотвращает наложение на glass tab bar

### Idle Screen

```css
.historyStartScreen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 2rem 1rem;
  min-height: 70vh;
}

.historyStartIconContainer {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #FFB6C1, #DDA0DD);
}

.historyStartIcon {
  font-size: 48px;
  animation: pulse 2s ease-in-out infinite;
}

.historyStartPrompt {
  font-size: 20px;
  font-weight: 600;
  text-align: center;
  color: var(--nastia-dark);
}

.historyStartDescription {
  font-size: 14px;
  text-align: center;
  color: rgba(0, 0, 0, 0.6);
  max-width: 400px;
}

.historyStartButton {
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 25px;
  background: linear-gradient(135deg, #FFB6C1, #DDA0DD);
  color: white;
  cursor: pointer;
  transition: transform 0.2s;
}
```

### Анимации

```css
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.calendarElementAnimated {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.5s, transform 0.5s;
}

.calendarElementVisible {
  opacity: 1;
  transform: translateY(0);
}
```

### Story Header

```css
.historyStoryHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
}

.historyCloseButton {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: background 0.2s;
}
```

### Finale Interpretations

```css
.historyFinalSummaryBubble {
  background: linear-gradient(135deg, #FFF0F5, #F8F8FF);
  border: 2px solid #FFB6C1;
  border-radius: 16px;
  padding: 1.5rem;
  margin-top: 1rem;
}

.historyFinalSummaryHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.insightStyleToggle {
  display: flex;
  gap: 0.5rem;
  background: rgba(255, 255, 255, 0.5);
  padding: 4px;
  border-radius: 20px;
}

.insightStyleButton {
  padding: 6px 12px;
  font-size: 12px;
  border: none;
  border-radius: 16px;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.insightStyleButton.active {
  background: white;
  color: var(--nastia-dark);
}
```

---

## Тестирование

### URL для тестирования

**Новая версия (v2)**:
```
http://localhost:3000/nastia-calendar?newDiscover=true
```

**Старая версия (v1)** - для сравнения:
```
http://localhost:3000/nastia-calendar
```

### Сценарии тестирования

#### 1. Полный цикл (Idle → Story → Finale)

**Шаги**:
1. Открыть `?newDiscover=true`
2. Проверить idle screen:
   - ✅ Иконка появляется первой
   - ✅ Промпт появляется вторым
   - ✅ Описание появляется третьим
   - ✅ Кнопка появляется последней
3. Кликнуть "Начать историю"
4. Проверить planet dialogue:
   - ✅ Сообщение Луны появляется
   - ✅ Планеты "подключаются" с задержками
   - ✅ Персонализированные сообщения появляются (если настроен astro)
5. Проверить переход к истории:
   - ✅ Фаза меняется на 'story'
   - ✅ Сообщение Луны с первым сегментом
   - ✅ Кнопки выбора появляются последовательно
   - ✅ Reveal scroll: вниз → откат к началу
6. Сделать 7 выборов:
   - ✅ User message добавляется
   - ✅ Typing indicator "История"
   - ✅ Новый сегмент появляется
   - ✅ Новые кнопки + reveal scroll
7. Проверить finale (после 7-го выбора):
   - ✅ Фаза меняется на 'finale'
   - ✅ Финальное сообщение истории
   - ✅ Блок интерпретаций появляется
   - ✅ Toggle "На человеческом" / "На астрологическом" работает
8. Кликнуть "✕":
   - ✅ Возврат к idle screen
   - ✅ Все state сброшены

#### 2. Voice Recording

**См.**: [VOICE_RECORDING.md#тестирование](VOICE_RECORDING.md#тестирование)

**Краткие шаги**:
1. Дойти до любого выбора в истории
2. Кликнуть кнопку "Свой вариант" (🎙️)
3. Записать голос
4. Проверить transcription → AI generation → ready state
5. Кликнуть на готовый вариант

#### 3. Reveal Scroll

**Цель**: Проверить что reveal scroll работает правильно

**Шаги**:
1. Дойти до первого сегмента (arc 1)
2. Дождаться появления ВСЕХ кнопок
3. Проверить:
   - ✅ Автоматический скролл вниз (видно все кнопки)
   - ✅ Через ~800ms откат к началу moon message
   - ✅ Moon message находится под шапкой (60px отступ)
4. Сделать выбор, перейти к arc 2
5. Проверить:
   - ✅ Скролл вниз
   - ✅ Откат к началу story message (НЕ moon!)

#### 4. Error Handling

**AI generation failed**:
1. Отключить интернет
2. Кликнуть "Начать историю"
3. Проверить:
   - ✅ Ошибка отображается
   - ✅ Кнопка "Попробовать снова"
   - ✅ При клике - новая попытка

**No API keys**:
1. Удалить API ключи из localStorage
2. Перезагрузить страницу
3. Проверить:
   - ✅ Кнопка "Настройте API ключи" (неактивна)

#### 5. Personalized Messages

**С персонализацией**:
1. Настроить натальную карту
2. Дождаться загрузки personalized messages
3. Запустить историю
4. Проверить:
   - ✅ Диалог планет показывает персонализированные сообщения
   - ✅ Сообщения соответствуют астро-контексту

**Без персонализации**:
1. Очистить nativity data
2. Запустить историю
3. Проверить:
   - ✅ Только "подключение" планет
   - ✅ История появляется когда AI готов

---

## Важные правила

### ⚠️ НЕ менять reveal scroll логику

**Reveal scroll** тщательно настроен для плавной UX. Изменение timing'ов может сломать анимацию.

**Критические параметры**:
```typescript
const animationDuration = expectedButtonCount * 500; // 500ms/кнопка
setTimeout(() => { /* reveal scroll */ }, 800);      // 800ms для просмотра
const headerHeight = 60;                              // Высота шапки
```

**См.**: [Reveal Scroll Mechanism](#reveal-scroll-mechanism)

### ⚠️ window.scrollTo, НЕ container

```typescript
// ✅ ПРАВИЛЬНО
window.scrollTo({ top: ..., behavior: 'smooth' });

// ❌ НЕПРАВИЛЬНО
const container = document.querySelector('.historyChatContainer');
container.scrollTo({ ... }); // НЕ РАБОТАЕТ! Container не имеет overflow: scroll
```

**См.**: [AUTOSCROLL_FIX.md](AUTOSCROLL_FIX.md)

### ⚠️ Voice recording через props

**НЕ используйте** `setChoices()` в useEffect для обновления custom button state!

```typescript
// ❌ НЕПРАВИЛЬНО - создает бесконечный цикл
useEffect(() => {
  chatManagerRef.current?.setChoices(
    choices, customOption.option, customOption.status, customRecordingLevel
  );
}, [customOption.status]);

// ✅ ПРАВИЛЬНО - через props
<ChatManager
  customOption={customOption.option}
  customStatus={customOption.status}
  recordingLevel={customRecordingLevel}
/>
```

**См.**: [VOICE_RECORDING.md#важные-правила](VOICE_RECORDING.md#важные-правила)

### ⚠️ Тестируйте на новой версии

**ВСЕГДА** тестируйте изменения на:
```
http://localhost:3000/nastia-calendar?newDiscover=true
```

**НЕ** на старой версии (`/nastia-calendar`)!

### ⚠️ Triple RAF для скролла

**Используйте** triple `requestAnimationFrame` перед `window.scrollTo()`:

```typescript
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo(...);
    });
  });
});
```

**Причина**: Гарантия полного рендера DOM перед скроллом

### ⚠️ Cleanup ресурсов

При unmount или reset **обязательно** очищайте:
- Таймеры (`timeoutsRef.current`)
- MediaRecorder и MediaStream
- AudioContext
- AbortController
- Animation frames

**См.**: `resetDiscover()` и `cleanupCustomOptionResources()`

---

## История изменений

### 2025-10-22: Props-based Voice Recording Architecture
**Проблема**: Бесконечный цикл обновлений кнопки "Свой вариант"

**Решение**:
- Переход на передачу `customOption/customStatus/recordingLevel` через props
- Удаление state из ChatManager для этих значений
- Удаление useEffect sync цикла

**Изменения**:
- `ChatManager.tsx`: добавлены props для voice state
- `DiscoverTabV2.tsx`: передача props вместо setChoices() в useEffect
- `ChatChoices.tsx`: использование Lucide иконок

**См.**: [VOICE_RECORDING.md#история-изменений](VOICE_RECORDING.md#история-изменений)

### 2025-10-22: Padding-bottom Fix
**Проблема**: Сообщения налезали на glass tab bar внизу

**Решение**:
- Увеличен `padding-bottom` в `.historyChatContainer` с 8px до 16px

**Commit**: `cd8f0b0` - "Add bottom padding to chat container"

### 2024 (ранее): Создание DiscoverTabV2
**Мотивация**: Упростить и централизовать управление чатом

**Изменения**:
- Создан `ChatManager` как единый контроллер
- Создан `useChatScroll` hook для автоскролла
- Вынесена логика planet dialogue в отдельные функции
- Унификация reveal scroll механизма

---

## Связанные компоненты

### ChatManager
**Файл**: [src/components/chat/ChatManager.tsx](src/components/chat/ChatManager.tsx)

**Роль**: Централизованное управление чатом (messages, typing, choices, scroll)

**API**: См. [Props & API](#props--api)

### ChatChoices
**Файл**: [src/components/chat/ChatChoices.tsx](src/components/chat/ChatChoices.tsx)

**Роль**: Рендеринг кнопок выбора + кнопка "Свой вариант"

**Props**:
```typescript
{
  options: HistoryStoryOption[];
  onOptionSelect: (option) => void;
  onCustomOptionClick: () => void;
  customOption?: HistoryStoryOption;
  customOptionStatus?: CustomOptionStatus;
  recordingLevel?: number;
  visibleCount: number;
  hiding: boolean;
  disabled: boolean;
  showCustomButton?: boolean;
}
```

### useChatScroll
**Файл**: [src/components/chat/useChatScroll.ts](src/components/chat/useChatScroll.ts)

**Роль**: Auto-scroll логика для чата

**Использование**:
```typescript
const scrollManager = useChatScroll({
  messagesContainerRef,
  messages,
  phase,
  isActive,
});
```

---

## Troubleshooting

### Кнопки не появляются
**Причина**: `currentChoicesRef` используется вместо state

**Решение**: Используйте `setHasChoices(true)` для триггера re-render

### Reveal scroll не работает
**Причина**: Используете `container.scrollTo()` вместо `window.scrollTo()`

**Решение**: Всегда используйте `window.scrollTo()`

### Бесконечный цикл voice button
**Причина**: useEffect с `setChoices()` на каждое изменение state

**Решение**: Передавайте state через props в ChatManager

**См.**: [VOICE_RECORDING.md#известные-проблемы-и-решения](VOICE_RECORDING.md#известные-проблемы-и-решения)

### Planet dialogue не показывается
**Причина**: `personalizedPlanetMessages` не загружены или пустые

**Проверка**:
```typescript
console.log('Personalized messages:', personalizedPlanetMessages);
console.log('Loading:', isLoadingPersonalizedMessages);
```

**Решение**: Настройте натальную карту для генерации персонализации

### AI generation зависает
**Причина**: Нет API ключей или network проблемы

**Проверка**:
```typescript
console.log('Has credentials:', hasAiCredentials);
console.log('Claude key:', effectiveClaudeKey ? 'present' : 'missing');
console.log('OpenAI key:', effectiveOpenAIKey ? 'present' : 'missing');
```

**Решение**: Настройте API ключи в settings

---

## Дополнительные ресурсы

### Утилиты

- [src/utils/historyStory.ts](src/utils/historyStory.ts) - AI генерация историй
- [src/utils/planetMessages.ts](src/utils/planetMessages.ts) - Вычисление пауз для диалога планет
- [src/utils/audioTranscription.ts](src/utils/audioTranscription.ts) - Whisper транскрипция
- [src/utils/psychContractHistory.ts](src/utils/psychContractHistory.ts) - История контрактов

### Данные

- [src/data/psychologicalContracts.ts](src/data/psychologicalContracts.ts) - Психологические контракты

### Стили

- [src/components/NastiaApp.module.css](src/components/NastiaApp.module.css) - Все стили для DiscoverTab

---

**Автор**: Claude Code
**Последнее обновление**: 2025-10-22
**Версия документации**: 1.0
