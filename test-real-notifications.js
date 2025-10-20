#!/usr/bin/env node

/**
 * РЕАЛЬНОЕ ТЕСТИРОВАНИЕ ГЕНЕРАЦИИ УВЕДОМЛЕНИЙ
 *
 * Этот скрипт использует НАСТОЯЩИЕ промпты из sendNotifications.js
 * и вызывает AI API для генерации примеров уведомлений.
 *
 * ВАЖНО: Нужен CLAUDE_API_KEY или OPENAI_API_KEY в окружении!
 */

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const CLAUDE_MODEL = 'claude-haiku-4-5';
const OPENAI_MODEL = 'gpt-4o-mini';

if (!CLAUDE_API_KEY && !OPENAI_API_KEY) {
  console.error('❌ Ошибка: Нужен CLAUDE_API_KEY или OPENAI_API_KEY!');
  console.error('');
  console.error('Использование:');
  console.error('  export CLAUDE_API_KEY="sk-ant-..."');
  console.error('  node test-real-notifications.js');
  console.error('');
  console.error('или:');
  console.error('  export OPENAI_API_KEY="sk-..."');
  console.error('  node test-real-notifications.js');
  process.exit(1);
}

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function callClaude(prompt, systemPrompt) {
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
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  return payload?.content?.[0]?.text || '';
}

async function callOpenAI(prompt, systemPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.95,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content || '';
}

async function callAI(prompt, systemPrompt) {
  if (CLAUDE_API_KEY) {
    try {
      console.log('   🤖 Используем Claude API...');
      return await callClaude(prompt, systemPrompt);
    } catch (error) {
      console.log(`   ⚠️  Claude failed: ${error.message}`);
      if (OPENAI_API_KEY) {
        console.log('   🤖 Пробуем OpenAI API...');
        return await callOpenAI(prompt, systemPrompt);
      }
      throw error;
    }
  }

  if (OPENAI_API_KEY) {
    console.log('   🤖 Используем OpenAI API...');
    return await callOpenAI(prompt, systemPrompt);
  }

  throw new Error('No API keys available');
}

// Промпт для morning brief из sendNotifications.js (АКТУАЛЬНАЯ ВЕРСИЯ)
function getMorningBriefPrompt(narrative) {
  return `Вот дневной гороскоп для Насти:
"""
${narrative}
"""

Проанализируй гороскоп и сформируй push-уведомление утром в 06:45 по Берлину.
Формат JSON:
{
  "title": "фраза из 2-3 слов, описывающая главный вайб дня",
  "body": "жёсткая саркастичная строка СТРОГО до 55 символов с 1-2 эмодзи"
}

Требования:
1. Прочитай гороскоп и найди ГЛАВНУЮ тему дня: какая планета доминирует? Что будет сложным? Что станет проще?
2. Заголовок: 2-3 слова, передающих суть (примеры: "Марсианский хаос", "Венера шепчет", "Юпитер зовёт", "Луна против плана")
3. Body: МАКСИМУМ 55 символов! Вытащи КОНКРЕТНЫЙ совет или прикол из гороскопа. Например:
   - Если в гороскопе про Марс и бой → "Настя, Марс рычит — держи оборону! 💥"
   - Если про Венеру и отдых → "Венера шепчет: отдохни, детка! ✨"
   - Если про детей и хаос → "Детвора орёт — выживай! 😤"
   - Если про экзамен → "Экзамен близко, не паникуй! 📚"
4. НЕ используй длинные вводные ("гороскоп обещает", "сегодняшний гороскоп"). СРАЗУ к делу!
5. Обращайся к Насте напрямую (Настя, Настюш, Настёна)
6. 1-2 эмодзи, саркастичный тон, можно лёгкий мат
7. Ответ — строго JSON без дополнительного текста.`;
}

const morningBriefSystemPrompt = 'Ты пишешь острые push-уведомления. Отвечай только JSON-объектом. КРИТИЧНО: body должен быть не длиннее 55 символов! Анализируй гороскоп и вытаскивай конкретику - планеты, события, советы.';

