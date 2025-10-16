/**
 * Структуры данных и утилиты для работы с психологическими контрактами,
 * которые модель придумывает на лету.
 */

export interface PsychologicalTrap {
  name: string;
  description: string;
}

export interface ContractScenario {
  id: string; // kebab-case идентификатор
  setting: string;
  situation: string;
  symbolism: string;
}

export interface PsychologicalContract {
  id: string; // kebab-case идентификатор
  question: string;
  theme: string;
  astroIndicators: string[];
  commonTraps: PsychologicalTrap[];
  scenarios: ContractScenario[];
  choicePoints: string[];
}

export interface GeneratedContractPayload {
  contract: PsychologicalContract;
  recommendedScenarioId?: string;
}

export const FALLBACK_CONTRACTS: PsychologicalContract[] = [
  {
    id: 'work-boundaries',
    question: 'Могу ли я отказаться от сверхурочной работы, если это нужно мне?',
    theme: 'Границы на работе',
    astroIndicators: [
      'Сатурн-Солнце (долг vs своя воля)',
      'Луна-Сатурн (чувство вины)',
      '10-й дом перегружен',
    ],
    commonTraps: [
      {
        name: 'Быть незаменимой',
        description: 'Верить, что без тебя всё развалится, поэтому нельзя отказать',
      },
      {
        name: 'Вина за отдых',
        description: 'Чувствовать себя плохим сотрудником, если защищаешь свои границы',
      },
      {
        name: 'Откладывание жизни',
        description: 'Жить по принципу "потом отдохну", когда закончатся проекты',
      },
    ],
    scenarios: [
      {
        id: 'friday-overtime',
        setting: 'Офис в пятницу в 18:00',
        situation: 'Начальник просит остаться на выходные ради срочного проекта, но ты планировала поездку с друзьями',
        symbolism: 'Работа vs личная жизнь',
      },
      {
        id: 'sick-day-call',
        setting: 'Твоя квартира утром',
        situation: 'Ты болеешь, но коллега звонит и просит помочь с презентацией, потому что "только ты знаешь"',
        symbolism: 'Ответственность vs забота о себе',
      },
      {
        id: 'vacation-messages',
        setting: 'Пляж в отпуске',
        situation: 'В рабочем чате написали "срочно", и ты чувствуешь, что должна ответить прямо сейчас',
        symbolism: 'Право на отключение',
      },
    ],
    choicePoints: [
      'Остаться или уехать в поездку?',
      'Помочь больной или отказать?',
      'Ответить на сообщение или игнорировать?',
    ],
  },
  {
    id: 'family-pressure',
    question: 'Могу ли я отказать родителям, если это важно для меня?',
    theme: 'Семья и границы',
    astroIndicators: [
      'Луна-Сатурн (долг перед семьёй)',
      '4-й дом перегружен',
      'Солнце в квадрате к Луне (я vs семья)',
    ],
    commonTraps: [
      {
        name: 'Быть хорошей дочерью',
        description: 'Верить, что отказ = предательство семьи',
      },
      {
        name: 'Вина за свою жизнь',
        description: 'Чувствовать себя эгоисткой, если живёшь по-своему',
      },
      {
        name: 'Откладывание своих планов',
        description: 'Жертвовать своими целями ради родительских просьб',
      },
    ],
    scenarios: [
      {
        id: 'weekend-repair',
        setting: 'Кухня родительской квартиры',
        situation: 'Мама просит приехать на выходные помочь с ремонтом, но ты планировала отдохнуть после тяжёлой недели',
        symbolism: 'Семейный долг vs забота о себе',
      },
      {
        id: 'career-choice',
        setting: 'Семейный ужин дома',
        situation: 'Отец говорит, что твоя работа "несерьёзная", и предлагает устроиться к его знакомому на "нормальное место"',
        symbolism: 'Свой путь vs родительские ожидания',
      },
      {
        id: 'holiday-visit',
        setting: 'Твоя квартира перед праздниками',
        situation: 'Мама обиделась, что ты хочешь встретить Новый год с друзьями, а не с семьёй, как всегда',
        symbolism: 'Традиции vs новые потребности',
      },
    ],
    choicePoints: [
      'Приехать на ремонт или отдохнуть?',
      'Защитить свой выбор или согласиться?',
      'Встретить праздник с семьёй или с друзьями?',
    ],
  },
  {
    id: 'friendship-boundaries',
    question: 'Могу ли я сказать подруге правду, если это разрушит наши отношения?',
    theme: 'Дружба и честность',
    astroIndicators: [
      'Венера-Плутон (страх потери близости)',
      'Луна-Сатурн (страх отвержения)',
      '7-й/11-й дом напряжён',
    ],
    commonTraps: [
      {
        name: 'Держать всё в себе',
        description: 'Молчать о раздражении, чтобы не испортить отношения',
      },
      {
        name: 'Терпеть токсичность',
        description: 'Оправдывать плохое поведение друга, потому что "у неё трудности"',
      },
      {
        name: 'Растворяться в другом',
        description: 'Забывать свои границы ради сохранения дружбы',
      },
    ],
    scenarios: [
      {
        id: 'cafe-complaint',
        setting: 'Кафе в выходной день',
        situation: 'Подруга в третий раз за месяц жалуется на одну и ту же проблему, не слушая твои советы, и ты устала',
        symbolism: 'Эмоциональный труд vs свои границы',
      },
      {
        id: 'borrowed-money',
        setting: 'Твоя квартира вечером',
        situation: 'Подруга снова просит денег в долг, хотя не вернула предыдущую сумму три месяца назад',
        symbolism: 'Помощь vs использование',
      },
      {
        id: 'cancelled-plans',
        setting: 'Парк, где вы договорились встретиться',
        situation: 'Подруга в четвёртый раз отменяет встречу в последний момент, и ты злишься, но молчишь',
        symbolism: 'Уважение vs конфликтофобия',
      },
    ],
    choicePoints: [
      'Сказать правду или промолчать?',
      'Отказать или снова дать денег?',
      'Высказать обиду или сделать вид, что всё нормально?',
    ],
  },
  {
    id: 'social-expectations',
    question: 'Могу ли я быть собой, если это не нравится окружающим?',
    theme: 'Образ и искренность',
    astroIndicators: [
      'Солнце-Сатурн (страх осуждения)',
      'Луна в 10-м доме (зависимость от оценок)',
      'Венера-Сатурн (подавление себя)',
    ],
    commonTraps: [
      {
        name: 'Играть роль',
        description: 'Показывать только удобную версию себя',
      },
      {
        name: 'Угождать всем',
        description: 'Менять мнение в зависимости от собеседника',
      },
      {
        name: 'Скрывать чувства',
        description: 'Делать вид, что всё хорошо, когда на самом деле больно',
      },
    ],
    scenarios: [
      {
        id: 'party-small-talk',
        setting: 'Вечеринка у коллеги',
        situation: 'Все обсуждают популярный сериал, который тебе не нравится, и ты делаешь вид, что разделяешь восторг',
        symbolism: 'Притворство vs одиночество',
      },
      {
        id: 'family-gathering',
        setting: 'Семейное застолье',
        situation: 'Тётя спрашивает про личную жизнь и осуждает твой выбор, а ты молчишь, чтобы не скандалить',
        symbolism: 'Мир vs честность',
      },
      {
        id: 'instagram-photo',
        setting: 'Твоя квартира перед публикацией в Instagram',
        situation: 'Ты выбираешь фото: настоящее с усталым лицом или приукрашенное с улыбкой',
        symbolism: 'Реальность vs образ',
      },
    ],
    choicePoints: [
      'Признаться в своём мнении или промолчать?',
      'Защитить себя или избежать конфликта?',
      'Показать реальную жизнь или идеальную картинку?',
    ],
  },
  {
    id: 'relationship-choice',
    question: 'Могу ли я уйти из отношений, если они не делают меня счастливой?',
    theme: 'Отношения и выбор',
    astroIndicators: [
      'Венера-Сатурн (страх одиночества)',
      'Луна-Плутон (боязнь потери)',
      '7-й дом напряжён',
    ],
    commonTraps: [
      {
        name: 'Терпеть ради стабильности',
        description: 'Оставаться в плохих отношениях, потому что привычно',
      },
      {
        name: 'Надеяться на изменение',
        description: 'Ждать, что партнёр станет другим, вместо того чтобы принять решение',
      },
      {
        name: 'Бояться одиночества',
        description: 'Верить, что быть одной хуже, чем быть несчастной в паре',
      },
    ],
    scenarios: [
      {
        id: 'silent-dinner',
        setting: 'Ресторан на годовщину отношений',
        situation: 'Вы молчите уже 20 минут, и ты понимаешь, что вам больше не о чем говорить',
        symbolism: 'Пустота вместо близости',
      },
      {
        id: 'apartment-choice',
        setting: 'Твоя квартира, обсуждение переезда',
        situation: 'Партнёр предлагает съехаться, но ты чувствуешь, что это ловушка, а не шаг вперёд',
        symbolism: 'Обязательства vs свобода',
      },
      {
        id: 'friends-question',
        setting: 'Кафе с лучшей подругой',
        situation: 'Подруга в третий раз спрашивает: "Ты точно счастлива с ним?", и ты не знаешь, что ответить',
        symbolism: 'Честность с собой',
      },
    ],
    choicePoints: [
      'Остаться или уйти?',
      'Согласиться на переезд или отказаться?',
      'Признаться себе в правде или продолжать верить в лучшее?',
    ],
  },
];

