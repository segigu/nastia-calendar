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
import {
  findScenarioById,
  getFallbackContract,
  normalizePsychologicalContract,
  type PsychologicalContract,
  type ContractScenario,
} from '../data/psychologicalContracts';
import {
  getPsychContractHistorySnapshot,
  rememberContractUsage,
} from './psychContractHistory';

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
  /**
   * Optional OpenAI proxy URL.
   */
  openAIProxyUrl?: string;
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
  'Ты стоишь на пустой станции метро в час ночи. Последний поезд ушёл десять минут назад, но ты не помнишь, как сюда попала. На экране табло мигают странные символы вместо времени. Где-то в тоннеле скребётся металл по бетону, и этот звук заставляет тебя сжать кулаки. Ты знаешь: нужно сделать выбор, пока не поздно.';

const DEFAULT_RESOLUTION =
  'Ты задерживаешь взгляд на синеватом свете и делаешь шаг вперёд. Воздух густеет, но вместо страха приходит ясность: комната — не ловушка, а зеркало твоих решений. Ты трогаешь заколоченное окно, слышишь скрип досок и понимаешь, что снаружи нет готового ответа. Есть только ты и то, что решишь открыть.';

const DEFAULT_HUMAN_INTERPRETATION =
  'Твой первый выбор показывает смелость и любопытство — ты готова исследовать неизвестное. Эта черта свойственна тебе. Но на втором этапе ты резко выбрала "действовать импульсивно" — это странно для твоего характера. Возможно, здесь сработало желание ответить "как надо", показать себя решительной, а не такой, какая есть на самом деле. На третьем этапе ты вернулась к осторожности — похоже, истинная природа взяла своё. Интересный паттерн: где-то ты честна с собой, а где-то играешь роль. В финале ты выбрала полное принятие — это требует мужества признать, кто ты на самом деле, без масок.';

const DEFAULT_ASTROLOGICAL_INTERPRETATION =
  'Твой первый выбор объясняется Солнцем в Раке в 4-м доме (потребность докопаться до корня) и Луной в Близнецах (любопытство). Но на втором этапе ты выбрала импульсивное действие — это ПРОТИВОРЕЧИТ твоей карте: у тебя нет огненного Марса или сильного Урана, которые дали бы такую спонтанность. Квадрат Сатурна к Луне говорит об осторожности, не о риске. Возможно, это был социально-желательный ответ — ты выбрала смелость не потому что так чувствуешь, а потому что так "правильно". На третьем этапе ты вернулась к паттерну Сатурна-Луны (контроль) — вот настоящая реакция. В финале Солнце в Раке (честность с собой) помогло признать правду без масок. Карта показывает: твоя сила не в импульсивности, а в глубине и вдумчивости.';

const NASTIA_PROFILE = ASTRO_PROFILES[PRIMARY_PROFILE_ID];
const NASTIA_CHART_ANALYSIS = buildNatalChartAnalysis(PRIMARY_PROFILE_ID);
const BIRTH_DATA_TEXT = serializeBirthData(NASTIA_PROFILE);
const CHART_ANALYSIS_TEXT = serializeChartAnalysis(NASTIA_CHART_ANALYSIS);

interface PsychContractContext {
  contract: PsychologicalContract;
  scenario?: ContractScenario;
}

let activePsychContext: PsychContractContext | undefined;

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

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Умная замена переносов строк в JSON:
 * - Находит все строковые значения в JSON (между кавычками)
 * - Заменяет переносы строк внутри этих значений на пробелы
 * - Оставляет структурные элементы JSON (запятые, скобки) без изменений
 */
function fixSmartNewlines(jsonText: string): string {
  let result = '';
  let insideString = false;
  let prevChar = '';

  for (let i = 0; i < jsonText.length; i++) {
    const char = jsonText[i];

    // Определяем, находимся ли мы внутри строкового значения
    if (char === '"' && prevChar !== '\\') {
      insideString = !insideString;
      result += char;
    } else if (insideString && (char === '\n' || char === '\r')) {
      // Внутри строки: заменяем перенос на пробел
      result += ' ';
    } else {
      result += char;
    }

    prevChar = char;
  }

  return result;
}