// Промпт для обычных уведомлений (fertile_window, period_forecast, etc.)
function getNotificationPrompt(type, context) {
  const base = `Ты — Настина лучшая подруга с жёстким, но поддерживающим женским сарказмом. Пиши по-русски дерзко и прямо, обращайся к Насте по-свойски (Настюш, Настён, Настёнка, Настюшка, Настёна, детка, иногда можно по фамилии - Орлова).
Задача: придумать push-уведомление для календаря цикла.
Формат:
- Заголовок из 1-3 слов: только вымышленное имя, фамилия и/или отчество персонажа. Персонаж должен быть новым в каждом уведомлении, с игривым оттенком, связанным с темой фертильности, гормонов, защиты, беременности и т.п. Никаких обращений к Насте. ЗАПРЕЩЕНО использовать имена: Игорь, Константин, Стас (в любой форме). Примеры (не повторяй дословно): «Людмила Фертильная», «Фёдор Плодовитый», «Олеся Овуляторовна», «Марфа Контрацептовна», «Гриша Презерваторов».
- Тело СТРОГО до 55 символов с обращением к Насте, 1-2 эмодзи и жёстким, но заботливым сарказмом. Пиши от лица персонажа из заголовка, будто он шлёт сообщение в чат. Будь краток и ёмок. Никакой мягкости, но и без обсценной лексики и унижений.
КРИТИЧНО: body должен быть максимум 55 символов, иначе обрежется!
Сегодня: ${context.todayHuman}. Прогноз старта менструации: ${context.periodHuman}.`;

  const situations = {
    fertile_window: `Ситуация: фертильное окно, до овуляции ${context.daysUntilOvulation} ${context.daysWord}. Жёстко и саркастично предупреди про риск залёта и необходимость защиты. Драма не нужна. Укладывайся в 55 символов!`,
    period_forecast: `Ситуация: до менструации ${context.daysUntilPeriod} ${context.daysWord}. Жёстко, но по-сестрински: напомни, что шторм на подходе. Грелку готовь! Максимум 55 символов!`,
    period_delay_warning: `Ситуация: задержка длится ${context.daysPastPrediction} ${context.daysPastPredictionWord}. С сарказмом переживай, предложи прислушаться к телу, намекни про тест. Укладывайся в 55 символов!`,
  };

  return base + '\n\n' + situations[type] + '\n\nВерни ответ СТРОГО в формате JSON:\n{"title": "текст заголовка", "body": "текст уведомления"}';
}

const notificationSystemPrompt = 'Ты Настя — язвительная, саркастичная подруга, которая пишет на русском. Всегда отвечай СТРОГО в формате JSON: {"title": "заголовок", "body": "текст"}. Без дополнительных пояснений, только JSON.';

function getDaysWord(value) {
  const absValue = Math.abs(value);
  if (absValue === 1) return 'день';
  if (absValue >= 2 && absValue <= 4) return 'дня';
  return 'дней';
}

const testCases = [
  {
    name: 'Morning Brief - Гороскоп про Марс и хаос',
    type: 'morning_brief',
    narrative: `🔥 Настя, сегодня Марс устроил разборки с Сатурном — будет жарко. Детвора орёт, экзамен маячит на горизонте, а Серёжа решил, что самое время обсудить планы на выходные. Держи нервы в кулаке и не забывай про кофе.

✨ Венера шепчет, что вечером будет шанс выдохнуть. Если успеешь дожить до вечера, конечно. Луна в твоём углу — интуиция на максимум, используй её, чтобы не нарваться на лишние проблемы. Финал дня обещает быть обнадёживающим, если ты не убьёшь никого до этого момента.`,
  },
  {
    name: 'Morning Brief - Гороскоп про Венеру и расслабление',
    type: 'morning_brief',
    narrative: `✨ Настя, Венера сегодня творит чудеса — твоя интуиция и обаяние на пике. Используй это, чтобы договориться о важных вещах с Серёжей или детворой. День обещает быть мягким и тёплым.

🌙 Луна поддерживает: вечером можешь расслабиться, посмотреть сериал или просто выдохнуть. Юпитер намекает, что экзамен подождёт, а ты заслужила передышку. Не торопись, всё под контролем.`,
  },
  {
    name: 'Fertile Window - 2 дня до овуляции',
    type: 'fertile_window',
    context: {
      todayHuman: '15 октября',
      periodHuman: '28 октября',
      daysUntilOvulation: 2,
      daysWord: 'дня',
    },
  },
  {
    name: 'Period Forecast - 3 дня до месячных',
    type: 'period_forecast',
    context: {
      todayHuman: '25 октября',
      periodHuman: '28 октября',
      daysUntilPeriod: 3,
      daysWord: 'дня',
    },
  },
  {
    name: 'Period Delay Warning - задержка 4 дня',
    type: 'period_delay_warning',
    context: {
      todayHuman: '1 ноября',
      periodHuman: '28 октября',
      daysPastPrediction: 4,
      daysPastPredictionWord: 'дня',
    },
  },
];

