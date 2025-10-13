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
  title: string;
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
  'Твой выбор двигаться к свету на первом этапе показывает смелость и любопытство — ты готова исследовать неизвестное. Эта черта явно свойственна тебе. Но на втором этапе ты неожиданно отступила и выбрала безопасность — здесь проявилось внутреннее противоречие между жаждой нового и потребностью в защите. На третьем и четвёртом этапах ты колебалась между этими двумя полюсами. Интересно, что в финале ты не выбрала компромисс, а пошла на полное принятие правды — это не типично для твоей обычной осторожности, но показывает способность выходить за рамки привычных паттернов, когда ситуация требует честности.';

const DEFAULT_ASTROLOGICAL_INTERPRETATION =
  'Твой выбор двигаться к свету на первом этапе объясняется Солнцем в Раке в 4-м доме (потребность докопаться до корня). Но на втором этапе ты отступила — здесь квадрат Сатурна к Луне включил страх и осторожность, что ПРОТИВОРЕЧИТ начальной смелости. Луна в Близнецах давала любопытство, но квадрат с Сатурном создавал колебания — отсюда непоследовательность выборов на третьем и четвёртом этапах. Венера в Деве в 6-м доме толкала к поиску порядка и контроля. Интересно, что в финале ты приняла правду полностью — это не объясняется осторожным Сатурном, скорее здесь проявилось Солнце в Раке (честность с собой на глубинном уровне), которое в критический момент победило защитные механизмы Луны и Сатурна.';

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
    : `Сформулируй контракт истории — понятный человеческий вопрос о внутреннем конфликте личности (до 90 символов).

ОБЯЗАТЕЛЬНО опирайся на chart_analysis (hard_aspects и core_placements), чтобы создать ПЕРСОНАЛЬНУЮ тему, актуальную для ЭТОЙ натальной карты.

Охватывай РАЗНЫЕ области жизни и психологии:
- Эмоции и чувства (страхи, тревоги, уязвимость, доверие)
- Самовыражение и идентичность (кто я на самом деле, мои таланты, моя сила)
- Отношения (близость, границы, зависимость, одиночество)
- Выбор пути (амбиции vs комфорт, риск vs стабильность)
- Внутренние конфликты (контроль vs отпускание, логика vs интуиция)
- Прошлое и настоящее (детские травмы, семейные паттерны, наследие)
- Ценности и смыслы (что действительно важно, мои приоритеты)

Примеры контрактов:
• "Могу ли я доверять своим чувствам, когда разум говорит иное?" (Луна в конфликте с Меркурием/Сатурном)
• "Имею ли я право на свои желания, если они идут вразрез с привычным?" (напряженные аспекты к Венере)
• "Смогу ли я позволить себе быть уязвимой, не потеряв контроль?" (Плутон/Сатурн в напряжении к Луне)
• "Что останется, если я перестану соответствовать чужим ожиданиям?" (Солнце в напряжении)
• "Как найти свою силу, не подавляя других?" (Марс в конфликте)
• "Могу ли я принять себя такой, какая есть, со всеми противоречиями?" (множественные оппозиции)
• "Стоит ли рисковать стабильностью ради мечты?" (Юпитер/Уран vs Сатурн)
• "Как отпустить прошлое, которое всё ещё держит меня?" (12-й дом, Сатурн, Плутон)

НЕ повторяй одни и те же темы. КАЖДЫЙ раз выбирай разный аспект психологии.
НЕ используй абстрактные философские формулировки.
Используй этот контракт на всех узлах.`;

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
    "title": "Краткое название истории (2-3 слова, отражающих суть контракта)",
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

- human_interpretation — критический анализ на человеческом языке (4–6 предложений) с ОБЯЗАТЕЛЬНЫМ объяснением:
  1. ПОЧЕМУ ты сделала именно такие выборы на ключевых этапах — объясни мотивацию через черты характера
  2. Какие особенности твоей личности проявились в этих решениях (осторожность, любопытство, контроль, интуиция)
  3. КРИТИЧЕСКИ оцени: были ли выборы, которые НЕ свойственны твоему характеру? Где ты действовала вопреки своей природе?
  4. Укажи внутренние противоречия, если они есть (например: "обычно ты осторожна, но здесь бросилась в риск")
  5. НЕ используй астрологические термины (без упоминания планет, домов, аспектов)
  6. Будь честной — не натягивай объяснения, если выбор не укладывается в логику характера

  Пример формулировки: "Твой выбор спрятаться на первом этапе показывает природную осторожность — ты сначала оцениваешь ситуацию, прежде чем действовать. Эта черта явно свойственна тебе. Но на третьем этапе ты неожиданно распахнула дверь без раздумий — это НЕ типично для тебя и показывает внутреннее противоречие: любопытство боролось с инстинктом самосохранения. На пятом этапе ты снова вернулась к осторожности. В финале ты приняла правду, хотя обычно предпочитаешь держать дистанцию — возможно, ситуация вынудила тебя выйти из зоны комфорта."

