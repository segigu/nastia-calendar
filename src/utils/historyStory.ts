import { callAI, type AIMessage } from './aiClient';
import {
  ASTRO_PROFILES,
  PRIMARY_PROFILE_ID,
  type AstroProfile,
} from '../data/astroProfiles';
import {
  buildNatalChartAnalysis,
  type NatalChartAnalysis,
} from './astro';

export interface HistoryStoryOption {
  id: string;
  title: string;
  description: string;
}

export interface HistoryStoryMeta {
  author: string;
  genre: string;
  contract: string;
  arcLimit: number;
}

export interface HistoryStoryNodeInfo {
  arc: number;
  stage: string;
  scene: string;
}

export interface HistoryStoryFinale {
  resolution: string;
  humanInterpretation: string;
  astrologicalInterpretation: string;
}

export interface HistoryStoryResponse {
  meta?: HistoryStoryMeta;
  node?: HistoryStoryNodeInfo;
  options: HistoryStoryOption[];
  finale?: HistoryStoryFinale;
}

export interface HistoryStoryContextSegment {
  /**
   * Text that has already been shown to the user.
   */
  text: string;
  /**
   * Arc number associated with this segment.
   */
  arc: number;
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
   * Total number of arcs expected in the story.
   */
  arcLimit: number;
  /**
   * Generation mode: either next arc or finale.
   */
  mode: 'arc' | 'finale';
  /**
   * Arc number that should be produced (required for arc mode).
   */
  currentArc?: number;
  /**
   * Previously established story contract, if any.
   */
  contract?: string;
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

const STORY_STAGE_NAMES = [
  'Погружение',
  'Конфликт',
  'Отражение',
  'Испытание',
  'Поворот',
  'Финал',
] as const;

const STORY_STAGE_GUIDANCE: Record<string, string> = {
  Погружение: 'Брось читателя в сцену без объяснений; сделай ощущение странности и телесной вовлечённости.',
  Конфликт: 'Выведи на поверхность внутреннюю дилемму и покажи, как она распирает изнутри.',
  Отражение: 'Столкни героиню с образом или персонажем, которые зеркалят её состояние.',
  Испытание: 'Поставь выбор между иллюзией и ясностью, усили конфликт желаний.',
  Поворот: 'Покажи действие, которое запускает цепь последствий; сделай ставки ощутимыми.',
  Финал: 'Доведите напряжение до кульминации: принятие, потеря или трансформация без побега.',
};

const CONTEXT_LIMIT = 4;

const FALLBACK_OPTIONS: [HistoryStoryOption, HistoryStoryOption] = [
  {
    id: 'open-the-door',
    title: 'Приоткрыть дверь',
    description: 'Ты решаешь проверить источник света, задерживая дыхание.',
  },
  {
    id: 'hide-in-shadow',
    title: 'Раствориться в тени',
    description: 'Ты скользишь к стене, надеясь исчезнуть прежде, чем свет заметит тебя.',
  },
];

const DEFAULT_CONTRACT = 'Смогу ли я сохранить себя, когда всё вокруг требует подстроиться?';

const DEFAULT_SCENE =
  'Ты вырываешься из сна, понимая, что комната чужая, а окна заколочены. В воздухе пахнет озоном и мокрыми стенами, как после грозы, которой никто не слышал. Перед тобой дрожит синеватый свет, а тень за спиной будто решила жить своей жизнью. Ты не знаешь, в какой момент всё пошло иначе, но выбора больше нет.';

const DEFAULT_RESOLUTION =
  'Ты задерживаешь взгляд на синеватом свете и делаешь шаг вперёд. Воздух густеет, но вместо страха приходит ясность: комната — не ловушка, а зеркало твоих решений. Ты трогаешь заколоченное окно, слышишь скрип досок и понимаешь, что снаружи нет готового ответа. Есть только ты и то, что решишь открыть.';

const DEFAULT_HUMAN_INTERPRETATION =
  'Твой выбор остановиться и посмотреть на свет показывает твою природную смелость — ты не убегаешь от неизвестного, а идёшь навстречу, даже когда страшно. Эта черта свойственна твоему характеру: ты предпочитаешь ясность, даже если она болезненна, а не иллюзию безопасности. На каждом этапе ты выбирала честность перед собой, а не удобную ложь. В финале ты приняла реальность такой, какая она есть — потому что в глубине души ты доверяешь себе больше, чем внешним обещаниям.';

const DEFAULT_ASTROLOGICAL_INTERPRETATION =
  'Твой выбор двигаться к свету на первом этапе объясняется Солнцем в Раке в 4-м доме (потребность докопаться до корня, понять суть происходящего), хотя квадрат Сатурна создавал внутренний страх осуждения. Луна в Близнецах дала тебе быструю реакцию и любопытство на втором и третьем этапах — ты исследовала варианты, а не застывала в страхе. На четвёртом этапе квадрат Сатурна к Луне проявился как внутренний контроль и осторожность в выборе. Венера в Деве в 6-м доме толкнула тебя к порядку даже в хаосе — ты искала структуру и смысл. В финале твой выбор принять правду отражает зрелость Сатурна — ты научилась брать ответственность, а не бежать от реальности.';

const NASTIA_PROFILE = ASTRO_PROFILES[PRIMARY_PROFILE_ID];
const NASTIA_CHART_ANALYSIS = buildNatalChartAnalysis(PRIMARY_PROFILE_ID);
const BIRTH_DATA_TEXT = serializeBirthData(NASTIA_PROFILE);
const CHART_ANALYSIS_TEXT = serializeChartAnalysis(NASTIA_CHART_ANALYSIS);

function serializeBirthData(profile: AstroProfile): string {
  const locationNote = profile.notes?.split('(')[0]?.trim() ?? 'Тикси, Россия';
  const time = profile.birthTime ?? '12:00';
  return `{
  "date": "${profile.birthDate}",
  "time": "${time}",
  "timezone": "${profile.timeZone}",
  "location": "${locationNote}",
  "latitude": ${profile.latitude},
  "longitude": ${profile.longitude}
}`;
}

function serializeChartAnalysis(analysis: NatalChartAnalysis): string {
  const formatSection = (label: string, values: string[]): string => {
    if (!values.length) {
      return `${label}: []`;
    }
    return `${label}:\n- ${values.join('\n- ')}`;
  };

  return [
    formatSection('core_placements', analysis.corePlacements),
    formatSection('hard_aspects', analysis.hardAspects),
    formatSection('soft_aspects', analysis.softAspects),
  ].join('\n');
}

function indent(text: string, spaces = 2): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map(line => (line.length ? pad + line : line))
    .join('\n');
}

