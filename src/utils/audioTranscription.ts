export interface AudioTranscriptionOptions {
  /**
   * Optional OpenAI API key if requests go directly to OpenAI.
   */
  openAIApiKey?: string;
  /**
   * Optional proxy URL; if provided, auth headers are skipped.
   */
  openAIProxyUrl?: string;
  /**
   * Expected language hint (two-letter or BCP-47 code).
   */
  language?: string;
  /**
   * Abort controller signal.
   */
  signal?: AbortSignal;
}

interface OpenAITranscriptionResponse {
  text?: string;
  transcript?: string;
  segments?: Array<{ text?: string }>;
  data?: Array<{ text?: string }>;
}

/**
 * Sends an audio blob to Whisper (or compatible) transcription endpoint and
 * returns the decoded text. Supports optional proxy URL that mirrors OpenAI API.
 */
export async function transcribeAudioBlob(
  audio: Blob,
  {
    openAIApiKey,
    openAIProxyUrl,
    language,
    signal,
  }: AudioTranscriptionOptions = {},
): Promise<string> {
  if (!audio || audio.size === 0) {
    throw new Error('Пустая аудиозапись — нечего распознавать.');
  }

  const baseUrl = (openAIProxyUrl || '').trim().replace(/\/$/, '');
  const trimmedKey =
    (openAIApiKey || '').trim() || (process.env.REACT_APP_OPENAI_API_KEY || '').trim();

  interface EndpointCandidate {
    url: string;
    kind: 'proxy' | 'direct';
  }

  const candidates: EndpointCandidate[] = [];

  if (baseUrl) {
    let proxyEndpoint: string;
    if (/audio\/transcriptions$/i.test(baseUrl)) {
      proxyEndpoint = baseUrl;
    } else if (/chat\/completions$/i.test(baseUrl)) {
      proxyEndpoint = baseUrl.replace(/chat\/completions$/i, 'audio/transcriptions');
    } else {
      proxyEndpoint = `${baseUrl}/audio/transcriptions`;
    }
    candidates.push({ url: proxyEndpoint, kind: 'proxy' });
  }

  if (!baseUrl || trimmedKey.length > 0) {
    candidates.push({
      url: 'https://api.openai.com/v1/audio/transcriptions',
      kind: 'direct',
    });
  }

  if (candidates.length === 0) {
    throw new Error('Нет подходящего эндпоинта для распознавания аудио.');
  }

  const createFormData = () => {
    const form = new FormData();
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('temperature', '0');
    form.append('response_format', 'json');
    if (language) {
      form.append('language', language);
    }
    form.append('file', audio, 'voice.webm');
    return form;
  };

  let lastError: string | null = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const { url, kind } = candidates[index];
    const headers: Record<string, string> = {};

    if (kind === 'direct') {
      if (trimmedKey.length === 0) {
        continue;
      }
      headers.Authorization = `Bearer ${trimmedKey}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: createFormData(),
        headers,
        signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const message = `Ошибка распознавания аудио (${response.status}): ${errorBody || 'пустой ответ'}`;

        if (kind === 'proxy' && trimmedKey.length > 0 && index < candidates.length - 1) {
          console.warn('[AudioTranscription] Proxy failed, falling back to direct API:', message);
          lastError = message;
          continue;
        }

        throw new Error(message);
      }

      let data: OpenAITranscriptionResponse;
      try {
        data = (await response.json()) as OpenAITranscriptionResponse;
      } catch (error) {
        throw new Error('Не удалось разобрать ответ сервера распознавания.');
      }

      const text =
        data.text ??
        data.transcript ??
        data.segments?.map(segment => segment?.text ?? '').join(' ') ??
        data.data?.map(entry => entry?.text ?? '').join(' ');

      if (!text || text.trim().length === 0) {
        throw new Error('Кажется, запись получилась без звука. Попробуй сказать вариант вслух или перезаписать.');
      }

      return text.trim();
    } catch (error) {
      if (error instanceof Error) {
        lastError = error.message;
      } else {
        lastError = 'Неизвестная ошибка распознавания аудио.';
      }

      if (index === candidates.length - 1) {
        throw new Error(lastError);
      }
      console.warn('[AudioTranscription] Retry with next endpoint after error:', lastError);
    }
  }

  throw new Error(lastError ?? 'Не удалось распознать аудио.');
}
