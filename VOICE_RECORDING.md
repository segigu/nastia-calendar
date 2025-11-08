# Voice Recording Functionality ("Свой вариант")

**Дата создания**: 2025-10-22
**Статус**: ✅ Работает корректно

Документация о функциональности голосовой записи пользовательских вариантов в интерактивных историях.

---

## Обзор

Кнопка "Свой вариант" позволяет пользователю записать голосом свой вариант продолжения истории. Запись транскрибируется через OpenAI Whisper, затем AI генерирует title/description, и вариант становится доступен как кнопка выбора.

### Визуальные состояния

1. **idle** - "Свой вариант" с иконкой микрофона
2. **recording** - "Идёт запись..." с пульсацией и визуализацией уровня звука
3. **transcribing** - "Обрабатываем запись..." с loader спиннером
4. **generating** - "Придумываем формулировку..." с loader спиннером
5. **ready** - Сгенерированный title/description с иконкой "перезаписать"
6. **error** - "Не удалось распознать" с иконкой retry

---

## Архитектура

### Компоненты

```
DiscoverTabV2.tsx (родитель)
    ↓ props: customOption, customStatus, recordingLevel
ChatManager.tsx (контейнер)
    ↓ props: customOption, customStatus, recordingLevel
ChatChoices.tsx (UI рендеринг)
```

### ⚠️ КРИТИЧЕСКИ ВАЖНО: Props-based Architecture

**Состояние кнопки хранится в DiscoverTabV2 и передается ЧЕРЕЗ PROPS вниз по дереву.**

```typescript
// ❌ НЕПРАВИЛЬНО - создает бесконечный цикл:
useEffect(() => {
  chatManagerRef.current?.setChoices(choices, customOption, customStatus, recordingLevel);
}, [customOption.status, customRecordingLevel]);

// ✅ ПРАВИЛЬНО - передаем через props:
<ChatManager
  customOption={customOption.option || undefined}
  customStatus={customOption.status}
  recordingLevel={customRecordingLevel}
/>
```

**Почему это важно:**
- `ChatManager` раньше хранил `customOption/customStatus/recordingLevel` в своем state
- Попытка обновлять их через `setChoices()` в useEffect создавала бесконечный цикл
- Теперь они передаются как **props** - обновление происходит реактивно без циклов

---

## Файлы и ответственности

### [src/components/DiscoverTabV2.tsx](src/components/DiscoverTabV2.tsx)

**Роль**: Владелец состояния voice recording

**Ключевой state**:
```typescript
const [customOption, setCustomOption] = useState<{
  status: CustomOptionStatus;
  option: HistoryStoryOption | null;
  transcript?: string;
  error?: string;
}>({
  status: 'idle',
  option: null,
});
const [customRecordingLevel, setCustomRecordingLevel] = useState(0); // 0-1
```

**Важные функции**:
- `startCustomRecording()` - Запускает запись (MediaRecorder API)
- `stopCustomRecording()` - Останавливает запись и запускает транскрипцию
- `processCustomRecording()` - Обрабатывает аудио → текст → AI генерация
- `handleCustomOptionClick()` - Обработчик кликов (переключает состояния)
- `cleanupCustomOptionResources()` - Очистка MediaRecorder/AudioContext

**Передача в ChatManager** (lines 1307-1317):
```typescript
<ChatManager
  ref={chatManagerRef}
  onChoiceSelect={handleChoiceSelect}
  onCustomOptionClick={handleCustomOptionClick}
  customOption={customOption.option || undefined}
  customStatus={customOption.status}
  recordingLevel={customRecordingLevel}
/>
```

**Сброс при выборе** (line 574):
```typescript
setCustomOption({ status: 'idle', option: null }); // Reset после выбора
```

---

### [src/components/chat/ChatManager.tsx](src/components/chat/ChatManager.tsx)

**Роль**: Контейнер для чата, передает props в ChatChoices

**Props** (lines 31-42):
```typescript
interface ChatManagerProps {
  // ... другие props
  customOption?: HistoryStoryOption;      // Сгенерированный вариант (ready state)
  customStatus?: CustomOptionStatus;       // Текущее состояние кнопки
  recordingLevel?: number;                 // 0-1 для визуализации
}
```

**Destructuring** (lines 105-107):
```typescript
customOption: customOptionProp,
customStatus: customStatusProp = 'idle',
recordingLevel: recordingLevelProp = 0,
```