const FALLBACK_ID = 'contract-' + Date.now().toString(36);

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(item => item.length > 0);
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (base.length > 0) {
    return base;
  }

  const ascii = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/-$/g, '');

  return ascii.length > 0 ? ascii : `${FALLBACK_ID}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeScenario(raw: unknown): ContractScenario | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const idSource = toTrimmedString((raw as any).id || (raw as any).slug || '');
  const id = idSource.length > 0 ? slugify(idSource) : `${FALLBACK_ID}-scene-${Math.random().toString(36).slice(2, 8)}`;

  const setting = toTrimmedString((raw as any).setting);
  const situation = toTrimmedString((raw as any).situation);
  const symbolism = toTrimmedString((raw as any).symbolism);

  if (!setting || !situation || !symbolism) {
    return null;
  }

  return {
    id,
    setting,
    situation,
    symbolism,
  };
}

function normalizeTraps(raw: unknown): PsychologicalTrap[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const name = toTrimmedString((item as any).name);
      const description = toTrimmedString((item as any).description);

      if (!name || !description) {
        return null;
      }

      return { name, description };
    })
    .filter((item): item is PsychologicalTrap => item !== null);
}

export function normalizePsychologicalContract(raw: unknown): PsychologicalContract | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Record<string, unknown>;

  const id = slugify(
    toTrimmedString(data.id ?? data.slug ?? data.contractId ?? data.identifier ?? FALLBACK_ID),
  );
  const question = toTrimmedString(data.question ?? data.coreQuestion);
  const theme = toTrimmedString(data.theme ?? data.focusTheme);
  const astroIndicators = toStringArray(
    data.astroIndicators ?? data.astro_indicators ?? data.astrology ?? [],
  );
  const commonTraps = normalizeTraps(data.commonTraps ?? data.common_traps);

  const scenarioArray: unknown[] = Array.isArray(data.scenarios) ? data.scenarios : [];
  const scenarios = scenarioArray
    .map(normalizeScenario)
    .filter((item): item is ContractScenario => item !== null);

  const choicePoints = toStringArray(
    data.choicePoints ?? data.choice_points ?? data.keyChoices ?? [],
  );

  if (!question || !theme || astroIndicators.length === 0 || commonTraps.length === 0 || scenarios.length === 0 || choicePoints.length === 0) {
    return null;
  }

  return {
    id,
    question,
    theme,
    astroIndicators,
    commonTraps,
    scenarios,
    choicePoints,
  };
}

export function findScenarioById(
  contract: PsychologicalContract,
  scenarioId?: string,
): ContractScenario {
  if (scenarioId) {
    const found = contract.scenarios.find(item => item.id === scenarioId);
    if (found) {
      return found;
    }
  }

  return contract.scenarios[Math.floor(Math.random() * contract.scenarios.length)];
}

export function getFallbackContract(
  recentContractIds: string[],
  recentScenarioPairs: string[],
): GeneratedContractPayload {
  const recentSet = new Set(recentContractIds);
  const scenarioSet = new Set(recentScenarioPairs);

  let contract =
    FALLBACK_CONTRACTS.find(entry => !recentSet.has(entry.id)) ?? FALLBACK_CONTRACTS[0]!;

  let scenario =
    contract.scenarios.find(item => !scenarioSet.has(`${contract.id}/${item.id}`)) ??
    contract.scenarios[Math.floor(Math.random() * contract.scenarios.length)];

  return {
    contract,
    recommendedScenarioId: scenario.id,
  };
}
