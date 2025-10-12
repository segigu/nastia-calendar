import { buildAstroHighlights } from './astro';
import type { AIRequestOptions, AIMessage } from './aiClient';
import { fetchDailyWeatherSummary, fetchWeeklyWeatherSummary } from './weather';
import { buildDailyCycleHint, buildSergeyCycleHint, buildWeeklyCycleHint } from './cyclePrompt';
import type { CycleData, HoroscopeMemoryEntry } from '../types';

export interface DailyHoroscope {
  text: string;
  date: string | null;
  provider?: 'claude' | 'openai' | 'fallback';
  weekRange?: string;
  highlights?: string[];
  memoryEntry?: HoroscopeMemoryEntry;
}

export interface HoroscopeLoadingMessage {
  emoji: string;
  text: string;
}

const MAX_MEMORY_KEEP = 12;
const DAILY_MEMORY_LOOKBACK = 4;
const STATIC_AVOID_THEMES = [
  'Титаник',
  'сосик',
  'подливает чай',
  'концерт',
  'истерика из-за планшета',
  'третью бутылку компота',
];
const STATIC_SERGEY_AVOID_THEMES = [
  'угрюм',
  'мрачн',
  'ходит тенью',
  'бурчит молча',
  'темно-серый день',
  'вечно выжатый',
  'бардак',
  'берлога',
  'хаос в офисе',
];