**Передача в ChatChoices** (lines 302-304):
```typescript
<ChatChoices
  customOption={customOptionProp}
  customOptionStatus={customStatusProp}
  recordingLevel={recordingLevelProp}
  // ... другие props
/>
```

**⚠️ setChoices() больше НЕ управляет custom button state:**
```typescript
// lines 215-221
setChoices: (newChoices, newCustomOption, newCustomStatus, newRecordingLevel, showCustomButton) => {
  setChoicesState(newChoices);
  // customOption/customStatus/recordingLevel now controlled by props, ignore parameters
  setShowCustomButtonState(showCustomButton ?? true);
  setVisibleButtonsCount(0);
  setChoicesHiding(false);
},
```

---

### [src/components/chat/ChatChoices.tsx](src/components/chat/ChatChoices.tsx)

**Роль**: Рендеринг UI кнопки "Свой вариант"

**Props**:
```typescript
customOption?: HistoryStoryOption;           // Готовый вариант для ready state
customOptionStatus?: CustomOptionStatus;     // idle|recording|transcribing|generating|ready|error
recordingLevel?: number;                     // 0-1 для пульсации при recording
showCustomButton?: boolean;                  // Показывать ли кнопку вообще
```

**Иконки** (Lucide React):
- `<Mic />` - idle
- `<Square />` - recording (стоп-кнопка)
- `<Loader2 />` - transcribing, generating
- `<RotateCcw />` - ready (перезаписать), error (retry)

**Анимация появления** (lines 156-163):
- Кнопка появляется ПОСЛЕДНЕЙ после всех обычных кнопок
- Используется `visibleCount` для sequential animation
- Задержка 500ms на кнопку (как у остальных)

**Recording визуализация** (lines 207-235):
- Пульсация с уровнем звука (`recordingLevel`)
- CSS переменные: `--recording-glow`, `--recording-border-alpha`, `--recording-pulse`
- 3 концентрических круга пульсации в `.historyCustomRecordingPulseWrapper`

---

## Аудио обработка

### MediaRecorder API

**Настройки** (DiscoverTabV2.tsx, lines 911-922):
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});

const recorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus', // fallback to audio/webm
});
```

**Audio Level Visualization** (lines 935-968):
```typescript
// AudioContext → AnalyserNode → getByteFrequencyData()
// Обновляет customRecordingLevel каждые 50ms
// Уровень нормализуется 0-1 и передается в ChatChoices
```

---

### Транскрипция

**OpenAI Whisper API** ([src/utils/audioTranscription.ts](src/utils/audioTranscription.ts)):
```typescript
const transcript = await transcribeAudioBlob(audioBlob, {
  openAIApiKey,
  openAIProxyUrl, // NOT USED for audio - proxy doesn't support FormData
  language: 'ru',
});
```

**Формат**:
- Вход: `Blob` (audio/webm или audio/mp4)
- Выход: `string` (распознанный текст)
- Модель: `whisper-1` (исправлено с `gpt-4o-mini-transcribe`)

**ВАЖНО: Требования к API**:
- **Прокси НЕ используется** для audio transcription - он поддерживает только JSON для chat completions, не multipart/form-data
- **Всегда используется прямой OpenAI API**: `https://api.openai.com/v1/audio/transcriptions`
- **Требуется валидный `REACT_APP_OPENAI_API_KEY`** в `.env` файле или в remote config
- Получить ключ: https://platform.openai.com/api-keys

**Error handling**:
- Пустой текст → "Не удалось распознать аудио"
- 401 Unauthorized → "Incorrect API key" - нужно обновить `REACT_APP_OPENAI_API_KEY`
- Network errors → отображаются в `customOption.error`

---

### AI генерация title/description

**Функция** ([src/utils/historyStory.ts](src/utils/historyStory.ts)):
```typescript
const generated = await generateCustomHistoryOption({
  userTranscript: transcript,
  claudeApiKey,
  claudeProxyUrl,
  openAIApiKey,
  openAIProxyUrl,
});
```

**Промпт**:
- Берет transcript пользователя
- Создает короткий title (3-5 слов)
- Создает description (1-2 предложения)
- Стиль: от первого лица, естественный язык

**Модель**: `claude-haiku-4.5` (primary), OpenAI (fallback)

---

## Состояния и переходы

```
idle
  ↓ [клик микрофона]
recording (запускается MediaRecorder + audio level monitoring)
  ↓ [клик стоп / автостоп после тишины]
transcribing (отправка в Whisper API)
  ↓ [успех транскрипции]
generating (AI генерация title/description)
  ↓ [успех генерации]
ready (показывается готовый вариант)
  ↓ [клик на вариант → выбор]
  ↓ [клик на иконку retry → возврат в idle]

При ошибке на любом этапе → error
  ↓ [клик retry → возврат в idle]
```

