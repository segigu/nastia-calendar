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
    id: 'trust-vs-reason',
    question: 'Могу ли я доверять своим чувствам, когда разум говорит иное?',
    theme: 'Эмоции и логика',
    astroIndicators: [
      'Луна в конфликте с Меркурием',
      'Луна в квадрате/оппозиции с Сатурном',
      'Меркурий в водном знаке vs Луна в воздушном',
    ],
    commonTraps: [
      {
        name: 'Рационализация чувств',
        description: 'Попытка объяснить эмоции логикой, вместо того чтобы их прожить',
      },
      {
        name: 'Игнорирование интуиции',
        description: 'Отказ от внутреннего знания в пользу "разумных" аргументов',
      },
      {
        name: 'Эмоциональное онемение',
        description: 'Выбор не чувствовать, чтобы не ошибиться',
      },
    ],
    scenarios: [
      {
        id: 'night-lab',
        setting: 'Лаборатория ночью',
        situation: 'Ты исследуешь важные данные, но цифры не совпадают с ощущением истины',
        symbolism: 'Ум против интуиции',
      },
      {
        id: 'twilight-hospital',
        setting: 'Больничный коридор в сумерках',
        situation: 'Врачи настаивают на решении, а твоя интуиция шепчет другое',
        symbolism: 'Доверие авторитету vs внутренний голос',
      },
      {
        id: 'afterhours-office',
        setting: 'Пустой офис вечером',
        situation: 'Документ выглядит безупречно, но внутри нарастает тревога',
        symbolism: 'Рациональная правда vs эмоциональная правда',
      },
    ],
    choicePoints: [
      'Поверить цифрам или телу?',
      'Следовать плану или импульсу?',
      'Объяснить чувство или позволить ему быть?',
    ],
  },
  {
    id: 'desire-vs-duty',
    question: 'Имею ли я право на свои желания, если они идут вразрез с обязанностями?',
    theme: 'Желания и долг',
    astroIndicators: [
      'Венера в напряжении с Сатурном',
      'Луна-Сатурн',
      'Солнце в квадрате к Сатурну',
    ],
    commonTraps: [
      {
        name: 'Самопожертвование',
        description: 'Отказ от желаний ради роли ответственной дочери/подруги/сотрудницы',
      },
      {
        name: 'Откладывание жизни',
        description: 'Жить по принципу «потом, когда всё сделаю»',
      },
      {
        name: 'Вина за удовольствие',
        description: 'Наказывать себя за любые проявления лёгкости',
      },
    ],
    scenarios: [
      {
        id: 'dawn-station',
        setting: 'Пустой вокзал на рассвете',
        situation: 'В руках билет в город мечты, но телефон взрывается сообщениями от близких',
        symbolism: 'Побег к себе vs удержание обязательствами',
      },
      {
        id: 'locked-toy-store',
        setting: 'Закрытый магазин игрушек ночью',
        situation: 'Ты видишь за стеклом вещь детской мечты и решаешь: взять или пройти мимо',
        symbolism: 'Разрешить себе радость',
      },
      {
        id: 'attic-dreams',
        setting: 'Чердак родительского дома',
        situation: 'В коробках — твои старые мечты, и нужно выбрать: выбросить или дать им шанс',
        symbolism: 'Возвращение к забытому желанию',
      },
    ],
    choicePoints: [
      'Остаться или уехать?',
      'Взять желаемое или отказаться?',
      'Вспомнить мечту или похоронить?',
    ],
  },
  {
    id: 'vulnerability-vs-control',
    question: 'Смогу ли я позволить себе быть уязвимой, не потеряв контроль?',
    theme: 'Уязвимость и контроль',
    astroIndicators: [
      'Плутон-Луна',
      'Сатурн-Луна/Венера',
      'Скорпион или 8-й дом',
    ],
    commonTraps: [
      {
        name: 'Гиперконтроль',
        description: 'Пытаться держать всё под контролем, чтобы не столкнуться с хаосом',
      },
      {
        name: 'Эмоциональная броня',
        description: 'Скрывать чувства, чтобы никто не увидел слабости',
      },
      {
        name: 'Манипуляция силой',
        description: 'Использовать власть, чтобы управлять другими вместо честности',
      },
    ],
    scenarios: [
      {
        id: 'rooftop-night',
        setting: 'Крыша небоскрёба в ветреную ночь',
        situation: 'Тебя просят отпустить перила и довериться',
        symbolism: 'Отпускание контроля как свободное падение',
      },
      {
        id: 'narrow-forest-path',
        setting: 'Тёмный лес с узкой тропой',
        situation: 'Фонарик гаснет, и нужно идти в темноте либо ждать рассвет',
        symbolism: 'Движение в неизвестность без карты',
      },
      {
        id: 'cracking-ice',
        setting: 'Замёрзшее озеро в сумерках',
        situation: 'Лёд трещит под ногами, и нужно выбрать: бежать или замереть',
        symbolism: 'Хрупкость контроля и риск провала',
      },
    ],
    choicePoints: [
      'Отпустить контроль или держаться?',
      'Показать слабость или сохранить маску?',
      'Довериться или рассчитывать на себя?',
    ],
  },
  {
    id: 'authenticity-vs-expectations',
    question: 'Кто я, если перестану соответствовать чужим ожиданиям?',
    theme: 'Идентичность и роли',
    astroIndicators: [
      'Солнце-Сатурн/Плутон',
      'Луна в 10-м доме',
      'Сильный карьерный акцент',
    ],
    commonTraps: [
      {
        name: 'Перфекционизм',
        description: 'Стремление быть идеальной версией себя',
      },
      {
        name: 'Потеря в ролях',
        description: 'Жить чужими сценариями и забыть собственный голос',
      },
      {
        name: 'Страх отвержения',
        description: 'Верить, что настоящую тебя не примут',
      },
    ],
    scenarios: [
      {
        id: 'empty-dressing-room',
        setting: 'Пустая гримёрка после спектакля',
        situation: 'Ты снимаешь грим и не узнаёшь себя в зеркале',
        symbolism: 'Маска и лицо под ней',
      },
      {
        id: 'closed-fitting-room',
        setting: 'Примерочная в закрытом магазине',
        situation: 'Ты застряла в чужой одежде, которая выглядит идеально, но душит',
        symbolism: 'Чужие роли как тесный костюм',
      },
      {
        id: 'silent-recording-booth',
        setting: 'Студия звукозаписи',
        situation: 'Нужно записать сообщение, но какой голос выбрать?',
        symbolism: 'Поиск своего звучания',
      },
    ],
    choicePoints: [
      'Снять маску или держать образ?',
      'Сказать правду или то, что ждут?',
      'Быть собой или удобной версией?',
    ],
  },
  {
    id: 'release-past',
    question: 'Как отпустить прошлое, которое всё ещё держит меня?',
    theme: 'Прошлое и освобождение',
    astroIndicators: [
      'Сатурн/Плутон 4/12 дом',
      'Южный узел с личными планетами',
      'Сильная ретроспекция',
    ],
    commonTraps: [
      {
        name: 'Застревание',
        description: 'Постоянное проигрывание старых обид',
      },
      {
        name: 'Идеализация или демонизация',
        description: 'Видеть прошлое только белым или чёрным, чтобы не встретиться с реальностью',
      },
      {
        name: 'Месть как зависание',
        description: 'Иллюзия, что возмездие освободит',
      },
    ],
    scenarios: [
      {
        id: 'dusty-basement',
        setting: 'Подвал с коробками',
        situation: 'Каждая вещь — воспоминание, и нужно решить, что оставить',
        symbolism: 'Материализация памяти',
      },
      {
        id: 'stormy-shore',
        setting: 'Берег в шторм',
        situation: 'Волны разрушают песчаный замок, построенный годами',
        symbolism: 'Разрушение старых структур',
      },
      {
        id: 'abandoned-childhood-home',
        setting: 'Заброшенный дом детства',
        situation: 'Призраки прошлого пытаются удержать тебя внутри',
        symbolism: 'Возвращение к истокам ради завершения',
      },
    ],
    choicePoints: [
      'Сохранить или отпустить?',
      'Простить или держать обиду?',
      'Вернуться или шагнуть вперёд?',
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
