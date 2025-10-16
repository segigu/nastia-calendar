import { callAI } from './aiClient';
import {
  ASTRO_PROFILES,
  PRIMARY_PROFILE_ID,
  type AstroProfile,
} from '../data/astroProfiles';
import {
  buildNatalChartAnalysis,
  type NatalChartAnalysis,
} from './astro';

export interface PlanetDialogueMessage {
  planet: string;
  message: string;
}

export interface PersonalizedPlanetMessages {
  dialogue: PlanetDialogueMessage[];
  timestamp: number;
}

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

const NASTIA_PROFILE = ASTRO_PROFILES[PRIMARY_PROFILE_ID];
const NASTIA_CHART_ANALYSIS = buildNatalChartAnalysis(PRIMARY_PROFILE_ID);
const BIRTH_DATA_TEXT = serializeBirthData(NASTIA_PROFILE);
const CHART_ANALYSIS_TEXT = serializeChartAnalysis(NASTIA_CHART_ANALYSIS);

const STORAGE_KEY = 'nastia_personalized_planet_messages';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 часа

/**
 * Загружает сообщения из localStorage
 */
function loadFromCache(): PersonalizedPlanetMessages | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) return null;

    const parsed: PersonalizedPlanetMessages = JSON.parse(cached);

    // Проверяем, не устарел ли кеш (24 часа)
    const age = Date.now() - parsed.timestamp;
    if (age > CACHE_DURATION) {
      console.log('[PlanetMessages] Cache expired, will regenerate');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    console.log('[PlanetMessages] ✅ Loaded from cache');
    return parsed;
  } catch (error) {
    console.error('[PlanetMessages] Failed to load from cache:', error);
    return null;
  }
}

/**
 * Сохраняет сообщения в localStorage
 */
function saveToCache(messages: PersonalizedPlanetMessages): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    console.log('[PlanetMessages] ✅ Saved to cache');
  } catch (error) {
    console.error('[PlanetMessages] Failed to save to cache:', error);
  }
}

/**
 * Генерирует персонализированные сообщения от планет на основе натальной карты.
 * Каждая планета получает 5 сообщений, которые отражают реальные паттерны из карты.
 * Результат кешируется в localStorage на 24 часа.
 */