---

## Стили и CSS

**Файл**: [src/components/NastiaApp.module.css](src/components/NastiaApp.module.css)

**Основные классы**:
```css
.historyCustomButton { /* Базовая кнопка */ }
.historyCustomButtonIdle { /* Idle состояние */ }
.historyCustomButtonRecording { /* Recording с пульсацией */ }
.historyCustomButtonProcessing { /* Transcribing/Generating */ }
.historyCustomButtonReady { /* Готовый вариант */ }
.historyCustomButtonError { /* Ошибка */ }

.historyCustomIconCircle { /* Круг с иконкой */ }
.historyCustomRecordingPulseWrapper { /* Контейнер для пульсации */ }
.historyCustomRecordingPulse { /* Пульсирующие круги */ }
```

**CSS переменные для recording**:
```css
--recording-glow: 0.28-0.95 (зависит от уровня звука)
--recording-border-alpha: 0.5-0.95 (прозрачность границы)
--recording-pulse: 0.4-0.95 (интенсивность пульсации)
```

---

## Автоскролл

**Триггер**: При изменении `customOption.status` (DiscoverTabV2.tsx, lines 1150-1170)

**Логика**:
```typescript
useEffect(() => {
  if (!customOptionStatus) return;

  // Тройной requestAnimationFrame для гарантии рендера
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
}, [customOptionStatus]);
```

**⚠️ ВАЖНО**: Скроллим `window`, НЕ контейнер (см. [AUTOSCROLL_FIX.md](AUTOSCROLL_FIX.md))

---

## Типы

**CustomOptionStatus** ([src/components/chat/ChatChoices.tsx](src/components/chat/ChatChoices.tsx)):
```typescript
export type CustomOptionStatus =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'generating'
  | 'ready'
  | 'error';
```

**HistoryStoryOption** ([src/utils/historyStory.ts](src/utils/historyStory.ts)):
```typescript
export interface HistoryStoryOption {
  id: string;
  title: string;
  description: string;
}
```

---

## Известные проблемы и решения

### ❌ Проблема 1: Бесконечный цикл обновлений

**Симптомы**:
- Кнопка мигает и исчезает
- В консоли 900+ сообщений `[CUSTOM OPTION] Updating ChatManager...`

**Причина**:
```typescript
// ❌ НЕПРАВИЛЬНО:
useEffect(() => {
  chatManagerRef.current?.setChoices(
    choices,
    customOption.option,
    customOption.status,
    customRecordingLevel
  );
}, [customOption.status, customRecordingLevel]); // Создает цикл!
```

**Решение**:
- Удалить useEffect
- Передавать состояние через props в ChatManager
- ChatManager передает props дальше в ChatChoices
- React сам обновит UI реактивно

---

### ❌ Проблема 2: Кнопка не отображается

**Симптомы**:
- Кнопка не появляется когда есть choices

**Причина**:
```typescript
// ❌ Использование ref вместо state:
const showCustomOption = currentChoicesRef.current.length > 0; // Ref не триггерит re-render!
```

**Решение**:
```typescript
// ✅ State триггерит re-render:
const [hasChoices, setHasChoices] = useState(false);
setHasChoices(options.length > 0);
const showCustomOption = hasChoices;
```

---

### ❌ Проблема 3: Кнопка не реагирует на клики

**Симптомы**:
- Кнопка отображается, но не меняет состояние при клике

**Причина**:
- Props не обновляются в ChatManager/ChatChoices

**Проверка**:
1. Убедитесь что `customOption.status` меняется в DiscoverTabV2
2. Проверьте что props передаются в ChatManager
3. Проверьте что ChatManager передает props в ChatChoices (НЕ state!)

```typescript
// ✅ ПРАВИЛЬНО в ChatManager:
<ChatChoices
  customOptionStatus={customStatusProp}  // Prop, не state!
  recordingLevel={recordingLevelProp}    // Prop, не state!
/>
```

---

## Тестирование

### Ручное тестирование

1. **Idle → Recording**:
   - Кликнуть на кнопку "Свой вариант"
   - Проверить: иконка меняется на квадрат, начинается пульсация
   - Проговорить текст вслух
   - Проверить: пульсация меняет интенсивность в зависимости от громкости