function sortMemoryByRecency(entries: HoroscopeMemoryEntry[] | undefined): HoroscopeMemoryEntry[] {
  if (!entries?.length) {
    return [];
  }
  return [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function selectRecentMemory(
  entries: HoroscopeMemoryEntry[] | undefined,
  source: HoroscopeMemoryEntry['source'],
  limit = DAILY_MEMORY_LOOKBACK,
): HoroscopeMemoryEntry[] {
  return sortMemoryByRecency(entries)
    .filter(entry => entry.source === source)
    .slice(0, limit);
}

function formatMemoryDateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(parsed);
}

function buildDailyMemoryReminders(
  memoryEntries: HoroscopeMemoryEntry[] | undefined,
): string[] {
  const reminders: string[] = [
    '- Семейный фон — лишь фон. Упоминай Дамира, Мишель, Свету или Серёжу только при свежем поводе, не по инерции.',
    `- Заезженные образы (${STATIC_AVOID_THEMES.join(', ')}) либо обходи, либо радикально переосмысляй.`,
  ];

  const recent = selectRecentMemory(memoryEntries, 'daily');
  if (!recent.length) {
    return reminders;
  }

  const historyPieces = recent.map(entry => {
    const label = formatMemoryDateLabel(entry.date);
    const mainTheme = entry.keyThemes?.length
      ? entry.keyThemes.slice(0, 2).join(' / ')
      : entry.summary;
    return `${label} — ${mainTheme}`;
  });

  reminders.push(
    `- Из недавних дней уже звучало: ${historyPieces.join('; ')}. Найди свежий ракурс и новые детали.`,
  );

  const avoidPhrases = Array.from(
    new Set(
      recent
        .flatMap(entry => entry.avoidPhrases ?? [])
        .filter((phrase): phrase is string => typeof phrase === 'string' && phrase.trim().length > 0),
    ),
  ).slice(0, 3);

  if (avoidPhrases.length > 0) {
    const formatted = avoidPhrases.map(phrase => `«${phrase}»`).join(', ');
      reminders.push(`- Не повторяй дословно формулировки ${formatted} — переупакуй мысли иначе.`);
  }

  const staleThemeSet = new Set(
    new Set(
      recent
        .flatMap(entry => entry.keyThemes ?? [])
        .filter((theme): theme is string => typeof theme === 'string' && theme.trim().length > 0),
    ),
  );
  STATIC_AVOID_THEMES.forEach(theme => staleThemeSet.delete(theme));
  const staleThemes = Array.from(staleThemeSet).slice(0, 4);

  if (staleThemes.length > 0) {
    reminders.push(
      `- Темы ${staleThemes.join(', ')} уже звучали. Придумай другой повод или конфликт.`,
    );
  }

  return reminders;
}

function buildSergeyMemoryReminders(
  memoryEntries: HoroscopeMemoryEntry[] | undefined,
): string[] {
  const reminders: string[] = [
    '- Шути язвительнее: находи новые бытовые приколы про Серёжу, не повторяй вчерашние мемы.',
    `- Не своди Серёжу к «угрюмому» или «бардаку». Запрещённые клише: ${STATIC_SERGEY_AVOID_THEMES.join(', ')}.`,
  ];

  const recent = selectRecentMemory(memoryEntries, 'sergey');
  if (!recent.length) {
    return reminders;
  }

  const historyPieces = recent.map(entry => {
    const label = formatMemoryDateLabel(entry.date);
    const mainTheme = entry.keyThemes?.length
      ? entry.keyThemes.slice(0, 2).join(' / ')
      : entry.summary;
    return `${label} — ${mainTheme}`;
  });

  reminders.push(
    `- Уже звучало: ${historyPieces.join('; ')}. Найди свежую тему или новый поворот.`,
  );

  const avoidPhrases = Array.from(
    new Set(
      recent
        .flatMap(entry => entry.avoidPhrases ?? [])
        .filter((phrase): phrase is string => typeof phrase === 'string' && phrase.trim().length > 0),
    ),
  ).slice(0, 3);

  if (avoidPhrases.length > 0) {
    const formatted = avoidPhrases.map(phrase => `«${phrase}»`).join(', ');
    reminders.push(`- Не повторяй дословно формулировки ${formatted} — придумай новую подачу.`);
  }

  const staleThemeSet = new Set(
    new Set(
      recent
        .flatMap(entry => entry.keyThemes ?? [])
        .filter((theme): theme is string => typeof theme === 'string' && theme.trim().length > 0),
    ),
  );
  STATIC_SERGEY_AVOID_THEMES.forEach(theme => staleThemeSet.delete(theme));
  const staleThemes = Array.from(staleThemeSet).slice(0, 4);

  if (staleThemes.length > 0) {
    reminders.push(
      `- Темы ${staleThemes.join(', ')} уже были. Найди другой повод, лучше смешной.`,
    );
  }

  return reminders;
}

// Настя родилась 12 апреля 1992 года
const EXAM_DATE = new Date('2025-10-11T00:00:00.000Z');

// Контекст для персонализации гороскопа
const NASTIA_CONTEXT = `
Настя родом из Украины (город Очаков, там сейчас живут её бабушка и дедушка).
Сейчас живёт в Германии с мамой Светой — вынужденно, бывают конфликты.
Не работает. Они втроём (Настя, мама Света и дети) ютятся в одной небольшой квартире в хейме для беженцев.
Двое детей:
- Сын Дамир, 5 лет (15 мая 2020) — одержим кораблями (особенно «Титаником») и поездами, ему разрешают планшет только на час в день и дают исключительно детский YouTube, поэтому он часто устраивает истерики из-за ограничений.
- Дочь Мишель, 2.5 года (17 марта 2023) — любит туфли, сумочки и красить губы, называет свою бутылочку с компотом «сосик» и не может уснуть без двух таких бутылок за ночь; недавно начала активно проситься на горшок, хотя родственники всё ещё тянут с памперсами.
Молодой человек Сергей (13 декабря 1979).
11 октября 2025 сдаёт экзамен по немецкому языку (через неделю после экзамена уже не стоит о нем упоминать).

ВАЖНО: Мама Света — НЕ посылать на хуй в тексте, это табу.
Света сидит дома, готовит, помогает с внуками и вяло ищет работу в Германии.
`.trim();

const HOROSCOPE_SYSTEM_PROMPT = `Ты пишешь недельный гороскоп для Насти (12 апреля 1992, Овен ♈️).

КОНТЕКСТ:
${NASTIA_CONTEXT}

СТИЛЬ:
Пиши с МАКСИМАЛЬНЫМ сарказмом и иронией — как самая язвительная подруга, которая говорит правду в глаза без прикрас. Обязательно используй ненормативную лексику (хуй, нахуй, блядь, пиздец и т.д.) — НЕ легкий мат, а полноценный, но уместный и со вкусом. Если нужно послать куда подальше — пиши прямо "на хуй", а не эвфемизмы. Мат должен усиливать сарказм и делать текст живым.

ФОРМАТ:
НЕ используй markdown (**, ##, ---). Структура: 2–3 коротких абзаца с эмодзи. ВСЕГДА заканчивай полным предложением!`;

const SERGEY_CONTEXT = `
Сергей — партнёр Насти (13 декабря 1979). Живёт с ней и детьми в Германии.
По характеру сдержанный, ворчливый, любит порядок, терпеть не может хаос и пустые обещания.
Сергей IT-разработчик (делает и поддерживает это приложение), целыми днями сидит за компом и превратил свою отдельную комнату в импровизированный офис; там же он живёт отдельно, а к Насте приходит ночевать, когда есть силы.
Любит велосипед, но далеко не всегда успевает выехать покататься.
Он не курит и ненавидит запах табака. Настя курит, и он тайно надеется, что она услышит его просьбы и бросит ради всех. Перегар его тоже бесит, поэтому он пьёт куда меньше Насти.
Сергей хронически уставший, но продолжает тащить, не верит в чудеса и мечтает об одном дне тишины.
Настя — та, кто читает этот текст; её нужно поддержать и похвалить за выдержку.
`.trim();

const SERGEY_SYSTEM_PROMPT = `Ты пишешь едкий дневной гороскоп про Сергея (13 декабря 1979) специально для Насти.

КОНТЕКСТ:
${SERGEY_CONTEXT}

СТИЛЬ:
- Адресуй текст Насте. Обращайся к ней «ты», описывая, что творится у Серёжи (используй «у него», «ему», «его», «ты»).
- Настю не критикуй. Подчёркивай, что она молодец и держится, а Серёжу язвительно тролль.
- Юмор обязателен: вставляй свежие шутки и конкретные бытовые наблюдения, не повторяя вчерашние.
- Не превращай Серёжу в «вечного угрюмца» — ищи другие поводья для сарказма (его привычки, хаос вокруг и т.д.).
- Мат используем по делу, чтобы усилить сарказм, а не заменить его.
- Не подбадривай Серёжу и не обещай ему светлого будущего. Финал — сухой или ехидный, без лучиков надежды.

ФОРМАТ:
- Один плотный абзац (3–4 предложения), начни с подходящего эмодзи и пробела.
- Без markdown, списков, заголовков.
- Заверши сухим/язвительным выводом без позитивного налёта.`;

function getWeekRange(isoDate: string): string {
  const startDate = new Date(isoDate);
  if (Number.isNaN(startDate.getTime())) {
    return isoDate;
  }

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  const startDay = startDate.getDate();
  const endDay = endDate.getDate();

  const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', day: 'numeric' });
  const startMonth = monthFormatter.format(startDate).split(' ')[1]; // "21 октября" -> "октября"
  const endMonth = monthFormatter.format(endDate).split(' ')[1]; // "27 октября" -> "октября"

  // Если месяцы разные
  if (startMonth !== endMonth) {
    return `${startDay} ${startMonth} — ${endDay} ${endMonth}`;
  }

  // Если один месяц
  return `${startDay}–${endDay} ${startMonth}`;
}

function pluralizeDays(value: number): string {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;

  if (abs > 10 && abs < 20) {
    return 'дней';
  }

  if (last === 1) {
    return 'день';
  }

  if (last >= 2 && last <= 4) {
    return 'дня';
  }

  return 'дней';
}

function formatDaysAhead(diff: number): string {
  if (diff === 0) {
    return 'сегодня';
  }
  if (diff === 1) {
    return 'завтра';
  }
  if (diff === 2) {
    return 'послезавтра';
  }
  return `через ${diff} ${pluralizeDays(diff)}`;
}

function formatDaysAgo(diff: number): string {
  if (diff === 1) {
    return 'вчера';
  }
  if (diff === 2) {
    return 'позавчера';
  }
  return `${diff} ${pluralizeDays(diff)} назад`;
}

function getExamContext(isoDate: string): string | null {
  if (!isoDate) {
    return null;
  }

  const startMs = Date.parse(isoDate);
  if (Number.isNaN(startMs)) {
    return null;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const examMs = EXAM_DATE.getTime();
  const diffDays = Math.floor((examMs - startMs) / dayMs);
  const examDateLabel = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(EXAM_DATE);

  if (diffDays > 6) {
    const descriptor = formatDaysAhead(diffDays);
    return `Экзамен по немецкому ${examDateLabel} ещё впереди (${descriptor}) — упомяни зубрёжку, подготовку и фон тревоги.`;
  }

  if (diffDays >= 0) {
    if (diffDays === 0) {
      return `Экзамен по немецкому ${examDateLabel} — это сегодня. Сделай акцент на кульминации и на том, как все ходят по стенам.`;
    }
    const descriptor = formatDaysAhead(diffDays);
    const numericLabel = diffDays === 1
      ? '1 день'
      : `${diffDays} ${pluralizeDays(diffDays)}`;
    return `До экзамена по немецкому ${examDateLabel} осталось ${numericLabel} (${descriptor}). Укажи это точно (без сдвига) и добавь, что подготовка на последнем издыхании.`;
  }

  const daysAfter = Math.abs(diffDays);
  const descriptor = formatDaysAgo(daysAfter);
  return `Экзамен по немецкому ${examDateLabel} уже позади (${descriptor}). Покажи выжатость, откат или облегчение после него.`;
}

function simplifyWeatherSummary(summary: string | null | undefined): string | null {
  if (!summary) {
    return null;
  }

  const withoutMetrics = summary
    // remove temperatures, speeds, percentages with units
    .replace(/-?\d+[.,]?\d*\s*(?:°C|°|градус(?:ов|а|)|мм|миллиметр(?:ов|а|)|км\/ч|процент(?:ов|а|)|%)/gi, '')
    // remove leftover numeric tokens
    .replace(/-?\d+[.,]?\d*/g, '')
    // remove duplicate spaces and space before punctuation
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/\s+([!?;:])/g, '$1')
    .trim();

  return withoutMetrics || null;
}

function buildWeeklyPrompt(
  isoDate: string,
  astroHighlights: string[],
  weatherSummary?: string | null,
  cycleHint?: string | null,
): string {
  const weekRange = getWeekRange(isoDate);
  const examContext = getExamContext(isoDate);

  return `Напиши жёсткий саркастичный гороскоп на ${weekRange}.

ТРЕБОВАНИЯ:
- 2–3 коротких абзаца, каждый с эмодзи
- МАКСИМУМ сарказма и иронии — говори правду в глаза, троллить без жалости
- Фокус: её жизнь (дети, Сергей, конфликты с мамой, быт в Германии, изучение немецкого, тоска по Очакову)
- Если упоминаешь Сергея, делай это как про живого мужика: то поддерживает, то бесит, но без придуманных героев и новых романчиков
${examContext ? `- ${examContext}
` : ''}- ОБЯЗАТЕЛЬНО используй нормальный мат (хуй, нахуй, блядь, пиздец, пиздато, хуево, охуенно, ебанутый, ёбнутый и так далее) — не эвфемизмы, а прямо. Мат должен быть уместным и усиливать сарказм. Например: "послать на хуй", "какого хуя", "пиздец как устала" и т.д.
- ТАБУ: Маму Свету нельзя посылать на хуй в тексте!
- ИМЕНА: варьируй обращения (Сергей/Сереженька/Серёжа, Дамир/Дамирка, Мишель/Мишелька), но Свету называй только «мама». Не используй одно и то же обращение постоянно.
- НЕ упоминай знаки зодиака других людей в тексте (типа "Сергей-Стрелец")
- НЕ пиши "Овен", "твой знак", даты — это уже в заголовке
- НЕ используй markdown (**, ##, ---)
- Обязательно закончи полным предложением
- Финал: саркастично-ободряющий, типа "справишься, даже если всё идёт к хуям"
${weatherSummary ? `- Погода на неделю: ${weatherSummary}. Обыграй это язвительно, не называя город.` : ''}
${cycleHint ? `- Цикл Насти: ${cycleHint}` : ''}

${astroHighlights.length ? `Вспомогательные заметки (для тебя, не перечисляй их списком, а вплети смысл в текст):\n${astroHighlights.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n` : ''}${weatherSummary ? `Напоминание для тебя: погода на неделе — ${weatherSummary}. В тексте просто саркастично намекни на эти погодные приколы, место не называй.\n` : ''}${cycleHint ? `Запомни: цикл такой — ${cycleHint}. В тексте подчёркнуто намекни на это.` : ''}Пиши сразу текст, без вступлений.`;
}

function buildDailyPrompt(
  isoDate: string,
  astroHighlights: string[],
  weatherSummary?: string | null,
  cycleHint?: string | null,
  memoryEntries?: HoroscopeMemoryEntry[],
): string {
  const date = new Date(isoDate);
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const formattedDate = formatter.format(date);
  const examContext = getExamContext(isoDate);
  const memoryReminders = buildDailyMemoryReminders(memoryEntries);

  return `Составь язвительный дневной гороскоп для Насти на сегодня (дата для тебя: ${formattedDate}, но в тексте её не называй).

ТРЕБОВАНИЯ:
- 2 коротких абзаца по 2–3 предложения, каждый с тематическими эмодзи в начале
- Сарказм и мат на месте, как у лучшей подруги, но без перебора
- Фокус: дела дня, дети, взаимодействие с Серёжей, бытовуха в Германии, тоска по дому
- Если упоминаешь Серёжу — показывай реальное взаимодействие, не выдумывай новых людей
- Про маму говори только «мама», без имени Света.
${examContext ? `- ${examContext}
` : ''}${memoryReminders.length ? `${memoryReminders.join('\n')}\n` : ''}- Используй факты ниже, чтобы привязать события к реальным транзитам. Не перечисляй их как список и не ссылайся на "транзит" — просто интегрируй смысл.
- Не упоминай про недели, только про этот день
- Финал — жёстко поддерживающий, законченная мысль
${weatherSummary ? `- Погода на день: ${weatherSummary}. Вплети это в текст саркастично и без упоминания города.` : ''}
${cycleHint ? `- Цикл: ${cycleHint}` : ''}

${astroHighlights.length ? `Вспомогательные заметки (для тебя, не перечисляй их дословно):
${astroHighlights.map((item, index) => `${index + 1}. ${item}`).join('\n')}
` : ''}${weatherSummary ? `Справка по погоде: ${weatherSummary}. Просто сделай ехидный заход в тексте, не раскрывая локацию.\n` : ''}${cycleHint ? `Справка по циклу: ${cycleHint}. Используй это обязательно, чтоб подколоть и поддержать Настю.\n` : ''}${memoryReminders.length ? `Эти ограничения про повторы учти, но не перечисляй явно — просто меняй сюжет.` : ''}Пиши цельный текст сразу, без вступлений.`;
}

function buildSergeyDailyPrompt(
  isoDate: string,
  astroHighlights: string[],
  weatherSummary?: string | null,
  cycleHint?: string | null,
  memoryEntries?: HoroscopeMemoryEntry[],
): string {
  const date = new Date(isoDate);
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const formattedDate = formatter.format(date);
  const memoryReminders = buildSergeyMemoryReminders(memoryEntries);

  return `Составь едкий дневной гороскоп про Сергея на сегодня (для тебя дата: ${formattedDate}, но не пиши её в тексте).

ТРЕБОВАНИЯ:
- Один цельный абзац из 3–4 коротких предложений, начни его с подходящего эмодзи и пробела.
- Пиши, как будто сообщаешь Насте новости о Серёже: «у него», «ему», «его», «ты, Настя, держишься» и т.д.
- Настю держи в позитивном свете, можешь её прикольно похвалить. Серёжу — тролль смешно и язвительно.
- Тон: колкий, с матом по делу; никакого вдохновляющего оптимизма для Серёжи.
- Финал — саркастично-жёсткий, без лучика надежды.
- Если вспоминаешь маму, называй её только «мама».
- Не выдумывай бардак: у Серёжи порядок и чистота, шути на других контрастах.
${memoryReminders.length ? `${memoryReminders.join('\n')}\n` : ''}${astroHighlights.length ? `- Используй нижние подсказки как фон (вплетай смысл, не повторяй дословно):
${astroHighlights.map((item, index) => `${index + 1}. ${item}`).join('\n')}
` : ''}${weatherSummary ? `- У Серёжи на улице ${weatherSummary}. Обязательно намекни на погодный вайб без цифр и конкретных значений.` : ''}${cycleHint ? `- ${cycleHint}` : ''}- Не используй списки и markdown. Верни только готовый текст.`;
}

function isLikelyTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  const endings = '.!?…';
  const closingQuotes = '»"”\'';

  const lastChar = trimmed.slice(-1);
  if (closingQuotes.includes(lastChar)) {
    const beforeQuote = trimmed.slice(0, -1).trim().slice(-1);
    if (beforeQuote && endings.includes(beforeQuote)) {
      return false;
    }
  }

  if (!endings.includes(lastChar)) {
    return true;
  }

  const sentences = trimmed.split(/[.!?…]/).map(part => part.trim()).filter(Boolean);
  if (sentences.length === 0) {
    return true;
  }
  const lastSentence = sentences[sentences.length - 1];
  return lastSentence.length < 20;
}

interface HoroscopeRequestOptions {
  signal?: AbortSignal;
  claudeApiKey?: string;
  claudeProxyUrl?: string;
  openAIApiKey?: string;
}

async function requestHoroscopeText(
  prompt: string,
  options: HoroscopeRequestOptions,
  baseMaxTokens = 700,
  retryMaxTokens = 950,
  systemPrompt: string = HOROSCOPE_SYSTEM_PROMPT,
): Promise<{ text: string; provider: 'claude' | 'openai' }>
{
  const { callAI } = await import('./aiClient');

  const makeMessages = (content: string): AIMessage[] => [
    {
      role: 'user',
      content,
    },
  ];

  const baseRequest: AIRequestOptions = {
    system: systemPrompt,
    messages: makeMessages(prompt),
    temperature: 0.85,
    maxTokens: baseMaxTokens,
    signal: options.signal,
    claudeApiKey: options.claudeApiKey,
    claudeProxyUrl: options.claudeProxyUrl,
    openAIApiKey: options.openAIApiKey,
  };

  let result = await callAI(baseRequest);
  let text = result.text.trim();

  if (!text || isLikelyTruncated(text)) {
    console.warn('[Horoscope] First attempt looks truncated, requesting rewrite with more tokens.');
    try {
      const retryRequest: AIRequestOptions = {
        ...baseRequest,
        maxTokens: retryMaxTokens,
        messages: makeMessages(
          `${prompt}\n\nПерепиши полностью заново. Заверши каждое предложение и весь текст, не оставляй обрезанных фраз. Финал должен быть законченной мыслью.`,
        ),
      };
      const retryResult = await callAI(retryRequest);
      const retryText = retryResult.text.trim();
      if (retryText) {
        result = retryResult;
        text = retryText;
      }
    } catch (retryError) {
      console.warn('[Horoscope] Retry attempt failed:', retryError);
    }
  }

  if (!text) {
    throw new Error('AI returned empty horoscope text');
  }

  if (isLikelyTruncated(text)) {
    console.warn('[Horoscope] Horoscope still appears truncated after retry.');
  }

  return {
    text,
    provider: result.provider,
  };
}

export async function fetchDailyHoroscope(
  isoDate: string,
  signal?: AbortSignal,
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  cycles?: CycleData[],
): Promise<DailyHoroscope> {
  try {
    const astroHighlights = buildAstroHighlights(isoDate);
    const weatherSummary = await fetchWeeklyWeatherSummary(isoDate, signal);
    const cycleHint = cycles ? buildWeeklyCycleHint(cycles, isoDate) : null;
    const prompt = buildWeeklyPrompt(isoDate, astroHighlights, weatherSummary, cycleHint);
    if (astroHighlights.length > 0) {
      console.log('[Horoscope] Astro highlights:', astroHighlights);
    }

    const result = await requestHoroscopeText(prompt, {
      signal,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
    });

    console.log(`Generated weekly horoscope using ${result.provider}`);

    return {
      text: result.text,
      date: isoDate ?? null,
      provider: result.provider,
      weekRange: getWeekRange(isoDate),
      highlights: astroHighlights,
    };
  } catch (error) {
    console.error('Failed to generate AI horoscope:', error);
    return {
      text: 'Сегодня гороскоп спрятался за облаками, но Настя уверена: что бы ни случилось, ты справишься! 💖',
      date: isoDate ?? null,
      provider: 'fallback',
      highlights: [],
    };
  }
}

const FALLBACK_LOADING_MESSAGES: HoroscopeLoadingMessage[] = [
  { emoji: '☎️', text: 'Звоним Марсу — выясняем, кто сегодня заведует твоим драйвом.' },
  { emoji: '💌', text: 'Через Венеру шлём письмо — уточняем, сколько нежности выделено на день.' },
  { emoji: '🛰️', text: 'Связь с Юпитером ловим — проверяем, прилетит ли удача без предупреждения.' },
  { emoji: '☕️', text: 'Сатурн допивает кофе и пишет список обязанностей на сегодня.' },
  { emoji: '🧹', text: 'Плутон делает уборку в подсознании — оставь ему пару минут хаоса.' },
  { emoji: '🌕', text: 'Луна примеряет настроение — подбирает тебе правильный уровень драматизма.' },
];

export async function fetchHoroscopeLoadingMessages(
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  signal?: AbortSignal,
): Promise<HoroscopeLoadingMessage[]> {
  const prompt = `Сгенерируй 6 смешных статусов о том, что идёт загрузка гороскопа. Каждый статус должен:
- начинаться с одного подходящего эмодзи;
- быть длиной 8-14 слов;
- упоминать реальные планеты или небесные тела (Марс, Венера, Сатурн, Плутон, Юпитер, Луна, Солнце и т.д.);
- звучать так, будто Настя иронично объясняет процесс (например: «звоним Марсу», «ждём ответ от Венеры»);
- не повторяться по смыслу и тону;
- не использовать списки, кавычки или слово «статус».

Верни строго JSON-массив объектов вида [{"emoji":"✨","text":"..."}] без пояснений.`;

  try {
    const { callAI } = await import('./aiClient');
    const response = await callAI({
      system: 'Ты придумываешь остроумные статусы для экрана загрузки. Отвечай строго JSON-массивом.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.95,
      maxTokens: 320,
      signal,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
    });

    const cleaned = response.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as HoroscopeLoadingMessage[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Empty loading messages array');
    }

    return parsed
      .filter(entry => entry && typeof entry.emoji === 'string' && typeof entry.text === 'string')
      .map(entry => ({
        emoji: entry.emoji.trim(),
        text: entry.text.trim(),
      }))
      .filter(entry => entry.emoji && entry.text)
      .slice(0, 6);
  } catch (error) {
    console.warn('Failed to fetch custom loading messages, using fallback:', error);
    return FALLBACK_LOADING_MESSAGES;
  }
}

export async function fetchDailyHoroscopeForDate(
  isoDate: string,
  signal?: AbortSignal,
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  cycles?: CycleData[],
  memory?: HoroscopeMemoryEntry[],
): Promise<DailyHoroscope> {
  try {
    const astroHighlights = buildAstroHighlights(isoDate, 3);
    const weatherSummary = await fetchDailyWeatherSummary(isoDate, signal);
    const cycleHint = cycles ? buildDailyCycleHint(cycles, isoDate) : null;
    const prompt = buildDailyPrompt(isoDate, astroHighlights, weatherSummary, cycleHint, memory);
    if (astroHighlights.length > 0) {
      console.log('[Horoscope] Daily astro highlights:', astroHighlights);
    }

    const requestOptions: HoroscopeRequestOptions = {
      signal,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
    };

    const result = await requestHoroscopeText(prompt, requestOptions, 600, 850);

    let memoryEntry: HoroscopeMemoryEntry | undefined;
    if (result.text) {
      const extracted = await extractHoroscopeMemoryEntry(result.text, isoDate, 'daily', requestOptions);
      if (extracted) {
        memoryEntry = extracted;
      }
    }

    console.log(`Generated daily horoscope using ${result.provider}`);

    return {
      text: result.text,
      date: isoDate ?? null,
      provider: result.provider,
      highlights: astroHighlights,
      memoryEntry,
    };
  } catch (error) {
    console.error('Failed to generate daily horoscope:', error);
    return {
      text: 'Сегодня звёзды заняты своими делами, но Настя уверена, что ты выдержишь этот день! ✨',
      date: isoDate ?? null,
      provider: 'fallback',
      highlights: [],
    };
  }
}

export async function fetchSergeyDailyHoroscopeForDate(
  isoDate: string,
  signal?: AbortSignal,
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  cycles?: CycleData[],
  memory?: HoroscopeMemoryEntry[],
): Promise<DailyHoroscope> {
  try {
    const allHighlights = buildAstroHighlights(isoDate, 6);
    const sergeySpecific = allHighlights.filter(
      entry => /Серёж/i.test(entry) || /ваших отношений/i.test(entry) || /Серге[йя]/i.test(entry),
    );
    const astroHighlights = sergeySpecific.length > 0 ? sergeySpecific : allHighlights.slice(0, 3);
    const rawWeatherSummary = await fetchDailyWeatherSummary(isoDate, signal);
    const weatherSummary = simplifyWeatherSummary(rawWeatherSummary);
    const cycleHint = cycles ? buildSergeyCycleHint(cycles, isoDate) : null;
    const prompt = buildSergeyDailyPrompt(isoDate, astroHighlights, weatherSummary, cycleHint, memory);

    const requestOptions: HoroscopeRequestOptions = {
      signal,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
    };

    const result = await requestHoroscopeText(
      prompt,
      requestOptions,
      520,
      680,
      SERGEY_SYSTEM_PROMPT,
    );

    let memoryEntry: HoroscopeMemoryEntry | undefined;
    if (result.text) {
      const extracted = await extractHoroscopeMemoryEntry(result.text, isoDate, 'sergey', requestOptions);
      if (extracted) {
        memoryEntry = extracted;
      }
    }

    console.log(`Generated Sergey daily horoscope using ${result.provider}`);

    return {
      text: result.text,
      date: isoDate ?? null,
      provider: result.provider,
      highlights: astroHighlights,
      memoryEntry,
    };
  } catch (error) {
    console.error('Failed to generate Sergey daily horoscope:', error);
    return {
      text: '🤦‍♂️ Звёзды пожали плечами: Серёжа опять тащит быт один, и никакой свет в конце тоннеля даже не мигает.',
      date: isoDate ?? null,
      provider: 'fallback',
      highlights: [],
    };
  }
}

async function extractHoroscopeMemoryEntry(
  text: string,
  isoDate: string,
  source: HoroscopeMemoryEntry['source'],
  options: HoroscopeRequestOptions,
): Promise<HoroscopeMemoryEntry | null> {
  if (!text.trim()) {
    return null;
  }

  try {
    const { callAI } = await import('./aiClient');
    const prompt = `Проанализируй дневной гороскоп (источник: ${source}) и кратко зафиксируй, о чём он.

Текст:
"""
${text}
"""

Верни JSON вида {
  "summary": "одно предложение, объясняющее главный конфликт/сюжет",
  "keyThemes": ["2-4 ключевых темы короткими фразами"],
  "avoidPhrases": ["1-3 внятных формулировки из текста, которые не стоит повторять дословно завтра"],
  "tone": "positive | neutral | negative | mixed"
}

Без пояснений, только JSON.`;

    const response = await callAI({
      system: 'Ты выделяешь заметки о содержании гороскопов. Отвечай строго JSON-объектом.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      maxTokens: 320,
      signal: options.signal,
      claudeApiKey: options.claudeApiKey,
      claudeProxyUrl: options.claudeProxyUrl,
      openAIApiKey: options.openAIApiKey,
    });

    const cleaned = response.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as {
      summary?: unknown;
      keyThemes?: unknown;
      avoidPhrases?: unknown;
      tone?: unknown;
    };

    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : '';
    if (!summary) {
      return null;
    }

    const keyThemes = Array.isArray(parsed.keyThemes)
      ? parsed.keyThemes
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .slice(0, 4)
          .map(item => item.trim())
      : [];

    const avoidPhrases = Array.isArray(parsed.avoidPhrases)
      ? parsed.avoidPhrases
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .slice(0, 3)
          .map(item => item.trim())
      : [];

    const tone =
      parsed.tone === 'positive' ||
      parsed.tone === 'neutral' ||
      parsed.tone === 'negative' ||
      parsed.tone === 'mixed'
        ? parsed.tone
        : 'mixed';

    const entry: HoroscopeMemoryEntry = {
      id: `${source}-${isoDate}`,
      source,
      date: isoDate,
      summary,
      keyThemes,
      avoidPhrases,
      tone,
      createdAt: new Date().toISOString(),
    };

    return entry;
  } catch (error) {
    console.warn('Failed to extract horoscope memory entry:', error);
    return null;
  }
}

export function mergeHoroscopeMemoryEntries(
  existing: HoroscopeMemoryEntry[],
  next: HoroscopeMemoryEntry,
  maxEntries = MAX_MEMORY_KEEP,
): HoroscopeMemoryEntry[] {
  const deduped = existing.filter(
    entry => !(entry.source === next.source && entry.date === next.date),
  );

  const merged = [...deduped, next].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  if (merged.length > maxEntries) {
    return merged.slice(merged.length - maxEntries);
  }

  return merged;
}