export async function generatePersonalizedPlanetMessages(
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  openAIProxyUrl?: string,
): Promise<PersonalizedPlanetMessages> {
  // Сначала проверяем кеш
  const cached = loadFromCache();
  if (cached) {
    return cached;
  }

  const prompt = `Ты — драматург, который создаёт живой рабочий диалог между планетами.

🔹 ДАННЫЕ О ЧЕЛОВЕКЕ
birth_data:
${indent(BIRTH_DATA_TEXT, 2)}
chart_analysis:
${indent(CHART_ANALYSIS_TEXT, 2)}

🔹 ЗАДАНИЕ
Создай живой диалог из 25-30 фраз, где планеты (Луна, Плутон, Нептун, Уран, Венера, Сатурн, Хирон, Меркурий, Марс, Юпитер) ОБСУЖДАЮТ между собой, какую интерактивную историю они сейчас придумают для Насти.

Это должен быть РАБОЧИЙ РАЗГОВОР планет, как будто они собрались в комнате и обсуждают:
- Какую ситуацию предложить?
- Какой конфликт показать?
- Может, вот так сделаем? Нет, давай по-другому!
- Смотри, у неё же вот этот паттерн... давай его покажем!

ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ:
1. ДИАЛОГ С ЮМОРОМ И САРКАЗМОМ — планеты подшучивают друг над другом и над Настей
2. СВЯЗНЫЙ РАЗГОВОР — реплики вытекают одна из другой, это НАСТОЯЩИЙ диалог
3. ПОВЕСТВОВАТЕЛЬНЫЙ СТИЛЬ — они рассуждают, спорят, соглашаются, перебивают
4. О ЧЁМ ГОВОРЯТ: обсуждают характер Насти, её паттерны поведения, какую историю для неё придумать
5. КОРОТКИЕ РЕПЛИКИ — каждая фраза до 100 символов максимум
6. НЕТ АСТРОЛОГИЧЕСКИХ ТЕРМИНОВ — говорят человеческим языком
7. РЕАЛЬНЫЕ ПАТТЕРНЫ из chart_analysis — опираются на реальные данные карты

ПРИМЕРЫ СТИЛЯ (как должен выглядеть диалог):

Луна: "Так, ну что, начнём? Сегодня она в таком настроении..."
Плутон: "О, я уже знаю что ей подкинуть. Тёмненькое такое."
Венера: "Плутон, хватит пугать! Давайте про отношения лучше."
Марс: "Опять про отношения? Может, про конфликт какой-нибудь?"
Луна: "Не-не, она конфликты не любит, сразу спрячется."
Сатурн: "Вот именно поэтому и надо! Пора научиться."
Нептун: "Предлагаю ей вообще всё запутать, пусть разбирается..."
Меркурий: "Нептун, ты каждый раз так. Давайте логично."
Уран: "А давайте я всё переверну с ног на голову? Неожиданный поворот!"
Юпитер: "Погодите, а какой смысл в этой истории?"

И так далее — 25-30 фраз СВЯЗНОГО разговора, где они ВМЕСТЕ придумывают историю.

🔹 ФОРМАТ ОТВЕТА (JSON):
{
  "dialogue": [
    {"planet": "Луна", "message": "фраза 1"},
    {"planet": "Плутон", "message": "фраза 2"},
    {"planet": "Венера", "message": "фраза 3"},
    ... (всего 25-30 фраз)
  ]
}

КРИТИЧЕСКИ ВАЖНО:
1. Диалог должен быть СВЯЗНЫМ — это ОДИН разговор, а не отдельные фразы
2. Планеты ОТВЕЧАЮТ друг другу, спорят, соглашаются, развивают мысли друг друга
3. ЮМОР и САРКАЗМ обязательны — планеты не церемонятся
4. Все фразы в одну строку без переносов
5. Отвечай ТОЛЬКО JSON без пояснений, комментариев и Markdown
6. Используй данные из chart_analysis — диалог должен быть персонализированным под Настю`;

  try {
    console.log('[PlanetMessages] Starting AI call to generate personalized messages');

    const result = await callAI({
      system:
        'Ты драматург и сценарист, который создаёт живые диалоги между планетами на основе натальной карты. Отвечай только валидным JSON.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.85,
      maxTokens: 3000,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
      openAIProxyUrl,
      // НЕ используем preferOpenAI - по умолчанию используется Claude (Haiku 4.5)
    });

    console.log('[PlanetMessages] AI call completed, parsing response');

    let text = result.text.trim();
    text = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      console.error('[PlanetMessages] JSON parse error:', parseError);
      console.error('[PlanetMessages] Raw text (first 500 chars):', text.slice(0, 500));

      // Попытка исправить проблемы с форматированием
      try {
        const fixedText = text
          .replace(/[\r\n]+/g, ' ')
          .replace(/\s+/g, ' ');
        parsed = JSON.parse(fixedText);
        console.log('[PlanetMessages] ✅ Successfully parsed after fixing newlines');
      } catch (fixError) {
        console.error('[PlanetMessages] Failed to parse JSON, using fallback');
        throw parseError;
      }
    }

    // Проверяем формат диалога
    const dialogue = Array.isArray(parsed?.dialogue) ? parsed.dialogue : [];

    if (dialogue.length < 20) {
      console.warn('[PlanetMessages] Dialogue too short, using fallback');
      throw new Error('Dialogue too short');
    }

    // Валидируем структуру диалога
    const validDialogue: PlanetDialogueMessage[] = dialogue
      .filter((msg: any) =>
        typeof msg?.planet === 'string' &&
        typeof msg?.message === 'string' &&
        msg.planet.trim().length > 0 &&
        msg.message.trim().length > 0
      )
      .map((msg: any) => ({
        planet: msg.planet.trim(),
        message: msg.message.trim(),
      }));

    if (validDialogue.length < 20) {
      console.warn('[PlanetMessages] Not enough valid dialogue messages, using fallback');
      throw new Error('Not enough valid dialogue messages');
    }

    console.log('[PlanetMessages] ✅ Successfully generated dialogue with', validDialogue.length, 'messages');

    const finalResult: PersonalizedPlanetMessages = {
      dialogue: validDialogue,
      timestamp: Date.now(),
    };

    // Сохраняем в кеш
    saveToCache(finalResult);

    return finalResult;
  } catch (error) {
    console.warn('[PlanetMessages] Failed to generate via AI, using fallback', error);
    return getFallbackPlanetMessages();
  }
}

