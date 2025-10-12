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
    'Настя задумалась, как переписать собственный календарь так, чтобы судьба наконец перестала подбрасывать неожиданные сюрпризы. Она решает дышать глубже, оглядывается на прошлые подсказки и выбирает новый маршрут.',
  options: [
    {
      id: 'calm-steps',
      title: 'Сделать шаг тихо',
      description: 'Героиня прислушивается к себе и двигается осторожно, вспоминая прошлые циклы.',
    },
    {
      id: 'bold-move',
      title: 'Рискнуть и ускориться',
      description: 'Она решает заставить события развиваться быстрее, даже если это опасно.',
    },
  ],
};

const BASE_INSTRUCTIONS = `Ты — язвительная, но поддерживающая рассказчица. Пиши на современном русском, избегай упоминаний приложений и цифровых интерфейсов. История должна быть ироничной, но теплой.

Сгенерируй продолжение истории длиной 45–75 слов. Это должен быть один цельный абзац без маркированных пунктов и списков. Используй максимум одно эмодзи, только если оно органично. Следи за длиной: не выходи за пределы.

После продолжения нужно предложить РОВНО ДВА варианта развития событий. Каждый вариант представлен объектом:
{
  "id": "краткий_kebab-case_идентификатор",
  "title": "до 32 символов, читабельный заголовок",
  "description": "одно предложение до 90 символов"
}
Названия вариантов должны быть по делу, без клише «вариант 1/2», «продолжить историю» и т.п. Пиши на русском, можно с лёгкой иронией.

Ответь строго в формате JSON:
{
  "continuation": "текст продолжения",
  "options": [ { ... }, { ... } ]
}
Никаких пояснений, комментариев или Markdown-блоков.`;

const CONTEXT_LIMIT = 6;

function buildContextDescription(
  segments: HistoryStoryContextSegment[],
  choice?: HistoryStoryOption,
  summary?: string,
): string {
  if (segments.length === 0) {
    const base = 'Это начало истории. Сделай старт неожиданным, но дружелюбным.';
    if (!choice) {
      return summary ? `${summary}\n\n${base}` : base;
    }
    const choiceLine = `Следуй выбранному направлению: «${choice.title}»${choice.description ? ` (${choice.description})` : ''}.`;
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
  const base = `${summaryPart}Вот что уже рассказано:\n\n${parts.join('\n\n')}\n\nПродолжи историю так, чтобы она логично следовала за последним фрагментом, но при этом вносила новый нюанс.`;

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
  const authorInstruction = `Пиши как ${author.name}. ${author.stylePrompt}. Сохраняй фирменную язвительность и иронию, но передавай дух выбранного автора. В каждом ответе не упоминай сам факт, что ты играешь роль.`;

  const messages: AIMessage[] = [
    {
      role: 'user',
      content: `${contextDescription}\n\n${authorInstruction}\n\n${BASE_INSTRUCTIONS}`,
    },
  ];

  try {
    const result = await callAI({
      system: `Ты ${author.name} в образе язвительной подруги. Пиши на русском. Соблюдай формат ответа JSON без markdown.`,
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