function getStageName(arc: number, arcLimit: number): string {
  const index = Math.max(0, Math.min(STORY_STAGE_NAMES.length - 1, arc - 1));
  return STORY_STAGE_NAMES[index] ?? STORY_STAGE_NAMES[STORY_STAGE_NAMES.length - 1];
}

function getStageGuidance(stage: string): string {
  return STORY_STAGE_GUIDANCE[stage] ?? '';
}

function buildStorySoFar(
  segments: HistoryStoryContextSegment[],
  arcLimit: number,
  summary?: string,
): string {
  if (!segments.length) {
    return 'История ещё не началась.';
  }

  const recentSegments = segments.slice(-CONTEXT_LIMIT);

  const parts = recentSegments.map(segment => {
    const stage = getStageName(segment.arc, arcLimit);
    const choiceLine = segment.optionTitle
      ? `Выбор: «${segment.optionTitle}»${
          segment.optionDescription ? ` (${segment.optionDescription})` : ''
        }.`
      : 'Начальный фрагмент.';
    return `Arc ${segment.arc} — ${stage}.\n${choiceLine}\nСцена:\n${segment.text}`;
  });

  if (summary && summary.trim().length > 0) {
    return `${summary.trim()}\n\n${parts.join('\n\n')}`;
  }

  return parts.join('\n\n');
}