- astrological_interpretation — критический астрологический анализ (4–7 предложений) с ОБЯЗАТЕЛЬНЫМ объяснением:
  1. Конкретные планеты, знаки и дома из chart_analysis (например: "Солнце в Близнецах в 5-м доме", "Луна в квадрате с Сатурном")
  2. ПОЧЕМУ ты сделала именно такие выборы на каждом из 6 этапов — объясни мотивацию через положения планет и аспекты
  3. КРИТИЧЕСКИ оцени: были ли выборы, которые ПРОТИВОРЕЧАТ натальной карте? Где карта предсказывала одно, а ты сделала другое?
  4. Объясни противоречия через напряжённые аспекты (квадраты, оппозиции) — внутренняя борьба планет
  5. Не натягивай интерпретацию — если выбор не объясняется картой, честно скажи об этом
  6. Используй астрологические термины, НО объясняй их влияние человеческим языком в скобках

  Пример формулировки: "Твой выбор уйти в тень на первом этапе логично объясняется Луной в 12-м доме (потребность в уединении и защите). Квадрат Сатурна к Луне добавил страха перед ошибкой. Но на третьем этапе ты резко открыла дверь — это ПРОТИВОРЕЧИТ осторожной Луне и больше похоже на импульс Марса, хотя у тебя Марс в Тельце (медлительный). Возможно, здесь сработал квадрат Урана к Солнцу — внезапный бунт против собственной осторожности. На пятом этапе ты вернулась к паттерну Сатурна (контроль). В финале ты приняла правду — здесь Солнце в Раке (потребность в честности с собой) победило Луну в 12-м доме (желание спрятаться)."

КРИТИЧЕСКИ ВАЖНО:
1. Каждое поле JSON должно быть в ОДНУ строку без реальных переносов строк (\\n).
2. НЕ используй символы переноса строки внутри строковых значений.
3. Используй пробелы вместо любых переносов.
4. Все значения "resolution", "human_interpretation" и "astrological_interpretation" должны быть непрерывными строками.

Сохраняй второе лицо и атмосферность, не добавляй новых развилок.

Ответь строго в формате JSON (пример):
{"meta":{"author":"${author.name}","title":"Краткое название истории (2-3 слова)","genre":"${author.genre}","contract":"строка","arc_limit":${arcLimit}},"finale":{"resolution":"абзац-развязка в одну непрерывную строку с пробелами вместо переносов","human_interpretation":"4-6 предложений в одну непрерывную строку: анализ выборов через черты характера, без астрологических терминов","astrological_interpretation":"4-7 предложений в одну непрерывную строку: детальный астрологический анализ выборов с планетами, домами и аспектами"}}

Никаких пояснений, только компактный JSON в одну строку или с минимальными переносами между полями (но не внутри строковых значений).`;
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
        title: typeof metaSource?.title === 'string' && metaSource.title.trim().length > 0
          ? metaSource.title.trim()
          : 'Без названия',
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
      title: typeof metaSource?.title === 'string' && metaSource.title.trim().length > 0
        ? metaSource.title.trim()
        : 'Без названия',
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
        // Более агрессивная очистка: заменяем все переносы и множественные пробелы
        let fixedText = cleanText
          // Заменяем переносы строк внутри строк на пробелы
          .replace(/\\n/g, ' ')
          // Заменяем реальные переносы строк на пробелы
          .replace(/[\r\n]+/g, ' ')
          // Заменяем табуляции на пробелы
          .replace(/\t/g, ' ')
          // Убираем множественные пробелы
          .replace(/\s+/g, ' ')
          // Убираем пробелы перед закрывающими кавычками и скобками
          .replace(/\s+"/g, '"')
          .replace(/\s+}/g, '}')
          .replace(/\s+]/g, ']')
          // Убираем пробелы после открывающих кавычек и скобок
          .replace(/"\s+/g, '"')
          .replace(/{\s+/g, '{')
          .replace(/\[\s+/g, '[');

        parsed = JSON.parse(fixedText);
        console.log(`[HistoryStory] Successfully parsed after fixing newlines and whitespace`);
      } catch (fixError) {
        console.error(`[HistoryStory] Failed to fix and parse, trying to extract valid JSON portion`);

        // Последняя попытка: ищем валидные части JSON
        try {
          // Пытаемся найти последнюю закрывающую скобку
          const lastBrace = cleanText.lastIndexOf('}');
          if (lastBrace > 0) {
            const truncated = cleanText.substring(0, lastBrace + 1);
            const fixedTruncated = truncated
              .replace(/[\r\n]+/g, ' ')
              .replace(/\s+/g, ' ');
            parsed = JSON.parse(fixedTruncated);
            console.log(`[HistoryStory] Successfully parsed truncated JSON`);
          } else {
            throw parseError;
          }
        } catch (truncError) {
          console.error(`[HistoryStory] All parsing attempts failed, using fallback`);
          throw parseError;
        }
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
