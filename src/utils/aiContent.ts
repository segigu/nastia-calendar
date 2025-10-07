export interface PeriodModalContent {
  question: string;
  joke: {
    emoji: string;
    text: string;
  };
}

export interface GeneratePeriodContentOptions {
  userName?: string;
  cycleStartISODate: string;
  signal?: AbortSignal;
  apiKey?: string;
}

const responseSchema = {
  name: 'period_modal_copy',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['question', 'joke'],
    properties: {
      question: {
        type: 'string',
        description: 'A concise invitation to start tracking the cycle addressed to the user by name.',
      },
      joke: {
        type: 'object',
        additionalProperties: false,
        required: ['emoji', 'text'],
        properties: {
          emoji: {
            type: 'string',
            description: 'One emoji or a short emoji combo.',
          },
          text: {
            type: 'string',
            description: 'A short punchline with playful female sarcasm and a supportive tone.',
          },
        },
      },
    },
  },
} as const;

export async function generatePeriodModalContent({
  userName,
  cycleStartISODate,
  signal,
  apiKey,
}: GeneratePeriodContentOptions): Promise<PeriodModalContent> {
  const key = apiKey || process.env.REACT_APP_OPENAI_API_KEY;

  if (!key) {
    throw new Error('OpenAI API key is not configured. Set REACT_APP_OPENAI_API_KEY.');
  }

  const model = process.env.REACT_APP_OPENAI_MODEL || 'gpt-4o-mini';
  const effectiveUserName = (userName && userName.trim()) ? userName.trim() : 'Настя';

  const cycleDate = new Date(cycleStartISODate);
  const readableDate = cycleDate.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const instructions = `Ты — Настя-советчица: язвительная подруга с чёрным, но тёплым чувством юмора и железной поддержкой.
Обращайся к ${effectiveUserName}, допускаются уменьшительно-ласкательные формы, но без сиропа.
Категорически избегай слов «приложение», «трекинг», «помощник» и любых намёков на сервис. Говори как живая подруга, ворчащая рядом на диване.
Нужны две части: (1) одно приветствие (до 24 слов), где вы вместе отмечаете дату цикла с долей жёсткого сострадания; можешь упомянуть спазмы, PMS или заряд хандры, (2) одна шутка в стиле красной дорожки/сериала с едким женским сарказмом, допускающим ворчание, но без самообесценивания.
Шутка — одно предложение. Эмодзи используй только в шутке. Избегай позитивных клише и мотивационных лозунгов.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      max_tokens: 450,
      response_format: {
        type: 'json_schema',
        json_schema: responseSchema,
      },
      messages: [
        {
          role: 'system',
          content:
            'You are "Настя", a playful female friend who writes in Russian with witty, supportive sarcasm. Always comply with the provided schema.',
        },
        {
          role: 'user',
          content: instructions,
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    let message = 'Failed to generate AI content';
    try {
      const errorPayload = await response.json();
      if (errorPayload?.error?.message) {
        message = errorPayload.error.message;
      }
    } catch {
      /* ignore JSON errors */
    }
    throw new Error(message);
  }

  const payload = await response.json();
  const rawContent = payload?.choices?.[0]?.message?.content;

  if (!rawContent) {
    throw new Error('OpenAI response did not include content.');
  }

  let parsed: PeriodModalContent;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    throw new Error('Failed to parse AI response.');
  }

  return parsed;
}

export function getFallbackPeriodContent(userName = 'Настя'): PeriodModalContent {
  return {
    question: `Привет, ${userName}! Отметим дату, чтобы календарь знал, когда организм снова решил устроить премьеру без предупреждений?`,
    joke: {
      emoji: '🤹‍♀️',
      text: 'Если бы мой цикл был сериалом, он бы выставил всех героев на красную дорожку — одобряю гламур!',
    },
  };
}
