export interface DailyHoroscope {
  text: string;
  date: string | null;
}

const HOROSCOPE_ENDPOINT = 'https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily';

function getHoroscopeUrl(sign: string, isoDate: string): string {
  const params = new URLSearchParams({
    sign: sign.toLowerCase(),
    day: isoDate,
  });
  const apiUrl = `${HOROSCOPE_ENDPOINT}?${params.toString()}`;

  // Всегда используем CORS прокси для обхода CORS ограничений
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`;
}

interface HoroscopeApiResponse {
  data?: {
    horoscope_data?: string;
    date?: string;
  };
  success?: boolean;
  status?: number;
}

function sanitizeHoroscopeText(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

async function translateToRussian(
  text: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      temperature: 0.8,
      system:
        'Ты переводчик гороскопов с лёгким женским сарказмом и юмором. Переведи текст на русский язык естественно, выразительно и с долей иронии. Добавь 2-3 подходящих эмодзи в ключевых местах текста, чтобы сделать его более живым и эмоциональным. Сохраняй общий смысл, но не бойся добавить чуточку дерзости и самоиронии. Отвечай только переводом с эмодзи, без дополнительных пояснений.',
      messages: [
        {
          role: 'user',
          content: text,
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Translation failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim() || text;
}

export async function fetchDailyHoroscope(
  sign: string,
  isoDate: string,
  signal?: AbortSignal,
  apiKey?: string,
): Promise<DailyHoroscope> {
  const url = getHoroscopeUrl(sign, isoDate);

  const response = await fetch(url, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch horoscope: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as HoroscopeApiResponse;
  let text = sanitizeHoroscopeText(payload?.data?.horoscope_data);
  const date = sanitizeHoroscopeText(payload?.data?.date);

  if (!text) {
    throw new Error('Horoscope payload missing text');
  }

  // Переводим текст на русский, если передан API ключ
  if (apiKey) {
    try {
      text = await translateToRussian(text, apiKey, signal);
    } catch (error) {
      console.warn('Failed to translate horoscope, using original text:', error);
      // Если перевод не удался, используем оригинальный текст
    }
  }

  return {
    text,
    date: date || null,
  };
}
