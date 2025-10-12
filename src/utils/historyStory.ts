import { callAI, type AIMessage } from './aiClient';

export interface HistoryStoryOption {
  id: string;
  title: string;
  description: string;
}

export interface HistoryStoryResponse {
  continuation: string;
  options: HistoryStoryOption[];
}

export interface HistoryStoryContextSegment {
  /**
   * Text that has already been shown to the user.
   */
  text: string;
  /**
   * Optional short title of the option that lead to this segment.
   */
  optionTitle?: string;
  /**
   * Optional explanation of the option that lead to this segment.
   */
  optionDescription?: string;
}

export interface HistoryStoryAuthorStyle {
  name: string;
  stylePrompt: string;
  genre: string;
}

export interface HistoryStoryRequestOptions {
  /**
   * Previously generated story fragments, ordered chronologically.
   * The last element corresponds to the most recent paragraph.
   */
  segments: HistoryStoryContextSegment[];
  /**
   * Optional direction that the user выбрал для следующего шага.
   */
  currentChoice?: HistoryStoryOption;
  /**
   * Optional short summary of earlier events to reduce prompt length.
   */
  summary?: string;
  /**
   * Author persona that should narrate the story.
   */
  author: HistoryStoryAuthorStyle;
  /**
   * Optional AbortSignal to cancel the AI request.
   */
  signal?: AbortSignal;
  /**
   * Optional Claude API key.
   */
  claudeApiKey?: string;
  /**
   * Optional Claude proxy URL.
   */
  claudeProxyUrl?: string;
  /**
   * Optional OpenAI API key for fallback.
   */
  openAIApiKey?: string;
}

const FALLBACK_RESPONSE: HistoryStoryResponse = {
  continuation:
    'Ты вырываешься из сна, понимая, что комната чужая, а окна заколочены. В воздухе пахнет озоном и мокрыми стенами, как после грозы, которой никто не слышал. Перед тобой дрожит синеватый свет, сзади тянется тень, будто у неё собственное мнение. Ты не знаешь, в какой момент всё пошло иначе, но выбора больше нет.',
  options: [
    {
      id: 'open-the-door',
      title: 'Приоткрыть дверь',
      description: 'Ты решаешь проверить источник света, затаив дыхание и охватывая ручку пальцами.',
    },
    {
      id: 'hide-in-shadow',
      title: 'Раствориться в тени',
      description: 'Ты скользишь к стене, надеясь исчезнуть в темноте прежде, чем свет увидит тебя.',
    },
  ],
};

function buildBaseInstructions(genre: string): string {
  return `Создай интерактивный рассказ в жанре ${genre}.
Главная героиня — девушка, но её имя не упоминается.
Повествование ведётся от второго лица («ты»).
Начни сцену с действия, ощущения или пробуждения без объяснений предыстории.
Стиль — кинематографичный, с атмосферой присутствия и короткими, конкретными фразами.
Используй простой, ясный язык, избегай витиеватых метафор и длинных сравнений.
Продолжение должно быть одним абзацем из 3–5 предложений длиной 55–85 слов.
Абзац подводит к развилке и оставляет тайну, не раскрывая полностью происходящее.
Добавь ощущение, что читатель принимает решения шаг за шагом.
После абзаца сформируй ровно два варианта выбора, ведущих к разным эмоциональным и сюжетным линиям. Каждый вариант — объект формата:
{
  "id": "уникальный_kebab-case",
  "title": "до 32 символов",
  "description": "одно предложение до 90 символов"
}
Сделай варианты контрастными по тону и исходу, без клише «продолжить» или «вариант 1».
Ответь строго в формате JSON:
{
  "continuation": "абзац истории",
  "options": [ { ... }, { ... } ]
}
Не добавляй пояснений, комментариев, Markdown и эмодзи.`;
}

const CONTEXT_LIMIT = 6;

