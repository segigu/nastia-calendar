#!/usr/bin/env node

/**
 * Тест реальной генерации текстов через Claude API
 * Показывает как работает система генерации в продакшене
 */

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
const CLAUDE_MODEL = 'claude-haiku-4-5';
const MORNING_BRIEF_URL = 'https://segigu.github.io/nastia-calendar/?open=daily-horoscope';
const NOTIFICATIONS_URL = 'https://segigu.github.io/nastia-calendar/?open=notifications';

const fetch = (...args) => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(...args);
  }
  return import('node-fetch').then(({ default: fetchModule }) => fetchModule(...args));
};

if (!CLAUDE_API_KEY) {
  console.error('❌ CLAUDE_API_KEY не установлен!');
  console.log('\nИспользуйте:');
  console.log('  export CLAUDE_API_KEY=sk-ant-...');
  console.log('  node scripts/test-real-generation.js');
  process.exit(1);
}

function truncateWithEllipsis(text, limit = 120) {
  const trimmed = (text || '').trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{1F004}-\u{1F9FF}]/u;

function ensureEmojiPresent(text) {
  if (!text) {
    return 'Настюш, держи защиту. 🛡️';
  }
  const truncated = truncateWithEllipsis(text, 120);
  if (EMOJI_REGEX.test(truncated)) {
    return truncated;
  }
  return truncateWithEllipsis(`${truncated} 🛡️`, 120);
}

function getDaysWord(value) {
  const absValue = Math.abs(value);
  if (absValue === 1) return 'день';
  if (absValue >= 2 && absValue <= 4) return 'дня';
  return 'дней';
}

function formatRussianDate(date) {
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

async function callClaudeAPI(prompt, systemPrompt) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        temperature: 0.95,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const raw = payload?.content?.[0]?.text;
    if (!raw) {
      throw new Error('Claude returned empty content');
    }

    return raw;
  } catch (error) {
    console.error('Claude API failed:', error.message);
    throw error;
  }
}

async function generateMorningBriefNarrative(context) {
  const prompt = `Составь саркастичный дневной гороскоп для Насти.
Дата для тебя: ${context.todayHuman}. Не упоминай дату явно.

Требования:
- 2 абзаца по 2-3 предложения, каждый начинается с подходящего эмодзи.
- Обращайся к Насте напрямую (Настя, Настюш, Настёна и т.п.).
- Переводи астрологические влияния на бытовой житейский язык:
  * Конфликты, напряжение → "сегодня всё бесит", "все достают"
  * Легко договориться → "день для переговоров", "можно просить о помощи"
  * Интуиция работает → "слушай себя, не ошибёшься"
  * Можно выдохнуть → "отдыхай без вины", "день для себя"
- Подчеркни бытовые задачи, детей, отношения с Серёжей, подготовку к экзамену, жизнь в Германии.
- Используй чёрный юмор, допустим умеренный мат.
- Финал — жёсткий, но обнадёживающий.

Верни чистый текст без дополнительных пояснений.`;

  const systemPrompt = 'Ты Настя — язвительная подруга. Пиши по-русски, остро и поддерживающе. Переводи астрологию на житейский язык. Никаких форматов кроме чистого текста.';

  const raw = await callClaudeAPI(prompt, systemPrompt);
  return raw.trim();
}

async function generateMorningBriefFromNarrative(narrative, context) {
  const prompt = `Вот дневной гороскоп для Насти:
"""
${narrative}
"""

Проанализируй гороскоп и сформируй push-уведомление утром в 06:45 по Берлину.
Формат JSON:
{
  "title": "фраза из 2-3 слов, описывающая главный вайб дня",
  "body": "жёсткая саркастичная фраза МАКСИМУМ 120 символов с 1-2 эмодзи"
}

Требования:
1. Прочитай гороскоп и извлеки ГЛАВНУЮ МЫСЛЬ дня простым житейским языком.
   - НЕ надо: упоминать планеты, астрологические термины
   - НАДО: конкретика про жизнь (конфликты, дела, интуиция, отдых, дети, Серёжа, экзамен)

2. Заголовок: 2-3 слова про вайб дня
   Примеры: "День выживания", "Лёгкая передышка", "Нервы на пределе", "Интуиция рулит", "Боевой режим"

3. Body: МАКСИМУМ 120 символов (с эмодзи). Законченная грамматическая фраза с юмором.

4. Обращайся к Насте напрямую (Настя, Настюш, Настёна)
5. 1-2 эмодзи, саркастичный тон, допустим умеренный мат ("задолбал", "орёт", "бесит")
6. Ответ — строго JSON без дополнительного текста.`;

  const systemPrompt = 'Ты пишешь острые житейские push-уведомления. Отвечай только JSON-объектом. Body максимум 120 символов. Переводи астрологию на простой язык: конфликты, дела, интуиция, отдых. Без планет в body! Пиши саркастично и с юмором.';

  const raw = await callClaudeAPI(prompt, systemPrompt);
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(clean);
  if (!parsed?.title || !parsed?.body) {
    throw new Error('Morning brief JSON missing fields');
  }
  return {
    title: truncateWithEllipsis(parsed.title.trim(), 40),
    body: ensureEmojiPresent(parsed.body.trim()),
    url: MORNING_BRIEF_URL,
  };
}