/**
 * Возвращает fallback диалог планет
 */
function getFallbackPlanetMessages(): PersonalizedPlanetMessages {
  const dialogue: PlanetDialogueMessage[] = [
    { planet: 'Луна', message: 'Так, коллеги, что у нас сегодня на повестке?' },
    { planet: 'Плутон', message: 'У меня тут парочка тёмных идей припасена...' },
    { planet: 'Венера', message: 'Плутон, ну хватит тебе! Давайте что-то про любовь лучше.' },
    { planet: 'Марс', message: 'Опять про любовь? Может, конфликт какой устроим?' },
    { planet: 'Луна', message: 'Она конфликты не любит, сразу в панцирь спрячется.' },
    { planet: 'Сатурн', message: 'Вот именно поэтому и нужно. Пора учиться, а не прятаться.' },
    { planet: 'Нептун', message: 'А я предлагаю всё туманом окутать, пусть догадывается...' },
    { planet: 'Меркурий', message: 'Нептун, ты каждый раз так! Давайте логично всё построим.' },
    { planet: 'Уран', message: 'А давайте я всё с ног на голову переверну? Неожиданность!' },
    { planet: 'Юпитер', message: 'Минуточку! А в чём смысл истории будет?' },
    { planet: 'Хирон', message: 'Вижу тут одну старую рану... можем на неё надавить.' },
    { planet: 'Луна', message: 'Осторожнее, она чувствительная очень.' },
    { planet: 'Плутон', message: 'Чувствительная — это хорошо. Глубже копнём.' },
    { planet: 'Венера', message: 'Только не переборщите, а то опять испугаете.' },
    { planet: 'Марс', message: 'Испугать — это же мотивация действовать!' },
    { planet: 'Сатурн', message: 'Согласен с Марсом. Без напряжения не будет роста.' },
    { planet: 'Меркурий', message: 'Так, стоп. Давайте структуру выстроим сначала.' },
    { planet: 'Нептун', message: 'Структура — это скучно. Пусть будет загадочно!' },
    { planet: 'Юпитер', message: 'И всё-таки надо показать ей что-то большее, урок какой-то.' },
    { planet: 'Уран', message: 'Урок — это Сатурн. Я за хаос и откровения!' },
    { planet: 'Хирон', message: 'Откровения через боль — моя специальность.' },
    { planet: 'Луна', message: 'Ладно, похоже, план созрел. Приступаем?' },
    { planet: 'Плутон', message: 'О да, сейчас будет интересно...' },
    { planet: 'Венера', message: 'Только аккуратно, пожалуйста!' },
    { planet: 'Марс', message: 'Вперёд! Давно пора действовать.' },
    { planet: 'Сатурн', message: 'Начинаем. И без поблажек.' },
    { planet: 'Меркурий', message: 'Записал всё, можно стартовать.' },
    { planet: 'Нептун', message: 'Добавил немного магии. Готово!' },
    { planet: 'Юпитер', message: 'Тогда вперёд, к большим открытиям!' },
    { planet: 'Уран', message: 'Поехали! Будет незабываемо.' },
  ];

  return {
    dialogue,
    timestamp: Date.now(),
  };
}