function buildInputDataBlock(genre: string, arcLimit: number): string {
  return `🔹 ВХОДНЫЕ ДАННЫЕ

user_name: ${NASTIA_PROFILE.name}
birth_data:
${indent(BIRTH_DATA_TEXT, 2)}
chart_analysis:
${indent(CHART_ANALYSIS_TEXT, 2)}
story_genre: ${genre}
arc_limit: ${arcLimit}
language: ru`;
}

interface ArcPromptArgs {
  segments: HistoryStoryContextSegment[];
  currentChoice?: HistoryStoryOption;
  summary?: string;
  author: HistoryStoryAuthorStyle;
  arcLimit: number;
  currentArc: number;
  contract?: string;
}

function buildArcPrompt(args: ArcPromptArgs): string {
  const {
    segments,
    currentChoice,
    summary,
    author,
    arcLimit,
    currentArc,
    contract,
  } = args;

  const stage = getStageName(currentArc, arcLimit);
  const stageGuidance = getStageGuidance(stage);
  const storyContext = buildStorySoFar(segments, arcLimit, summary);

  const choiceInstruction = currentChoice
    ? `Учитывай, что предыдущий выбор Насти: «${currentChoice.title}»${
        currentChoice.description ? ` (${currentChoice.description})` : ''
      }.`
    : 'Это первый узел — начинай без пояснений, сразу в действие.';

  const contractInstruction = contract
    ? `Контракт истории уже задан: «${contract}». Сохраняй формулировку без изменений и напоминай себе о нём при создании сцен.`
    : 'Сформулируй контракт истории — понятный человеческий вопрос о внутреннем конфликте личности (до 90 символов). Например: "Смогу ли я быть собой, когда все ждут от меня другого?", "Как найти баланс между своими желаниями и чужими ожиданиями?". НЕ используй абстрактные философские формулировки. Используй этот контракт на всех узлах.';

  return `${buildInputDataBlock(author.genre, arcLimit)}

🔹 ПРОМПТ (ядро для модели)

Создай персональную интерактивную историю в жанре ${author.genre}.
Основывай тему и конфликт на ключевых аспектах натальной карты пользователя Насти:
chart_analysis подключён выше — используй соответствующие мотивы и напряжения.
Авторский стиль: ${author.stylePrompt}

Героиня — женщина, имя не упоминается.
Повествование ведётся от второго лица («ты»).

Структура истории:
1. Погружение — стартовая сцена без объяснений.
2. Конфликт — столкновение с внутренней дилеммой.
3. Отражение — встреча с символом себя.
4. Испытание — выбор между иллюзией и ясностью.
5. Поворот — действие с последствиями.
6. Финал — принятие, потеря или трансформация.

Сейчас нужно создать узел ${currentArc} из ${arcLimit} — «${stage}».
Фокус этого узла: ${stageGuidance}
${choiceInstruction}
${contractInstruction}

Контекст истории:
${storyContext}

Требования к сцене:
- один абзац из 3–5 предложений (55–85 слов), кинематографичный, ощутимый;
- используй конкретные детали, основанные на мотивах из chart_analysis;
- оставь тайну, не раскрывай полностью происходящее;
- завершай ощущением, что впереди развилка.

После сцены подготовь два контрастных варианта выбора (без клише «продолжить»):
- title — до 32 символов;
- description — одно предложение до 90 символов.

Ответь строго в формате JSON:
{
  "meta": {
    "author": "${author.name}",
    "genre": "${author.genre}",
    "contract": "строка",
    "arc_limit": ${arcLimit}
  },
  "node": {
    "arc": ${currentArc},
    "stage": "${stage}",
    "scene": "абзац истории"
  },
  "choices": [
    { "id": "уникальный-kebab-case", "title": "…", "description": "…" },
    { "id": "уникальный-kebab-case", "title": "…", "description": "…" }
  ]
}

Не добавляй пояснений, комментариев, Markdown и эмодзи.`;
}