2. **Recording → Transcribing**:
   - Кликнуть стоп (или подождать автостоп)
   - Проверить: появляется "Обрабатываем запись..." с loader

3. **Transcribing → Generating**:
   - Подождать ответа Whisper
   - Проверить: меняется на "Придумываем формулировку..."

4. **Generating → Ready**:
   - Подождать AI генерации
   - Проверить: кнопка показывает title/description из вашей записи
   - Кликнуть на кнопку → должен выбраться как обычный вариант

5. **Error handling**:
   - Записать тишину или невнятный звук
   - Проверить: должен показаться "Не удалось распознать" с retry иконкой
   - Кликнуть retry → возврат в idle

### URL для тестирования

**Новая версия** (с ChatManager):
```
http://localhost:3000/nastia-calendar?newDiscover=true
```

**Старая версия** (референс):
```
http://localhost:3000/nastia-calendar
```

---

## Производительность

### Оптимизации

1. **Audio level updates**: throttled до 50ms (lines 954-962)
2. **Cleanup**: все timeouts/MediaRecorder очищаются при unmount
3. **Props вместо setChoices()**: предотвращает лишние re-renders

### Памятование

**useCallback** используется для:
- `startCustomRecording`
- `stopCustomRecording`
- `processCustomRecording`
- `handleCustomOptionClick`
- `cleanupCustomOptionResources`

Это предотвращает лишние re-renders дочерних компонентов.

---

## API Keys

**Требуются**:
- `REACT_APP_OPENAI_API_KEY` - для Whisper транскрипции
- `REACT_APP_CLAUDE_API_KEY` или `REACT_APP_OPENAI_API_KEY` - для AI генерации

**Fallback**:
- Если нет Claude key, используется OpenAI для генерации
- Если нет OpenAI key, транскрипция не работает (кнопка не отображается)

---

## Дальнейшее развитие

### Идеи для улучшений

1. **Визуальная обратная связь**:
   - Waveform визуализация вместо простых кругов
   - Progress bar для транскрипции/генерации

2. **UX улучшения**:
   - Предпросмотр transcript перед генерацией
   - Возможность редактировать title/description
   - Сохранение истории записей

3. **Производительность**:
   - Локальная транскрипция (Web Speech API fallback)
   - Кэширование аудио для retry
   - Streaming responses от AI

4. **Accessibility**:
   - Клавиатурные шорткаты (пробел для record/stop)
   - Screen reader announcements для состояний
   - Visual indicators для глухих пользователей

---

## Контрольный чеклист при изменениях

Если вы меняете код voice recording:

- [ ] **State в DiscoverTabV2** - единственный источник правды для customOption/customStatus/recordingLevel
- [ ] **Props в ChatManager** - НЕ используйте state для этих значений, только props
- [ ] **НЕТ useEffect для setChoices()** - это создает бесконечный цикл
- [ ] **Cleanup ресурсов** - MediaRecorder, AudioContext, timeouts очищаются
- [ ] **Автоскролл** - используйте window.scrollTo, НЕ container.scrollTo
- [ ] **Тестирование** - проверьте все 6 состояний (idle/recording/transcribing/generating/ready/error)
- [ ] **Lucide иконки** - используйте компоненты, НЕ emoji строки
- [ ] **CSS классы** - следуйте именованию historyCustom*
- [ ] **Error handling** - показывайте понятные сообщения об ошибках

---

## История изменений

### 2025-10-22: Props-based Architecture
**Проблема**: Бесконечный цикл обновлений из-за useEffect → setChoices()

**Решение**:
- Переход на передачу customOption/customStatus/recordingLevel через props
- Удаление state из ChatManager для этих значений
- Удаление useEffect sync цикла

**Изменения**:
- `ChatManager.tsx`: добавлены props `customOption`, `customStatus`, `recordingLevel`
- `DiscoverTabV2.tsx`: передача props в ChatManager, упрощение setChoices()
- `ChatChoices.tsx`: использование Lucide иконок вместо emoji

**Результат**: Кнопка работает стабильно, без мигания, реагирует на все состояния

---

## Связанные документы

- [CLAUDE.md](CLAUDE.md) - Общая документация проекта
- [TECHNICAL_DOCS.md](TECHNICAL_DOCS.md) - Техническая документация
- [AUTOSCROLL_FIX.md](AUTOSCROLL_FIX.md) - Детали автоскролла
- [DESIGN_RULES.md](DESIGN_RULES.md) - Правила дизайна

---

**Автор**: Claude Code
**Последнее обновление**: 2025-10-22
