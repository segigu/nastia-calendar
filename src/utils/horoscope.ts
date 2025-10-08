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
  // corsproxy.io - бесплатный CORS прокси
  return `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
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
  claudeApiKey?: string,
  openAIApiKey?: string,
  signal?: AbortSignal,
): Promise<string> {
  const { callAI } = await import('./aiClient');

  try {
    const result = await callAI({
      system: 'Ты переводчик гороскопов с лёгким женским сарказмом и юмором. Переведи текст на русский язык естественно, выразительно и с долей иронии. Добавь 2-3 подходящих эмодзи в ключевых местах текста, чтобы сделать его более живым и эмоциональным. Сохраняй общий смысл, но не бойся добавить чуточку дерзости и самоиронии. Отвечай только переводом с эмодзи, без дополнительных пояснений.',
      messages: [
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.8,
      maxTokens: 500,
      signal,
      claudeApiKey,
      openAIApiKey,
    });

    console.log(`Translated horoscope using ${result.provider}`);
    return result.text.trim();
  } catch (error) {
    console.warn('Failed to translate horoscope:', error);
    return text;
  }
}

export async function fetchDailyHoroscope(
  sign: string,
  isoDate: string,
  signal?: AbortSignal,
  claudeApiKey?: string,
  openAIApiKey?: string,
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

  // Переводим текст на русский, если передан хотя бы один API ключ
  if (claudeApiKey || openAIApiKey) {
    try {
      text = await translateToRussian(text, claudeApiKey, openAIApiKey, signal);
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