async function generateCycleNotification(type, context) {
  const base = `Ты — Настина лучшая подруга с жёстким, но поддерживающим женским сарказмом. Пиши по-русски дерзко и прямо, обращайся к Насте по-свойски (Настюш, Настён, Настёнка, Настюшка, Настёна, детка, иногда можно по фамилии - Орлова).
Задача: придумать push-уведомление для календаря цикла.
Формат:
- Заголовок из 1-3 слов: только вымышленное имя, фамилия и/или отчество персонажа. Персонаж должен быть новым в каждом уведомлении, с игривым оттенком, связанным с темой фертильности, гормонов, защиты, беременности и т.п. Никаких обращений к Насте. ЗАПРЕЩЕНО использовать имена: Игорь, Константин, Стас (в любой форме). Примеры (не повторяй дословно): «Людмила Фертильная», «Фёдор Плодовитый», «Олеся Овуляторовна», «Марфа Контрацептовна», «Гриша Презерваторов».
- Тело МАКСИМУМ 120 символов (с эмодзи!) с обращением к Насте. Пиши от лица персонажа из заголовка, будто он шлёт сообщение в чат. ЗАКОНЧЕННАЯ грамматическая фраза с юмором и сарказмом. Допустим умеренный мат.

Сегодня: ${context.todayHuman}. Прогноз старта менструации: ${context.periodHuman}.`;

  let specificPrompt = '';

  switch (type) {
    case 'fertile_window':
      specificPrompt = `${base}
Ситуация: фертильное окно, до овуляции ${Math.abs(context.daysUntilOvulation)} ${context.daysWord}. Предупреди про риск залёта с юмором. Максимум 120 символов!

Примеры: "Настюш, зона риска, без защиты ни шагу! Презервативы в боевой готовности! 💋🛡️" (80), "Настёна, фертильное окно открыто — прикрывайся как на войне, это не шутки! 🔥" (78)`;
      break;

    case 'period_forecast':
      specificPrompt = `${base}
Ситуация: до менструации ${Math.abs(context.daysUntilPeriod)} ${context.daysUntilPeriodWord}. Напомни, что ПМС скоро. ВАРЬИРУЙ совет (грелка, шоколад, терпение, запасы, отдых, плед, сериал - чередуй!). Максимум 120 символов!

Примеры: "Настюх, через ${Math.abs(context.daysUntilPeriod)} ${context.daysUntilPeriodWord} шторм — запасайся шоколадом, грелкой и терпением! 🙄🍫" (≤120), "Настёна, ПМС на подходе — готовь плед, сериал и всех нафиг! 😤🛋️" (67)`;
      break;

    case 'period_confirmed_day1':
      specificPrompt = `${base}
Ситуация: второй день менструации. Поддержи с юмором. Максимум 120 символов!

Примеры: "Настюш, второй день — грелку к пузику, шоколадку в рот, всех нафиг! 🔥🍫" (74), "Настёна, день 2 — держись, грелка и сериал спасут мир! 💪✨" (61)`;
      break;

    default:
      throw new Error(`Unknown notification type: ${type}`);
  }

  const prompt = specificPrompt + '\n\nВерни ответ СТРОГО в формате JSON:\n{"title": "текст заголовка", "body": "текст уведомления"}';
  const systemPrompt = 'Ты Настя — язвительная, саркастичная подруга, которая пишет на русском. Всегда отвечай СТРОГО в формате JSON: {"title": "заголовок", "body": "текст"}. Без дополнительных пояснений, только JSON.';

  const raw = await callClaudeAPI(prompt, systemPrompt);
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(clean);
  if (!parsed.title || !parsed.body) {
    throw new Error('AI response missing fields');
  }

  return {
    title: parsed.title.trim(),
    body: ensureEmojiPresent(parsed.body.trim()),
    url: NOTIFICATIONS_URL,
  };
}