interface FinalePromptArgs {
  segments: HistoryStoryContextSegment[];
  currentChoice?: HistoryStoryOption;
  summary?: string;
  author: HistoryStoryAuthorStyle;
  arcLimit: number;
  contract?: string;
}

function buildFinalePrompt(args: FinalePromptArgs): string {
  const {
    segments,
    currentChoice,
    summary,
    author,
    arcLimit,
    contract,
  } = args;

  const storyContext = buildStorySoFar(segments, arcLimit, summary);

  const choiceInstruction = currentChoice
    ? `Это итоговый выбор Насти: «${currentChoice.title}»${
        currentChoice.description ? ` (${currentChoice.description})` : ''
      }. Построй развязку как прямое последствие этого шага.`
    : 'Считай, что итоговый выбор сделан в пользу ясности — покажи последствия.';

  const contractInstruction = contract
    ? `Контракт истории: «${contract}». Придерживайся его тона в развязке.`
    : 'Сформулированный тобой контракт должен проявиться в выводах финала.';

  return `${buildInputDataBlock(author.genre, arcLimit)}

🔹 ПРОМПТ (ядро для модели)

Ты завершишь интерактивную историю для Насти.
${contractInstruction}
${choiceInstruction}
Удерживай авторский стиль: ${author.stylePrompt}

Контекст истории:
${storyContext}

Сформируй финальный блок:
- resolution — один абзац из 3–5 предложений (60–90 слов), который завершает сюжет, показывает последствия выбора и закрывает напряжение;

- human_interpretation — анализ на человеческом языке (4–6 предложений) с ОБЯЗАТЕЛЬНЫМ объяснением:
  1. ПОЧЕМУ ты сделала именно такие выборы на ключевых этапах истории — объясни мотивацию через черты характера
  2. Какие особенности твоей личности проявились в этих решениях (например: склонность к самозащите, любопытство, потребность в контроле, доверие интуиции)
  3. Что в твоем характере определяет такую реакцию на жизненный контракт
  4. НЕ используй астрологические термины (без упоминания планет, домов, аспектов)
  5. Говори о чертах характера, свойственных ЭТОЙ натальной карте, ЭТОЙ личности

  Пример формулировки: "Твой выбор спрятаться на первом этапе показывает твою природную осторожность и склонность сначала оценить ситуацию, прежде чем действовать. Эта черта свойственна твоему характеру — ты не бросаешься в неизвестность, а ищешь безопасность. Но на третьем этапе ты решила открыть дверь — здесь проявилось твоё любопытство и жажда нового, которые всегда живут внутри, даже когда страшно. В финале ты приняла ситуацию, потому что в глубине души ты умеешь брать ответственность и не бежать от правды."

- astrological_interpretation — детальный анализ на астрологическом языке (4–7 предложений) с ОБЯЗАТЕЛЬНЫМ объяснением:
  1. Конкретные планеты, знаки и дома из chart_analysis (например: "Солнце в Близнецах в 5-м доме", "Луна в квадрате с Сатурном")
  2. ПОЧЕМУ ты сделала именно такие выборы на каждом из 6 этапов — объясни мотивацию через положения планет и аспекты
  3. Как конкретные аспекты проявились в поведении (например: квадрат Луны с Сатурном заставил выбрать безопасность вместо риска)
  4. Что в гороскопе определяет ТАКОЙ характер и ТАКУЮ реакцию на жизненный контракт
  5. Используй астрологические термины (дома, аспекты, планеты), НО объясняй их влияние человеческим языком в скобках

  Пример формулировки: "Твой выбор уйти в тень на первом этапе объясняется Луной в 12-м доме (потребность в уединении и защите внутреннего мира), а квадрат Сатурна к Луне добавил страха перед ошибкой и чужим осуждением. На третьем этапе ты решила открыть дверь — здесь сработало Солнце в Близнецах в 5-м доме (тяга к новизне и самовыражению), хотя оппозиция Плутона создавала внутреннее напряжение и страх трансформации. В финале твой выбор принять ситуацию отражает зрелость Сатурна в 10-м доме — ты научилась брать ответственность вместо бегства от реальности."

ВАЖНО: Каждое поле должно быть в ОДНУ строку, без переносов внутри значений. Используй пробелы вместо переносов строк.

Сохраняй второе лицо и атмосферность, не добавляй новых развилок.

Ответь строго в формате JSON:
{
  "meta": {
    "author": "${author.name}",
    "genre": "${author.genre}",
    "contract": "строка",
    "arc_limit": ${arcLimit}
  },
  "finale": {
    "resolution": "абзац-развязка в одну строку",
    "human_interpretation": "4–6 предложений в одну строку: анализ выборов через черты характера, без астрологических терминов",
    "astrological_interpretation": "4–7 предложений в одну строку: детальный астрологический анализ выборов с планетами, домами и аспектами"
  }
}

Никаких пояснений, только JSON. Все текстовые значения должны быть в одну строку.`;
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

interface NormalizeOptions {
  mode: 'arc' | 'finale';
  authorName: string;
  genre: string;
  arcLimit: number;
  currentArc: number;
  contract?: string;
}

function normalizeResponse(raw: unknown, options: NormalizeOptions): HistoryStoryResponse {
  const contract = options.contract ?? DEFAULT_CONTRACT;

  if (options.mode === 'finale') {
    const metaSource = (raw as any)?.meta;
    const finaleSource = (raw as any)?.finale ?? raw;

    const resolvedContract =
      typeof metaSource?.contract === 'string' && metaSource.contract.trim().length > 0
        ? metaSource.contract.trim()
        : contract;

    const resolution =
      typeof finaleSource?.resolution === 'string' && finaleSource.resolution.trim().length > 0
        ? finaleSource.resolution.trim()
        : DEFAULT_RESOLUTION;

    const humanInterpretation =
      typeof finaleSource?.human_interpretation === 'string' && finaleSource.human_interpretation.trim().length > 0
        ? finaleSource.human_interpretation.trim()
        : typeof finaleSource?.interpretation === 'string' && finaleSource.interpretation.trim().length > 0
          ? finaleSource.interpretation.trim()
          : DEFAULT_HUMAN_INTERPRETATION;

    const astrologicalInterpretation =
      typeof finaleSource?.astrological_interpretation === 'string' && finaleSource.astrological_interpretation.trim().length > 0
        ? finaleSource.astrological_interpretation.trim()
        : DEFAULT_ASTROLOGICAL_INTERPRETATION;

    return {
      meta: {
        author: typeof metaSource?.author === 'string' && metaSource.author.trim().length > 0
          ? metaSource.author.trim()
          : options.authorName,
        genre: typeof metaSource?.genre === 'string' && metaSource.genre.trim().length > 0
          ? metaSource.genre.trim()
          : options.genre,
        contract: resolvedContract,
        arcLimit: Number.isFinite(metaSource?.arc_limit)
          ? Number(metaSource.arc_limit)
          : options.arcLimit,
      },
      options: [],
      finale: {
        resolution,
        humanInterpretation,
        astrologicalInterpretation,
      },
    };
  }

  const metaSource = (raw as any)?.meta ?? (raw as any);
  const nodeSource = (raw as any)?.node ?? (raw as any);
  const choicesSource = Array.isArray((raw as any)?.choices)
    ? (raw as any).choices
    : Array.isArray((raw as any)?.options)
      ? (raw as any).options
      : [];

  const resolvedContract =
    typeof metaSource?.contract === 'string' && metaSource.contract.trim().length > 0
      ? metaSource.contract.trim()
      : contract;

  const sceneText =
    typeof nodeSource?.scene === 'string' && nodeSource.scene.trim().length > 0
      ? nodeSource.scene.trim()
      : DEFAULT_SCENE;

  const stageName =
    typeof nodeSource?.stage === 'string' && nodeSource.stage.trim().length > 0
      ? nodeSource.stage.trim()
      : getStageName(options.currentArc, options.arcLimit);

  const arcNumber = Number.isFinite(nodeSource?.arc)
    ? Math.max(1, Number(nodeSource.arc))
    : options.currentArc;

  const normalizedOptions: HistoryStoryOption[] = [
    sanitizeOption(choicesSource[0], FALLBACK_OPTIONS[0]),
    sanitizeOption(choicesSource[1], FALLBACK_OPTIONS[1]),
  ];

  return {
    meta: {
      author: typeof metaSource?.author === 'string' && metaSource.author.trim().length > 0
        ? metaSource.author.trim()
        : options.authorName,
      genre: typeof metaSource?.genre === 'string' && metaSource.genre.trim().length > 0
        ? metaSource.genre.trim()
        : options.genre,
      contract: resolvedContract,
      arcLimit: Number.isFinite(metaSource?.arc_limit)
        ? Number(metaSource.arc_limit)
        : options.arcLimit,
    },
    node: {
      arc: arcNumber,
      stage: stageName,
      scene: sceneText,
    },
    options: normalizedOptions,
  };
}

export async function generateHistoryStoryChunk({
  segments,
  currentChoice,
  summary,
  author,
  arcLimit,
  mode,
  currentArc,
  contract,
  signal,
  claudeApiKey,
  claudeProxyUrl,
  openAIApiKey,
}: HistoryStoryRequestOptions): Promise<HistoryStoryResponse> {
  const targetArc = mode === 'arc' ? (currentArc ?? 1) : arcLimit;

  const prompt =
    mode === 'finale'
      ? buildFinalePrompt({
          segments,
          currentChoice,
          summary,
          author,
          arcLimit,
          contract,
        })
      : buildArcPrompt({
          segments,
          currentChoice,
          summary,
          author,
          arcLimit,
          currentArc: targetArc,
          contract,
        });

  const messages: AIMessage[] = [
    {
      role: 'user',
      content: prompt,
    },
  ];

  try {
    const result = await callAI({
      system: `Ты ${author.name}, русскоязычная писательница, создающая атмосферную интерактивную историю во втором лице для Насти. Соблюдай формат JSON без Markdown и выполняй все требования пользователя.`,
      messages,
      temperature: 0.85,
      maxTokens: mode === 'finale' ? 1200 : 600,
      signal,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
    });

    console.log(`[HistoryStory] Generated ${mode} using ${result.provider}`);

    const cleanText = result.text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanText);
    } catch (parseError) {
      console.error(`[HistoryStory] JSON parse error for ${mode}:`, parseError);
      console.error(`[HistoryStory] Raw text (first 500 chars):`, cleanText.slice(0, 500));

      // Попытка исправить многострочные строки в JSON
      try {
        const fixedText = cleanText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
        parsed = JSON.parse(fixedText);
        console.log(`[HistoryStory] Successfully parsed after fixing newlines`);
      } catch (fixError) {
        console.error(`[HistoryStory] Failed to fix and parse, using fallback`);
        throw parseError;
      }
    }

    return normalizeResponse(parsed, {
      mode,
      authorName: author.name,
      genre: author.genre,
      arcLimit,
      currentArc: targetArc,
      contract,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error(`[HistoryStory] Failed to generate ${mode}`, error);

    // Для финала не используем fallback, чтобы не было одинаковых результатов
    if (mode === 'finale') {
      throw new Error('Failed to generate finale. Please try again.');
    }

    // Для arc используем fallback
    return normalizeResponse(null, {
      mode,
      authorName: author.name,
      genre: author.genre,
      arcLimit,
      currentArc: targetArc,
      contract,
    });
  }
}