async function generatePsychContractContext(
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  openAIProxyUrl?: string,
): Promise<PsychContractContext> {
  const historySnapshot = getPsychContractHistorySnapshot();
  const recentContractIds = historySnapshot.contracts.slice(0, 8).map(entry => entry.id);
  const recentScenarios = historySnapshot.scenarios.slice(0, 12).map(
    entry => `${entry.contractId}/${entry.scenarioId}`,
  );

  const prompt = `Ты — психолог и драматургка, создающая интерактивные истории о внутреннем конфликте.

Тебе нужно придумать свежий психологический контракт для Насти. Опираться надо на её натальную карту и избегать повторов прошлых контрактов/сцен.

🔹 ДАННЫЕ
birth_data:
${indent(BIRTH_DATA_TEXT, 2)}
chart_analysis:
${indent(CHART_ANALYSIS_TEXT, 2)}
recent_contract_ids: ${JSON.stringify(recentContractIds)}
recent_scenarios: ${JSON.stringify(recentScenarios)}

🔹 ЗАДАНИЕ
1. Осмысли психологическое напряжение карты и предложи новый внутренний конфликт (контракт).
2. Контракт должен быть терапевтическим вопросом, раскрывающим дилемму.
3. Опиши 3 ловушки поведения (механизмы защиты, самообман).
4. Придумай 3 символические сцены, через которые конфликт проявляется телесно и визуально.
5. Добавь 3 ключевые точки выбора — формулировки дилемм для истории.
6. Все элементы должны отличаться от перечисленных в recent_contract_ids / recent_scenarios.

🔹 ТРЕБОВАНИЯ К СТРУКТУРЕ
- contract.id — уникальный kebab-case латиницей без пробелов (например: trust-vs-control).
- contract.question — один ёмкий вопрос-дилемма.
- contract.theme — одно-два слова.
- contract.astroIndicators — 3–4 маркера (текстом, можно на русском).
- contract.commonTraps — массив из трёх объектов { "name": "...", "description": "..." }.
- contract.scenarios — массив из трёх объектов { "id": "kebab-case", "setting": "...", "situation": "...", "symbolism": "..." }.
- contract.choicePoints — массив из трёх формулировок ключевых выборов.
- recommendedScenarioId — id сцены, с которой лучше начать историю.
- Используй русский для описаний, но id оставь латиницей.

🔹 ФОРМАТ ОТВЕТА (JSON без форматирования, без комментариев):
{
  "contract": { ...см. выше... },
  "recommendedScenarioId": "scenario-id"
}

КРИТИЧЕСКИ ВАЖНО ДЛЯ ФОРМАТА JSON:
1. Все текстовые значения должны быть в ОДНУ строку без реальных переносов строк.
2. НЕ используй символ переноса строки (\\n) внутри строковых значений.
3. Используй пробелы вместо любых переносов строк внутри текста.
4. Если текст длинный, просто продолжай его в одну строку с пробелами.
5. JSON должен быть компактным и валидным для JSON.parse().

Не добавляй пояснений, текста вне JSON и Markdown.`;

  try {
    const result = await callAI({
      system:
        'Ты психологический архитектор историй. Придумывай новые конфликты, избегай повторов и отвечай только JSON.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.6,
      maxTokens: 2500,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
      openAIProxyUrl,
    });

    let text = result.text.trim();
    text = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      console.error('[PsychContract] JSON parse error:', parseError);
      console.error('[PsychContract] Raw text length:', text.length, 'chars');
      console.error('[PsychContract] Raw text (first 500 chars):', text.slice(0, 500));
      console.error('[PsychContract] Raw text (last 200 chars):', text.slice(-200));

      // Попытка исправить многострочные строки в JSON
      try {
        // Умная замена: заменяем переносы строк внутри строковых значений на пробелы,
        // но оставляем структурные переносы между ключами
        let fixedText = fixSmartNewlines(text);
        parsed = JSON.parse(fixedText);
        console.log('[PsychContract] ✅ Successfully parsed after fixing newlines');
      } catch (fixError) {
        console.error('[PsychContract] Smart fix failed:', fixError);
        console.error('[PsychContract] Trying aggressive cleanup');

        // Агрессивная очистка: убираем ВСЕ переносы строк
        try {
          let aggressiveText = text
            .replace(/\\n/g, ' ')
            .replace(/[\r\n]+/g, ' ')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ');
          parsed = JSON.parse(aggressiveText);
          console.log('[PsychContract] ✅ Successfully parsed after aggressive cleanup');
        } catch (aggressiveError) {
          console.error('[PsychContract] Aggressive cleanup failed, trying to extract valid JSON');

          // Последняя попытка: ищем валидные части JSON
          try {
            const lastBrace = text.lastIndexOf('}');
            if (lastBrace > 0) {
              const truncated = text.substring(0, lastBrace + 1);
              const fixedTruncated = truncated
                .replace(/[\r\n]+/g, ' ')
                .replace(/\s+/g, ' ');
              parsed = JSON.parse(fixedTruncated);
              console.log('[PsychContract] ⚠️ Successfully parsed truncated JSON (incomplete response)');
            } else {
              throw parseError;
            }
          } catch (truncError) {
            console.error('[PsychContract] All parsing attempts failed, using fallback');
            throw parseError;
          }
        }
      }
    }

    const contract = normalizePsychologicalContract(parsed?.contract ?? parsed);
    if (!contract) {
      throw new Error('Модель вернула некорректный контракт');
    }

    const recommendedScenarioId = trimString(
      parsed?.recommendedScenarioId ?? parsed?.recommended_scenario_id ?? '',
    );
    const scenario = findScenarioById(contract, recommendedScenarioId);

    rememberContractUsage(contract.id, scenario.id);

    return {
      contract,
      scenario,
    };
  } catch (error) {
    console.warn('[PsychContract] Failed to generate via AI, using fallback', error);
    const fallback = getFallbackContract(recentContractIds, recentScenarios);
    const fallbackScenario = findScenarioById(
      fallback.contract,
      fallback.recommendedScenarioId,
    );
    rememberContractUsage(fallback.contract.id, fallbackScenario.id);
    return {
      contract: fallback.contract,
      scenario: fallbackScenario,
    };
  }
}

