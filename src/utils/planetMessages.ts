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

/**
 * Настройки темпа печати для каждой планеты.
 * - typingSpeed: базовая скорость печати (мс на символ)
 * - pauseBeforeRange: диапазон паузы перед началом печати [min, max] (мс)
 * - pauseAfterRange: диапазон паузы после сообщения перед следующим [min, max] (мс)
 */
export interface PlanetTypingConfig {
  typingSpeed: number;
  pauseBeforeRange: [number, number];
  pauseAfterRange: [number, number];
}

/**
 * Конфигурация темпа печати для каждой планеты.
 * Отражает характер планеты через скорость и паузы.
 */
export const PLANET_TYPING_CONFIGS: Record<string, PlanetTypingConfig> = {
  'Луна': {
    typingSpeed: 40,              // Мягкая, спокойная
    pauseBeforeRange: [800, 1200],
    pauseAfterRange: [600, 1000],
  },
  'Плутон': {
    typingSpeed: 35,              // Медленная, зловещая
    pauseBeforeRange: [1200, 1800],
    pauseAfterRange: [800, 1400],
  },
  'Венера': {
    typingSpeed: 25,              // Быстрая, легкая
    pauseBeforeRange: [400, 800],
    pauseAfterRange: [300, 600],
  },
  'Марс': {
    typingSpeed: 20,              // Очень быстрая, резкая
    pauseBeforeRange: [200, 500],
    pauseAfterRange: [200, 400],
  },
  'Сатурн': {
    typingSpeed: 45,              // Медленная, размеренная
    pauseBeforeRange: [1000, 1500],
    pauseAfterRange: [700, 1200],
  },
  'Меркурий': {
    typingSpeed: 15,              // Самая быстрая, логичная
    pauseBeforeRange: [300, 600],
    pauseAfterRange: [250, 500],
  },
  'Нептун': {
    typingSpeed: 50,              // Очень медленная, туманная
    pauseBeforeRange: [1500, 2200],
    pauseAfterRange: [1000, 1800],
  },
  'Уран': {
    typingSpeed: 18,              // Быстрая, непредсказуемая
    pauseBeforeRange: [100, 700],  // Широкий разброс!
    pauseAfterRange: [200, 800],   // Очень непредсказуемо
  },
  'Юпитер': {
    typingSpeed: 35,              // Умеренная, философская
    pauseBeforeRange: [900, 1400],
    pauseAfterRange: [600, 1100],
  },
  'Хирон': {
    typingSpeed: 38,              // Задумчивая, глубокая
    pauseBeforeRange: [1100, 1600],
    pauseAfterRange: [700, 1300],
  },
};

/**
 * Получает конфигурацию печати для планеты.
 * Если планета не найдена, возвращает дефолтные настройки.
 */
export function getPlanetTypingConfig(planet: string): PlanetTypingConfig {
  return PLANET_TYPING_CONFIGS[planet] || {
    typingSpeed: 30,
    pauseBeforeRange: [500, 1000],
    pauseAfterRange: [400, 800],
  };
}

/**
 * Рассчитывает длительность печати сообщения на основе конфигурации планеты.
 */
export function calculateTypingDuration(message: string, planet: string): number {
  const config = getPlanetTypingConfig(planet);
  return message.length * config.typingSpeed;
}

/**
 * Рассчитывает паузу перед началом печати для планеты.
 */
export function calculatePauseBefore(planet: string): number {
  const config = getPlanetTypingConfig(planet);
  const [min, max] = config.pauseBeforeRange;
  return min + Math.random() * (max - min);
}

/**
 * Рассчитывает паузу после сообщения перед следующим.
 */
export function calculatePauseAfter(planet: string): number {
  const config = getPlanetTypingConfig(planet);
  const [min, max] = config.pauseAfterRange;
  return min + Math.random() * (max - min);
}

export interface PersonalizedPlanetMessages {
  dialogue: PlanetDialogueMessage[];
  timestamp: number;
}

function serializeBirthData(profile: AstroProfile): string {
  const loc = profile.notes?.split('(')[0]?.trim() ?? 'Тикси';
  return `${profile.birthDate}, ${profile.birthTime ?? '12:00'}, ${loc}`;
}

function serializeChartAnalysis(analysis: NatalChartAnalysis): string {
  return `Планеты: ${analysis.corePlacements.slice(0, 5).join(', ')}. Напряжения: ${analysis.hardAspects.slice(0, 3).join(', ')}.`;
}