function buildContextDescription(
  segments: HistoryStoryContextSegment[],
  choice?: HistoryStoryOption,
  summary?: string,
): string {
  if (segments.length === 0) {
    const base = 'Это начало истории. Начни сразу с действия или ощущения, без пояснений предыстории и без имени героини.';
    if (!choice) {
      return summary ? `${summary}\n\n${base}` : base;
    }
    const choiceLine = `Сразу веди сцену к направлению выбора: «${choice.title}»${choice.description ? ` (${choice.description})` : ''}.`;
    return summary ? `${summary}\n\n${base}\n${choiceLine}` : `${base}\n${choiceLine}`;
  }

  const recentSegments = segments.slice(-CONTEXT_LIMIT);

  const parts = recentSegments.map((segment, index) => {
    const stepNumber = segments.length - recentSegments.length + index + 1;
    const choice = segment.optionTitle
      ? `Выбранное направление: «${segment.optionTitle}»${segment.optionDescription ? ` (${segment.optionDescription})` : ''}.`
      : 'Начальный фрагмент.';
    return `Шаг ${stepNumber}. ${choice}\nТекст:\n${segment.text}`;
  });

  const summaryPart = summary ? `${summary}\n\n` : '';
  const base = `${summaryPart}Вот что уже рассказано:\n\n${parts.join('\n\n')}\n\nПродолжи историю так, чтобы сцена следовала за последним фрагментом, усиливала напряжение и оставляла тайну. Сохраняй второе лицо и короткие кинематографичные фразы.`;

  if (!choice) {
    return base;
  }

  return `${base}\nСледующий фрагмент должен соответствовать выбору пользователя: «${choice.title}»${choice.description ? ` (${choice.description})` : ''}.`;
}

function sanitizeOption(
  option: Partial<HistoryStoryOption> | undefined,
  fallback: HistoryStoryOption,
): HistoryStoryOption {
  if (!option) {
    return fallback;
  }

  const id = typeof option.id === 'string' && option.id.trim().length > 0
    ? option.id.trim()
    : fallback.id;

  const title = typeof option.title === 'string' && option.title.trim().length > 0
    ? option.title.trim().slice(0, 48)
    : fallback.title;

  const description = typeof option.description === 'string' && option.description.trim().length > 0
    ? option.description.trim().slice(0, 140)
    : fallback.description;

  return { id, title, description };
}

function normalizeResponse(raw: unknown): HistoryStoryResponse {
  if (!raw || typeof raw !== 'object') {
    return FALLBACK_RESPONSE;
  }

  const data = raw as Partial<HistoryStoryResponse>;

  const continuation = typeof data.continuation === 'string' && data.continuation.trim().length > 0
    ? data.continuation.trim()
    : FALLBACK_RESPONSE.continuation;

  const optionsArray = Array.isArray(data.options) ? data.options : [];

  const normalizedOptions: HistoryStoryOption[] = [];
  normalizedOptions.push(
    sanitizeOption(optionsArray[0], FALLBACK_RESPONSE.options[0]),
    sanitizeOption(optionsArray[1], FALLBACK_RESPONSE.options[1]),
  );

  return {
    continuation,
    options: normalizedOptions,
  };
}

export async function generateHistoryStoryChunk({
  segments,
  currentChoice,
  summary,
  author,
  signal,
  claudeApiKey,
  claudeProxyUrl,
  openAIApiKey,
}: HistoryStoryRequestOptions): Promise<HistoryStoryResponse> {
  const contextDescription = buildContextDescription(segments, currentChoice, summary);
  const authorInstruction = `Пиши как ${author.name}. ${author.stylePrompt}. Сохраняй интонацию уверенной собеседницы, не раскрывай тайну до конца и не объясняй правила истории. Используй короткие, понятные предложения без лишней лирики.`;
  const baseInstructions = buildBaseInstructions(author.genre);

  const messages: AIMessage[] = [
    {
      role: 'user',
      content: `${contextDescription}\n\n${authorInstruction}\n\n${baseInstructions}`,
    },
  ];

  try {
    const result = await callAI({
      system: `Ты ${author.name}, русскоязычная писательница, создающая атмосферный интерактивный рассказ во втором лице. Соблюдай формат JSON без Markdown и не добавляй вступлений.`,
      messages,
      temperature: 0.85,
      maxTokens: 450,
      signal,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
    });

    console.log(`[HistoryStory] Generated chunk using ${result.provider}`);

    const cleanText = result.text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    const parsed = JSON.parse(cleanText);
    return normalizeResponse(parsed);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error('[HistoryStory] Failed to generate chunk, using fallback', error);
    return FALLBACK_RESPONSE;
  }
}