async function ensurePsychContractContext(
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  openAIProxyUrl?: string,
): Promise<PsychContractContext> {
  if (activePsychContext) {
    return activePsychContext;
  }

  activePsychContext = await generatePsychContractContext(
    claudeApiKey,
    claudeProxyUrl,
    openAIApiKey,
    openAIProxyUrl,
  );
  return activePsychContext;
}

export function clearPsychContractContext(): void {
  activePsychContext = undefined;
}

function buildPsychologicalContractInfo(
  contract?: PsychologicalContract,
  scenario?: ContractScenario,
): string {
  if (!contract) {
    return '';
  }

  const trapsText = contract.commonTraps
    .map(trap => `• ${trap.name}: ${trap.description}`)
    .join('\n');

  const scenarioText = scenario
    ? `Рекомендуемый сценарий:
- Обстановка: ${scenario.setting}
- Ситуация: ${scenario.situation}
- Символизм: ${scenario.symbolism}`
    : '';

  return `
🔹 ПСИХОЛОГИЧЕСКИЙ КОНТРАКТ

Основной вопрос: «${contract.question}»
Тема: ${contract.theme}

Типичные психологические ловушки:
${trapsText}

Ключевые точки выбора:
${contract.choicePoints.map(point => `• ${point}`).join('\n')}

${scenarioText}

ВАЖНО: На каждом этапе истории проверяй, не попадает ли героиня в одну из ловушек.
Выборы должны раскрывать эти ловушки и давать возможность увидеть паттерн.`;
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

function buildArcPrompt(args: ArcPromptArgs, psychContext?: PsychContractContext): string {
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

  const psychContract = psychContext?.contract;
  const psychScenario = currentArc === 1 ? psychContext?.scenario : undefined;

  const contractInstruction = contract
    ? `Контракт истории уже задан: «${contract}». Сохраняй формулировку без изменений и напоминай себе о нём при создании сцен.`
    : psychContract
      ? `Контракт истории: «${psychContract.question}». Используй этот контракт на всех узлах без изменений.`
      : `Контракт истории будет задан автоматически.`;

  return `${buildInputDataBlock(author.genre, arcLimit)}
${psychContract ? buildPsychologicalContractInfo(psychContract, psychScenario) : ''}

🔹 ПРОМПТ (ядро для модели)

Создай персональную интерактивную историю в жанре ${author.genre}.
Основывай тему и конфликт на ключевых аспектах натальной карты пользователя Насти:
chart_analysis подключён выше — используй соответствующие мотивы и напряжения.
Авторский стиль: ${author.stylePrompt}

Героиня — женщина, имя не упоминается.
Повествование ведётся от второго лица («ты»).
${psychContract ? `\nИстория раскрывает психологический контракт: «${psychContract.question}»\nНа каждом этапе показывай, как героиня сталкивается с типичными ловушками этого контракта (см. выше).` : ''}

Структура истории:
1. Погружение — стартовая сцена без объяснений.
2. Конфликт — столкновение с внутренней дилеммой.
3. Отражение — встреча с символом себя.
4. Испытание — выбор между иллюзией и ясностью.
5. Поворот — действие с последствиями.
6. Финал — принятие, потеря или трансформация.

Сейчас нужно создать узел ${currentArc} из ${arcLimit} — «${stage}».
Фокус этого узла: ${stageGuidance}
${currentArc === 1 && psychScenario ? `ОБЯЗАТЕЛЬНО используй рекомендуемый сценарий (см. выше в блоке "Психологический контракт"). Создай сцену на основе указанной обстановки и ситуации, передай символизм через детали.` : ''}
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

function buildFinalePrompt(args: FinalePromptArgs, psychContext?: PsychContractContext): string {
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
${psychContext ? `${buildPsychologicalContractInfo(psychContext.contract)}\n` : ''}

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
  5. ЕСЛИ выбор не соответствует характеру, рассмотри возможность: может быть, ты отвечала не честно, а "как надо"? Может, боялась показать истинную реакцию? Люди часто выбирают социально-одобряемый ответ вместо настоящего.
  6. НЕ используй астрологические термины (без упоминания планет, домов, аспектов)
  7. Будь честной — не натягивай объяснения, если выбор не укладывается в логику характера

  Пример формулировки: "Твой выбор спрятаться на первом этапе показывает природную осторожность — это явно свойственно тебе. Но на третьем этапе ты выбрала 'смело пойти навстречу' — это НЕ типично для твоего характера. Возможно, здесь сыграла роль внутренняя борьба, а может, ты ответила так, как 'правильно', как от тебя ожидают — выбрала смелость не потому что так чувствуешь, а потому что так 'надо'. На пятом этапе ты вернулась к привычной осторожности — похоже, истинная природа взяла своё. Интересно: где в этой истории настоящая ты, а где — желание соответствовать образу?"

- astrological_interpretation — критический астрологический анализ (4–7 предложений) с ОБЯЗАТЕЛЬНЫМ объяснением:
  1. Конкретные планеты, знаки и дома из chart_analysis (например: "Солнце в Близнецах в 5-м доме", "Луна в квадрате с Сатурном")
  2. ПОЧЕМУ ты сделала именно такие выборы на каждом из 6 этапов — объясни мотивацию через положения планет и аспекты
  3. КРИТИЧЕСКИ оцени: были ли выборы, которые ПРОТИВОРЕЧАТ натальной карте? Где карта предсказывала одно, а ты сделала другое?
  4. Объясни противоречия через напряжённые аспекты (квадраты, оппозиции) — внутренняя борьба планет
  5. ЕСЛИ выбор противоречит карте и не объясняется аспектами, рассмотри: возможно, это социально-желательный ответ, а не истинная реакция? Карта показывает настоящую природу, а выбор — то, что человек хочет показать.
  6. Не натягивай интерпретацию — если выбор не объясняется картой, честно скажи об этом
  7. Используй астрологические термины, НО объясняй их влияние человеческим языком в скобках

  Пример формулировки: "Твой выбор уйти в тень на первом этапе логично объясняется Луной в 12-м доме (потребность в уединении и защите). Квадрат Сатурна к Луне добавил страха перед ошибкой. Но на третьем этапе ты резко выбрала 'пойти смело вперёд' — это ПРОТИВОРЕЧИТ и осторожной Луне, и медлительному Марсу в Тельце. У тебя нет импульсивных аспектов (Уран, Марс в огне), которые объясняли бы такой выбор. Возможно, ты выбрала не то, что чувствуешь, а то, что считаешь 'правильным' — социально одобряемую смелость вместо честной осторожности. На пятом этапе ты вернулась к паттерну Сатурна-Луны (контроль и защита) — вот она, настоящая реакция. Карта не врёт: твоя природа — это вдумчивость, не импульс."

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
  openAIProxyUrl,
}: HistoryStoryRequestOptions): Promise<HistoryStoryResponse> {
  const targetArc = mode === 'arc' ? (currentArc ?? 1) : arcLimit;
  let resolvedContract = contract;
  let psychContext: PsychContractContext | undefined;

  if (mode === 'arc') {
    if (targetArc === 1 && !contract) {
      psychContext = await ensurePsychContractContext(
        claudeApiKey,
        claudeProxyUrl,
        openAIApiKey,
        openAIProxyUrl,
      );
      resolvedContract = psychContext.contract.question;
    } else if (activePsychContext) {
      psychContext = activePsychContext;
      if (!resolvedContract) {
        resolvedContract = psychContext.contract.question;
      }
    }
  } else if (mode === 'finale' && activePsychContext) {
    psychContext = activePsychContext;
    if (!resolvedContract) {
      resolvedContract = psychContext.contract.question;
    }
  }

  const prompt =
    mode === 'finale'
      ? buildFinalePrompt(
          {
            segments,
            currentChoice,
            summary,
            author,
            arcLimit,
            contract: resolvedContract,
          },
          psychContext,
        )
      : buildArcPrompt(
          {
            segments,
            currentChoice,
            summary,
            author,
            arcLimit,
            currentArc: targetArc,
            contract: resolvedContract,
          },
          psychContext,
        );

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
      maxTokens: mode === 'finale' ? 2000 : 600,
      signal,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
      openAIProxyUrl,
      // preferOpenAI не указываем - по умолчанию используется Claude первым
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
      contract: resolvedContract,
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
      contract: resolvedContract,
    });
  }
}
