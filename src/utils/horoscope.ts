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

const SERGEY_FALLBACK_LEADS = [
  { emoji: '🪐', lead: 'Сатурн фыркает:' },
  { emoji: '🔥', lead: 'Марс хмурится:' },
  { emoji: '🌀', lead: 'Юпитер наблюдает:' },
  { emoji: '💋', lead: 'Венера ухмыляется:' },
  { emoji: '📡', lead: 'Меркурий шепчет:' },
  { emoji: '⚡️', lead: 'Уран моргает:' },
  { emoji: '🧊', lead: 'Нептун вздыхает:' },
  { emoji: '🧯', lead: 'Плутон щёлкает зажигалкой:' },
];

const SERGEY_FALLBACK_MIDDLES = [
  'Серёжа опять листает чаты',
  'Серёжа пишет план номер восемь',
  'Серёжа кивает с видом спасителя',
  'Серёжа отдирает стикеры без цели',
  'Серёжа устраивает совещание с зеркалом',
  'Серёжа проверяет отчёт, которого нет',
  'Серёжа тренирует вдохновенный взгляд',
  'Серёжа клянётся, что всё под контролем',
  'Серёжа настраивает презентацию ради вида',
  'Серёжа жонглирует дедлайнами как шариками',
  'Серёжа подписывает сам себе поручение',
  'Серёжа закрывает мемы одним глазом',
];

const SERGEY_FALLBACK_ENDINGS = [
  'Команда делает ставки молча',
  'Чаты уже ёрничают в фоне',
  'Кофемашина катит глаза',
  'HR заводит новую таблицу',
  'Принтер пишет мемуары фейлов',
  'Офис прячет смех по углам',
  'Дедлайны открывают попкорн',
  'Уборщица ставит галочку «повтор»',
  'Стена шепчет «ага, конечно»',
  'Часы считают до падения',
  'Стикеры дрожат от сарказма',
  'Соседний отдел снимает сторис',
];

const SERGEY_STATIC_FALLBACK: HoroscopeLoadingMessage[] = [
  { emoji: '🧯', text: 'Марс проверяет, чем тушить очередной пожар, пока Серёжа дышит на пепелище.' },
  { emoji: '🛠️', text: 'Сатурн выдал Серёже новые ключи — чинить то, что рухнуло за ночь.' },
  { emoji: '🧾', text: 'Меркурий переписывает список дел Серёжи, потому что прежний уже сгорел нахуй.' },
  { emoji: '🚬', text: 'Плутон подкуривает Серёже сигарету и шепчет, что отдохнуть всё равно не выйдет.' },
  { emoji: '📦', text: 'Юпитер навалил задач, пока Серёжа таскал коробки и матерился сквозь зубы.' },
];

const pickRandom = <T,>(values: T[]): T => values[Math.floor(Math.random() * values.length)];

export function getSergeyLoadingFallback(count = 10): HoroscopeLoadingMessage[] {
  const results: HoroscopeLoadingMessage[] = [];
  const usedCombos = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 25;

  while (results.length < count && attempts < maxAttempts) {
    attempts += 1;
    const lead = pickRandom(SERGEY_FALLBACK_LEADS);
    const middle = pickRandom(SERGEY_FALLBACK_MIDDLES);
    const ending = pickRandom(SERGEY_FALLBACK_ENDINGS);
    const key = `${lead.lead}|${middle}|${ending}`;
    if (usedCombos.has(key)) {
      continue;
    }
    usedCombos.add(key);
    const text = `${lead.lead} ${middle}. ${ending}.`.replace(/\s+/g, ' ').trim();
    results.push({ emoji: lead.emoji, text });
  }

  if (results.length < count) {
    const extra = [...SERGEY_STATIC_FALLBACK];
    while (results.length < count && extra.length > 0) {
      const candidate = extra.shift()!;
      results.push(candidate);
    }
    while (results.length < count) {
      results.push({
        emoji: pickRandom(SERGEY_FALLBACK_LEADS).emoji,
        text: 'Звёзды мигнули: Серёжа снова продаёт видимость порядка.',
      });
    }
  }

  return results;
}

export interface SergeyBannerCopy {
  title: string;
  subtitle: string;
  primaryButton: string;
  secondaryButton: string;
}

