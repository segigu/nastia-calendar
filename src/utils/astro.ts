import * as Astronomy from 'astronomy-engine';
import { DateTime } from 'luxon';
import {
  ASTRO_PROFILES,
  PRIMARY_PROFILE_ID,
  type AstroProfile,
} from '../data/astroProfiles';

type PlanetId =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto';

interface PlanetDefinition {
  id: PlanetId;
  body: Astronomy.Body;
  transitLabel: string;
  natalAccusative: string;
}

interface PlanetPosition {
  planet: PlanetId;
  longitude: number; // degrees 0-360
}

interface AspectDefinition {
  name: AspectName;
  angle: number;
  orb: number;
}

type AspectName = 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition';

interface AspectMatch {
  transitPlanet: PlanetId;
  natalPlanet: PlanetId;
  aspect: AspectName;
  orb: number;
}

const PLANETS: PlanetDefinition[] = [
  { id: 'Sun', body: Astronomy.Body.Sun, transitLabel: 'транзитное Солнце', natalAccusative: 'Солнце' },
  { id: 'Moon', body: Astronomy.Body.Moon, transitLabel: 'транзитная Луна', natalAccusative: 'Луну' },
  { id: 'Mercury', body: Astronomy.Body.Mercury, transitLabel: 'транзитный Меркурий', natalAccusative: 'Меркурий' },
  { id: 'Venus', body: Astronomy.Body.Venus, transitLabel: 'транзитная Венера', natalAccusative: 'Венеру' },
  { id: 'Mars', body: Astronomy.Body.Mars, transitLabel: 'транзитный Марс', natalAccusative: 'Марс' },
  { id: 'Jupiter', body: Astronomy.Body.Jupiter, transitLabel: 'транзитный Юпитер', natalAccusative: 'Юпитер' },
  { id: 'Saturn', body: Astronomy.Body.Saturn, transitLabel: 'транзитный Сатурн', natalAccusative: 'Сатурн' },
  { id: 'Uranus', body: Astronomy.Body.Uranus, transitLabel: 'транзитный Уран', natalAccusative: 'Уран' },
  { id: 'Neptune', body: Astronomy.Body.Neptune, transitLabel: 'транзитный Нептун', natalAccusative: 'Нептун' },
  { id: 'Pluto', body: Astronomy.Body.Pluto, transitLabel: 'транзитный Плутон', natalAccusative: 'Плутон' },
];

const ASPECTS: AspectDefinition[] = [
  { name: 'conjunction', angle: 0, orb: 6 },
  { name: 'sextile', angle: 60, orb: 4 },
  { name: 'square', angle: 90, orb: 5 },
  { name: 'trine', angle: 120, orb: 5 },
  { name: 'opposition', angle: 180, orb: 6 },
];

const PLANET_THEMES: Record<PlanetId, string> = {
  Sun: 'твоя самооценка и жизненный курс',
  Moon: 'эмоциональные качели дома',
  Mercury: 'мысли, язык и нервяк',
  Venus: 'отношения, комфорт и деньги',
  Mars: 'действия, злость и секс',
  Jupiter: 'амбиции и рост',
  Saturn: 'ответственность и ограничения',
  Uranus: 'внезапные перемены и свобода',
  Neptune: 'мечты, туман и самообман',
  Pluto: 'трансформации и контроль',
};

const ASPECT_TONES: Record<AspectName, string> = {
  conjunction: 'сливается с',
  sextile: 'подталкивает к мягким шагам навстречу',
  square: 'устраивает конфликт с',
  trine: 'даёт лёгкий проход к',
  opposition: 'тянет в разные стороны с',
};

const ASPECT_EFFECTS: Record<AspectName, string> = {
  conjunction: 'Всё внимание собирается на этой теме — избежать не выйдет.',
  sextile: 'Используй шанс, пока волна мягкая и не требует жертв.',
  square: 'Взрывоопасно, придётся реагировать и разгребать.',
  trine: 'Можно прогрессировать без особых усилий.',
  opposition: 'Важно найти баланс, иначе качнёт в крайности.',
};

const RELATIONSHIP_PLANETS: PlanetId[] = ['Venus', 'Mars', 'Moon'];

const TRANSIT_ZONE = 'Europe/Berlin';

const natalCache = new Map<AstroProfile['id'], PlanetPosition[]>();

function normalizeAngle(angle: number): number {
  const result = angle % 360;
  return result < 0 ? result + 360 : result;
}

