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

  const prompt = `Создай 25-30 фраз диалога планет (Луна, Плутон, Нептун, Уран, Венера, Сатурн, Хирон, Меркурий, Марс, Юпитер), обсуждающих историю для Насти.

Настя: ${BIRTH_DATA_TEXT}. ${CHART_ANALYSIS_TEXT}

Связный разговор с юмором, планеты спорят о её характере. Короткие реплики до 100 символов.

JSON:
{"dialogue": [{"planet": "Луна", "message": "..."}, ...]}

Только JSON без markdown.`;

  try {
    console.log('[PlanetMessages] Starting AI call');

    const result = await callAI({
      system: 'Создаёшь диалоги планет. JSON только.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 2000,
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