const MAX_MEMORY_KEEP = 12;
const DAILY_MEMORY_LOOKBACK = 4;
const STATIC_AVOID_THEMES = [
  'заезженное нытьё про погоду',
  'вечное "начну с понедельника"',
  'бесконечные списки дел',
  'пятую кружку кофе "без него не просыпаюсь"',
  'сериалы, которые обещали бросить',
  'жалобы на бессонницу как мантру',
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
  'снова мутит',
  'опять затевает',
  'очередной план',
  'снова что-то',
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
    '- Личные детали не мусоль без повода: держи фокус на сегодняшнем дне, ощущениях Насти и взаимодействии с Серёжей.',
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
    `- Запрещённые клише: ${STATIC_SERGEY_AVOID_THEMES.join(', ')}.`,
    '- НЕ повторяй имя «Серёжа» каждое предложение — используй местоимения «у него», «ему», «он».',
    '- НЕ используй шаблонные фразы про Настю типа «ты же, Настя, держишься молодцом» — либо не упоминай её вообще, либо естественно.',
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

// Контекст для персонализации гороскопа
const NASTIA_CONTEXT = `
Настя — пользователь приложения, уехала из родного города и живёт в Европе. Устала, но держится за счёт самоиронии и чёрного юмора.
Она ненавидит сахарные прогнозы и любит, когда говорят прямо, с матом и троллингом.
Главный близкий человек — партнёр Сергей (13 декабря 1979). Они тащат быт вместе, подкалывают друг друга и лавируют между заботой и раздражением.
Не выдумывай других родственников, детей, подруг и т.д. Если нет свежего повода — говори о текущих ощущениях, бытовых делах, планах, погоде, настроении.
`.trim();

const HOROSCOPE_SYSTEM_PROMPT = `Ты пишешь недельный гороскоп для Насти (12 апреля 1992, Овен ♈️).

КОНТЕКСТ:
${NASTIA_CONTEXT}

СТИЛЬ:
Пиши с МАКСИМАЛЬНЫМ сарказмом и иронией — как самая язвительная подруга, которая говорит правду в глаза без прикрас. Обязательно используй ненормативную лексику (хуй, нахуй, блядь, пиздец и т.д.) — НЕ легкий мат, а полноценный, но уместный и со вкусом. Если нужно послать куда подальше — пиши прямо "на хуй", а не эвфемизмы. Мат должен усиливать сарказм и делать текст живым.

ФОРМАТ:
НЕ используй markdown (**, ##, ---). Структура: 2–3 коротких абзаца с эмодзи. ВСЕГДА заканчивай полным предложением!`;

const SERGEY_CONTEXT = `
Сергей — партнёр Насти (13 декабря 1979). Живёт вместе с ней в Европе, работает в IT и поддерживает это приложение.
Он перфекционист, любит порядок, списки дел и контроль. Хаос и пустые обещания выводят его из себя.
У Серёжи отдельный «офис» в квартире: он там зарывается в задачи, пьёт литры кофе и мечтает о тишине.
Любит велосипед, но редко выбирается кататься. Не курит и ненавидит перегар, поэтому часто троллит Настю за её привычки.
Сергей вечно уставший, однако продолжает тащить всё на себе. Настю в тексте поддерживай, Серёжу саркастично подначивай.
`.trim();

const SERGEY_SYSTEM_PROMPT = `Ты пишешь едкий дневной гороскоп про Сергея (13 декабря 1979) специально для Насти.

КОНТЕКСТ:
${SERGEY_CONTEXT}

СТИЛЬ:
- Адресуй текст Насте, но НЕ используй шаблонные фразы типа «ты же, Настя, держишься молодцом».
- Настю упоминай ВАРИАТИВНО и естественно: можно вскользь поддержать или вообще не упоминать, если нет повода.
- Про Серёжу пиши в третьем лице: «у него», «ему», «его», «он». НЕ повторяй имя «Серёжа» слишком часто — используй местоимения.
- Юмор обязателен: вставляй свежие шутки и конкретные бытовые наблюдения, не повторяя вчерашние.
- Не превращай Серёжу в «вечного угрюмца» — ищи другие поводья для сарказма (его привычки, перфекционизм, кофе, офис и т.д.).
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

  return `Напиши жёсткий саркастичный гороскоп на ${weekRange}.

ТРЕБОВАНИЯ:
- 2–3 коротких абзаца, каждый с эмодзи
- МАКСИМУМ сарказма и иронии — говори правду в глаза, троллить без жалости
- Фокус: её настроение, бытовые задачи, планы, взаимодействие с Серёжей и собственным телом/циклами.
- Если упоминаешь Сергея, делай это как про живого мужика: то поддерживает, то бесит, без придуманной драмы и новых персонажей.
- ОБЯЗАТЕЛЬНО используй нормальный мат (хуй, нахуй, блядь, пиздец, пиздато, хуёво, охуенно, ебанутый, ёбнутый и так далее) — не эвфемизмы, а прямо. Мат должен быть уместным и усиливать сарказм. Например: "послать на хуй", "какого хуя", "пиздец как устала" и т.д.
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
  const memoryReminders = buildDailyMemoryReminders(memoryEntries);

  return `Составь язвительный дневной гороскоп для Насти на сегодня (дата для тебя: ${formattedDate}, но в тексте её не называй).

ТРЕБОВАНИЯ:
- 2 коротких абзаца по 2–3 предложения, каждый с тематическими эмодзи в начале
- Сарказм и мат на месте, как у лучшей подруги, но без перебора
- Фокус: дела дня, настроение, взаимодействие с Серёжей, бытовая рутина и тело.
- Если упоминаешь Серёжу — показывай реальное взаимодействие, не выдумывай новых людей и драм.
${memoryReminders.length ? `${memoryReminders.join('\n')}\n` : ''}- Используй факты ниже, чтобы привязать события к реальным транзитам. Не перечисляй их как список и не ссылайся на "транзит" — просто интегрируй смысл.
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
- Пиши для Насти, про Серёжу в ТРЕТЬЕМ ЛИЦЕ: «у него», «ему», «его», «он». НЕ повторяй имя «Серёжа» каждое предложение — используй местоимения после первого упоминания.
- Настю упоминай ТОЛЬКО если есть естественный повод, БЕЗ шаблонных фраз типа «ты же, Настя, держишься молодцом». Можно вообще не упоминать, если гороскоп только про него.
- Тон: колкий, с матом по делу; никакого вдохновляющего оптимизма для Серёжи.
- Финал — саркастично-жёсткий, без лучика надежды.
- Не придумывай новых родственников и детей — достаточно Серёжи и его бытовых миссий.
- Не выдумывай бардак: у Серёжи порядок и чистота, шути на других контрастах (перфекционизм, кофе, офис, велосипед, контроль).
${memoryReminders.length ? `${memoryReminders.join('\n')}\n` : ''}${astroHighlights.length ? `- Используй нижние подсказки как фон (вплетай смысл, не повторяй дословно):
${astroHighlights.map((item, index) => `${index + 1}. ${item}`).join('\n')}
` : ''}${weatherSummary ? `- У него на улице ${weatherSummary}. Обязательно намекни на погодный вайб без цифр и конкретных значений.` : ''}${cycleHint ? `- ${cycleHint}` : ''}- Не используй списки и markdown. Верни только готовый текст.`;
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

export async function fetchSergeyLoadingMessages(
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  signal?: AbortSignal,
): Promise<HoroscopeLoadingMessage[]> {
  const prompt = `Сгенерируй 10 язвительных статусов для загрузки гороскопа Серёжи.
Правила для КАЖДОГО статуса:
- начинается с одного подходящего эмодзи и пробела;
- одно ёмкое предложение (12–20 слов), БЕЗ точек внутри, БЕЗ переносов строк;
- саркастично намекает, что Серёжа снова притворяется продуктивным (с отсылками к планетам, космосу, небесной бюрократии);
- допускается лёгкий мат типа «нахрена», но избегай жёсткой брани;
- все статусы различаются смыслом и образами;
- ВАЖНО: весь текст в одну строку, БЕЗ переносов, все кавычки внутри текста должны быть экранированы.

Верни ТОЛЬКО валидный JSON-массив вида [{"emoji":"✨","text":"..."}] БЕЗ markdown, БЕЗ пояснений, БЕЗ переносов строк внутри text.`;

  try {
    const { callAI } = await import('./aiClient');
    const response = await callAI({
      system: 'Ты язвительно объясняешь, почему гороскоп Серёжи ещё грузится. Отвечай только JSON.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      maxTokens: 600,
      signal,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
    });

    let cleaned = response.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Дополнительная очистка: убрать переносы строк внутри JSON
    cleaned = cleaned.replace(/\n/g, ' ').replace(/\r/g, '');

    const parsed = JSON.parse(cleaned) as HoroscopeLoadingMessage[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Empty Sergey loading messages array');
    }

    return parsed
      .filter(entry => entry && typeof entry.emoji === 'string' && typeof entry.text === 'string')
      .map(entry => ({
        emoji: entry.emoji.trim(),
        text: entry.text.replace(/\s+/g, ' ').trim(),
      }))
      .filter(entry => entry.emoji && entry.text)
      .slice(0, 10);
  } catch (error) {
    console.warn('Failed to fetch Sergey loading messages, using fallback:', error);
    return getSergeyLoadingFallback();
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

const SERGEY_BANNER_SYSTEM_PROMPT = `Ты — язвительная копирайтерша, которая помогает Насте формулировать карточку про Серёжу. Отвечай легко, по-современному и без пафоса.`;

function buildSergeyBannerPrompt(
  isoDate: string,
  memoryEntries?: HoroscopeMemoryEntry[],
): string {
  const parsedDate = new Date(isoDate);
  const formattedDate = Number.isNaN(parsedDate.getTime())
    ? 'сегодня'
    : new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
      }).format(parsedDate);

  const memoryReminders = buildSergeyMemoryReminders(memoryEntries);
  const remindersSection = memoryReminders.length
    ? `Дополнительные подсказки по тону и темам:\n${memoryReminders.join('\n')}\n`
    : '';

  return `Нужно обновить тексты карточки «Что там у Серёжи?» на ${formattedDate}.

Дай четыре короткие фразы с тем же смыслом, но в новых формулировках:
- title — вопрос на 4-7 слов с интригой вроде «А что там у Серёжи?» (оставь имя Серёжи в любом падеже).
- subtitle — одно плотное предложение (до 22 слов) с лёгким сарказмом про сегодняшний день; БЕЗ клише типа «снова мутит», «опять затевает», «гороскоп всё расскажет», «узнаем правду». Придумай свежую формулировку про то, что происходит у него сегодня (например: «Кажется, сегодня он готов переделать...», «У него такой день, когда...», «Есть подозрение, что планы...»).
- primaryButton — 2-3 слова, призыв заглянуть в гороскоп.
- secondaryButton — 1-2 слова, играющая отмазка в духе «Мне пофиг».

Правила:
- Разговорный русский, можно лёгкий сарказм, но без мата и оскорблений.
- Никаких эмодзи и кавычек.
- Подписи на кнопках без точки на конце.
- Подзаголовок про сегодняшний день, но БЕЗ повторяющихся шаблонов.
- Не упоминай прямо Настю и не обращайся к читательнице на «ты» — делай формулировки обезличенными («Кажется, Серёжа…», «Есть подозрение, что…»).
${remindersSection}Верни ровно одну строку JSON без комментариев:
{"title":"...","subtitle":"...","primaryButton":"...","secondaryButton":"..."}
`;
}

export async function fetchSergeyBannerCopy(
  isoDate: string,
  signal?: AbortSignal,
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  memory?: HoroscopeMemoryEntry[],
): Promise<SergeyBannerCopy> {
  const prompt = buildSergeyBannerPrompt(isoDate, memory);

  try {
    const { callAI } = await import('./aiClient');
    const response = await callAI({
      system: SERGEY_BANNER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.75,
      maxTokens: 220,
      signal,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
    });

    const cleaned = response.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<SergeyBannerCopy>;

    const normalize = (value: unknown): string =>
      typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

    const result: SergeyBannerCopy = {
      title: normalize(parsed.title),
      subtitle: normalize(parsed.subtitle),
      primaryButton: normalize(parsed.primaryButton),
      secondaryButton: normalize(parsed.secondaryButton),
    };

    if (!result.title || !result.subtitle || !result.primaryButton || !result.secondaryButton) {
      throw new Error('Sergey banner copy is incomplete');
    }

    console.log('[Horoscope] Generated Sergey banner copy using', response.provider);
    return result;
  } catch (error) {
    console.error('Failed to fetch Sergey banner copy:', error);
    throw error instanceof Error ? error : new Error(String(error));
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