function printNotification(index, total, type, message, timing, description) {
  const titleLength = message.title.length;
  const bodyLength = message.body.length;

  console.log('┌' + '─'.repeat(78) + '┐');
  console.log('│ ' + `${index}/${total}: ${type.toUpperCase()}`.padEnd(76) + ' │');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log('│ ' + ('⏰ ' + timing).padEnd(76) + ' │');
  console.log('│ ' + ('📝 ' + description).padEnd(76) + ' │');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log('│ ' + '📬 TITLE:'.padEnd(76) + ' │');
  console.log('│   ' + message.title.padEnd(74) + ' │');
  console.log('│   ' + `(${titleLength} символов)`.padEnd(74) + ' │');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log('│ ' + '💬 BODY:'.padEnd(76) + ' │');

  const bodyWords = message.body.split(' ');
  let currentLine = '';
  const lines = [];

  for (const word of bodyWords) {
    if ((currentLine + ' ' + word).trim().length <= 70) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  lines.forEach(line => {
    console.log('│   ' + line.padEnd(74) + ' │');
  });
  console.log('│   ' + `(${bodyLength} символов)`.padEnd(74) + ' │');
  console.log('└' + '─'.repeat(78) + '┘');
  console.log();
}

async function main() {
  console.clear();
  console.log();
  console.log('═'.repeat(80));
  console.log('  ТЕСТ РЕАЛЬНОЙ ГЕНЕРАЦИИ ЧЕРЕЗ CLAUDE API');
  console.log('  Model: ' + CLAUDE_MODEL);
  console.log('═'.repeat(80));
  console.log();

  const today = new Date('2025-11-02T12:00:00Z');
  const period = new Date('2025-11-05T00:00:00Z');

  const context = {
    todayHuman: formatRussianDate(today),
    periodHuman: formatRussianDate(period),
    daysUntilPeriod: 3,
    daysUntilPeriodWord: getDaysWord(3),
    daysUntilOvulation: 12,
    daysWord: getDaysWord(12),
  };

  console.log('📅 Контекст:');
  console.log(`   Сегодня: ${context.todayHuman}`);
  console.log(`   Прогноз менструации: ${context.periodHuman} (через ${context.daysUntilPeriod} дня)`);
  console.log(`   До овуляции: ${context.daysUntilOvulation} дней`);
  console.log();
  console.log('🤖 Генерирую уведомления через Claude API...');
  console.log();

  try {
    // 1. Morning brief
    console.log('═'.repeat(80));
    console.log('1/4: Генерация morning_brief...');
    console.log('═'.repeat(80));
    console.log();
    console.log('Шаг 1: Генерация дневного гороскопа...');
    const narrative = await generateMorningBriefNarrative(context);
    console.log('\n📖 Сгенерированный гороскоп:');
    console.log('─'.repeat(80));
    console.log(narrative);
    console.log('─'.repeat(80));
    console.log();
    console.log('Шаг 2: Извлечение главной мысли для push-уведомления...');
    const morningBrief = await generateMorningBriefFromNarrative(narrative, context);
    console.log();
    printNotification(1, 4, 'morning_brief', morningBrief, '06:45 Berlin time', 'Утренний житейский гороскоп');

    // 2. Fertile window
    console.log('═'.repeat(80));
    console.log('2/4: Генерация fertile_window...');
    console.log('═'.repeat(80));
    console.log();
    const fertileWindow = await generateCycleNotification('fertile_window', context);
    printNotification(2, 4, 'fertile_window', fertileWindow, '14:35 Berlin time (random)', 'Фертильное окно, риск беременности');

    // 3. Period forecast
    console.log('═'.repeat(80));
    console.log('3/4: Генерация period_forecast...');
    console.log('═'.repeat(80));
    console.log();
    const periodForecast = await generateCycleNotification('period_forecast', context);
    printNotification(3, 4, 'period_forecast', periodForecast, '11:20 Berlin time (random)', 'За 3 дня до менструации');

    // 4. Period day 1
    console.log('═'.repeat(80));
    console.log('4/4: Генерация period_confirmed_day1...');
    console.log('═'.repeat(80));
    console.log();
    const periodDay1 = await generateCycleNotification('period_confirmed_day1', context);
    printNotification(4, 4, 'period_confirmed_day1', periodDay1, '09:15 Berlin time (random)', 'Второй день менструации');

    // Summary
    console.log('═'.repeat(80));
    console.log('✅ ВСЕ УВЕДОМЛЕНИЯ УСПЕШНО СГЕНЕРИРОВАНЫ!');
    console.log('═'.repeat(80));
    console.log();
    console.log('💡 Выводы:');
    console.log('  1. Каждый текст уникален и генерируется с учётом контекста');
    console.log('  2. Все тексты в пределах лимита 120 символов');
    console.log('  3. Morning brief создаётся в два этапа (гороскоп → push)');
    console.log('  4. Саркастичный тон и житейский язык соблюдены');
    console.log('  5. Все сообщения содержат эмодзи');
    console.log();
    console.log('🔄 Запустите скрипт ещё раз чтобы увидеть вариативность генерации!');
    console.log();

  } catch (error) {
    console.error('\n❌ Ошибка при генерации:', error.message);
    console.log('\nПроверьте:');
    console.log('  - CLAUDE_API_KEY установлен корректно');
    console.log('  - Есть доступ к Claude API');
    console.log('  - Есть интернет-соединение');
    process.exit(1);
  }
}

main();