const NASTIA_PROFILE = ASTRO_PROFILES[PRIMARY_PROFILE_ID];
const NASTIA_CHART_ANALYSIS = buildNatalChartAnalysis(PRIMARY_PROFILE_ID);
const BIRTH_DATA_TEXT = serializeBirthData(NASTIA_PROFILE);
const CHART_ANALYSIS_TEXT = serializeChartAnalysis(NASTIA_CHART_ANALYSIS);


/**
 * Генерирует персонализированные сообщения от планет на основе натальной карты.
 * Каждая планета получает 5 сообщений, которые отражают реальные паттерны из карты.
 */
export async function generatePersonalizedPlanetMessages(
  claudeApiKey?: string,
  claudeProxyUrl?: string,
  openAIApiKey?: string,
  openAIProxyUrl?: string,
): Promise<PersonalizedPlanetMessages> {

  const prompt = `Создай 25-30 фраз РАБОЧЕГО СОВЕЩАНИЯ планет (Луна, Плутон, Нептун, Уран, Венера, Сатурн, Хирон, Меркурий, Марс, Юпитер). Они собрались обсудить, какую интерактивную историю придумать для Насти.

Настя: ${BIRTH_DATA_TEXT}. ${CHART_ANALYSIS_TEXT}

ВАЖНО:
- Начинается с приветствия типа "Так, коллеги, собрались? Что сегодня придумаем?"
- Планеты ОТВЕЧАЮТ друг другу, спорят, подшучивают, перебивают
- Обсуждают: какую ситуацию предложить, какой конфликт показать, какой паттерн Насти проработать
- С юмором и сарказмом, но по делу - это РАБОЧАЯ встреча
- Короткие реплики до 100 символов
- Каждая планета имеет свой характер и стиль общения
- Они СПОРЯТ между собой, предлагают разные варианты, критикуют идеи друг друга

Характеры планет:
- Луна: эмпатичная, чувствительная, заботливая
- Плутон: тёмный, провокационный, любит копать глубоко
- Венера: романтичная, про любовь и отношения
- Марс: агрессивный, прямолинейный, за действия
- Сатурн: строгий, серьёзный, учитель
- Меркурий: логичный, аналитичный, структурный
- Нептун: туманный, мечтательный, запутывающий
- Уран: непредсказуемый, революционный, хаотичный
- Юпитер: философский, видит большую картину
- Хирон: знает про раны и исцеление

Пример диалога (25-30 фраз):
Луна: "Так, коллеги, собрались? Что сегодня для Насти придумаем?"
Плутон: "У меня тут идейка тёмненькая про её скрытые страхи..."
Венера: "Плутон, хватит пугать! Давай про отношения лучше."
Марс: "Опять отношения? Может, конфликт какой устроим?"
Луна: "Она конфликты не любит, сразу в себя уйдёт."
Сатурн: "Вот поэтому и надо! Пора учиться."
Меркурий: "Давайте логично подумаем. Какой паттерн проработаем?"
Нептун: "А может, запутаем её? Пусть сама разбирается..."
Уран: "Или я всё переверну! Неожиданный поворот!"
Юпитер: "Стоп, а в чём смысл истории?"
... (продолжай до 25-30 фраз)

JSON:
{"dialogue": [{"planet": "Луна", "message": "..."}, {"planet": "Плутон", "message": "..."}, ...]}

Только JSON.`;

  try {
    console.log('[PlanetMessages] Starting AI call');

    const result = await callAI({
      system: 'Создаёшь живые диалоги планет с разными характерами. JSON только.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      maxTokens: 2500,
      claudeApiKey,
      claudeProxyUrl,
      openAIApiKey,
      openAIProxyUrl,
    });

    let text = result.text.trim().replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);

    const dialogue: PlanetDialogueMessage[] = (parsed?.dialogue || [])
      .filter((msg: any) => msg?.planet && msg?.message)
      .map((msg: any) => ({
        planet: msg.planet.trim(),
        message: msg.message.trim(),
      }));

    if (dialogue.length < 20) {
      throw new Error('Недостаточно фраз в диалоге');
    }

    console.log('[PlanetMessages] ✅ Generated', dialogue.length, 'messages');

    return {
      dialogue,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('[PlanetMessages] Failed to generate via AI:', error);
    throw new Error('Планеты ушли на перекур 🌙☕ Попробуй обновить страницу!');
  }
}