async function runTest(testCase) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📱 ${testCase.name}`);
  console.log('─'.repeat(80));

  if (testCase.narrative) {
    console.log('\n📖 Входной гороскоп:');
    console.log(testCase.narrative.split('\n').map(l => '   ' + l).join('\n'));
  }

  if (testCase.context) {
    console.log('\n📋 Контекст:');
    for (const [key, value] of Object.entries(testCase.context)) {
      console.log(`   ${key}: ${value}`);
    }
  }

  console.log('\n⏳ Генерация...');

  try {
    let prompt, systemPrompt;

    if (testCase.type === 'morning_brief') {
      prompt = getMorningBriefPrompt(testCase.narrative);
      systemPrompt = morningBriefSystemPrompt;
    } else {
      prompt = getNotificationPrompt(testCase.type, testCase.context);
      systemPrompt = notificationSystemPrompt;
    }

    const raw = await callAI(prompt, systemPrompt);
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(clean);

    const titleLen = parsed.title.length;
    const bodyLen = parsed.body.length;
    const titleStatus = titleLen <= 40 ? '✅' : '❌ ПРЕВЫШЕН';
    const bodyStatus = bodyLen <= 55 ? '✅' : '❌ ПРЕВЫШЕН';

    console.log('\n✨ РЕЗУЛЬТАТ:');
    console.log(`   Title: "${parsed.title}"`);
    console.log(`   ├─ Длина: ${titleLen} символов ${titleStatus} (лимит ≤40)`);
    console.log(`   Body:  "${parsed.body}"`);
    console.log(`   └─ Длина: ${bodyLen} символов ${bodyStatus} (лимит ≤55)`);

    if (titleLen > 40 || bodyLen > 55) {
      console.log('\n   ⚠️  ВНИМАНИЕ: Превышен лимит!');
      if (titleLen > 40) console.log(`      Title превышен на ${titleLen - 40} символов`);
      if (bodyLen > 55) console.log(`      Body превышен на ${bodyLen - 55} символов`);
    }

    return { success: true, titleLen, bodyLen };
  } catch (error) {
    console.log(`\n❌ ОШИБКА: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('═'.repeat(80));
  console.log('РЕАЛЬНОЕ ТЕСТИРОВАНИЕ ГЕНЕРАЦИИ УВЕДОМЛЕНИЙ');
  console.log('Используются АКТУАЛЬНЫЕ промпты из scripts/sendNotifications.js');
  console.log('═'.repeat(80));

  const results = [];
  for (const testCase of testCases) {
    const result = await runTest(testCase);
    results.push({ name: testCase.name, ...result });

    // Небольшая задержка между запросами
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '═'.repeat(80));
  console.log('ИТОГОВАЯ СТАТИСТИКА');
  console.log('═'.repeat(80));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const withinLimits = results.filter(r => r.success && r.titleLen <= 40 && r.bodyLen <= 55).length;
  const exceeded = results.filter(r => r.success && (r.titleLen > 40 || r.bodyLen > 55)).length;

  console.log(`\nВсего тестов: ${results.length}`);
  console.log(`Успешных: ${successful}`);
  console.log(`Ошибок: ${failed}`);
  console.log(`Укладываются в лимиты: ${withinLimits}`);
  console.log(`Превышают лимиты: ${exceeded}`);

  if (successful > 0) {
    const avgTitle = Math.round(results.filter(r => r.success).reduce((sum, r) => sum + r.titleLen, 0) / successful);
    const avgBody = Math.round(results.filter(r => r.success).reduce((sum, r) => sum + r.bodyLen, 0) / successful);
    console.log(`\nСредняя длина title: ${avgTitle} символов`);
    console.log(`Средняя длина body: ${avgBody} символов`);
  }

  console.log('\n' + '═'.repeat(80));
}

main().catch(error => {
  console.error('Фатальная ошибка:', error);
  process.exit(1);
});