function smallestAngleDiff(a: number, b: number): number {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function findAspect(diff: number): AspectDefinition | null {
  for (const aspect of ASPECTS) {
    if (Math.abs(diff - aspect.angle) <= aspect.orb) {
      return aspect;
    }
  }
  return null;
}

function toAstroTime(dateISO: string, timeISO: string | undefined, zone: string): Astronomy.AstroTime {
  const local = DateTime.fromISO(`${dateISO}T${timeISO ?? '12:00'}`, { zone });
  const safe = local.isValid ? local : DateTime.fromISO(dateISO, { zone: 'UTC' }).set({ hour: 12 });
  return Astronomy.MakeTime(safe.toJSDate());
}

function computePlanetPositions(time: Astronomy.AstroTime): PlanetPosition[] {
  return PLANETS.map(({ id, body }) => {
    const vector = Astronomy.GeoVector(body, time, true);
    const ecliptic = Astronomy.Ecliptic(vector);
    return {
      planet: id,
      longitude: normalizeAngle(ecliptic.elon),
    };
  });
}

function getNatalPositions(profileId: AstroProfile['id']): PlanetPosition[] {
  if (natalCache.has(profileId)) {
    return natalCache.get(profileId)!;
  }

  const profile = ASTRO_PROFILES[profileId];
  if (!profile) {
    throw new Error(`Unknown astro profile: ${profileId}`);
  }

  const time = toAstroTime(profile.birthDate, profile.birthTime, profile.timeZone);
  const positions = computePlanetPositions(time);
  natalCache.set(profileId, positions);
  return positions;
}

function computeTransits(isoDate: string): PlanetPosition[] {
  const time = toAstroTime(isoDate, '12:00', TRANSIT_ZONE);
  return computePlanetPositions(time);
}

function findAspectsBetween(transits: PlanetPosition[], natal: PlanetPosition[]): AspectMatch[] {
  const matches: AspectMatch[] = [];

  for (const transit of transits) {
    for (const nat of natal) {
      const diff = smallestAngleDiff(transit.longitude, nat.longitude);
      const aspect = findAspect(diff);
      if (aspect) {
        matches.push({
          transitPlanet: transit.planet,
          natalPlanet: nat.planet,
          aspect: aspect.name,
          orb: Math.abs(diff - aspect.angle),
        });
      }
    }
  }

  return matches.sort((a, b) => a.orb - b.orb);
}

function describeRelationshipImpact(aspect: AspectName): string {
  switch (aspect) {
    case 'conjunction':
      return 'С Серёжей может накрыть волной близости и взаимных требований одновременно.';
    case 'sextile':
      return 'Есть шанс спокойно договориться с Серёжей, если не заорёте друг на друга первыми.';
    case 'square':
      return 'Готовься к перепалке с Серёжей — искры летят, но можно выговориться по-честному.';
    case 'trine':
      return 'С Серёжей получится поймать общий вайб и даже расслабиться вместе.';
    case 'opposition':
      return 'Придётся балансировать с Серёжей: вас тянет в разные стороны, но договориться можно.';
    default:
      return '';
  }
}

function describeAspect(match: AspectMatch, target: 'nastia' | 'sergey'): string {
  const { transitPlanet, natalPlanet, aspect } = match;
  const transitDef = PLANETS.find(p => p.id === transitPlanet)!;
  const natalAccusative = PLANETS.find(p => p.id === natalPlanet)!.natalAccusative;

  if (target === 'nastia') {
    const base = `${transitDef.transitLabel} ${ASPECT_TONES[aspect]} твою ${natalAccusative} — ${PLANET_THEMES[natalPlanet]}. ${ASPECT_EFFECTS[aspect]}`;

    if (
      RELATIONSHIP_PLANETS.includes(transitPlanet) ||
      RELATIONSHIP_PLANETS.includes(natalPlanet)
    ) {
      return `${base} ${describeRelationshipImpact(aspect)}`;
    }

    return base;
  }

  // target === 'sergey'
  const base = `${transitDef.transitLabel} ${ASPECT_TONES[aspect]} ${natalAccusative} Серёжи. ${ASPECT_EFFECTS[aspect]}`;

  if (
    RELATIONSHIP_PLANETS.includes(transitPlanet) ||
    RELATIONSHIP_PLANETS.includes(natalPlanet)
  ) {
    return `${base} Это прямой триггер для ваших отношений — учитывай настроение Серёжи.`;
  }

  return `${base} Это фон, который влияет и на Серёжу, и на вас двоих опосредованно.`;
}

export function buildAstroHighlights(isoDate: string, maxPerPerson = 4): string[] {
  let highlights: string[] = [];

  try {
    const transits = computeTransits(isoDate);

    const nastiaNatal = getNatalPositions(PRIMARY_PROFILE_ID);
    const nastiaAspects = findAspectsBetween(transits, nastiaNatal)
      .slice(0, maxPerPerson)
      .map(match => describeAspect(match, 'nastia'));

    const sergeyNatal = getNatalPositions('sergey');
    const sergeyAspects = findAspectsBetween(transits, sergeyNatal)
      .filter(match =>
        RELATIONSHIP_PLANETS.includes(match.transitPlanet) ||
        RELATIONSHIP_PLANETS.includes(match.natalPlanet)
      )
      .slice(0, Math.max(1, Math.floor(maxPerPerson / 2)))
      .map(match => describeAspect(match, 'sergey'));

    highlights = [...nastiaAspects, ...sergeyAspects];
  } catch (error) {
    console.warn('Failed to build astro highlights', error);
  }

  return highlights;
}
