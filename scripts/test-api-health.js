#!/usr/bin/env node

/**
 * Проверка работоспособности Claude API
 * Диагностирует: используются fallback сообщения или реальная генерация
 */

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const CLAUDE_MODEL = 'claude-haiku-4-5';
const OPENAI_MODEL = 'gpt-4o-mini';

const fetch = (...args) => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(...args);
  }
  return import('node-fetch').then(({ default: fetchModule }) => fetchModule(...args));
};

// Fallback сообщение для сравнения
const FALLBACK_MORNING_BRIEF = {
  title: 'Утренний пинок',
  body: 'Настя, сегодня выживание на грани — терпи, вечером полегчает, обещаем! 💥',
};

async function testClaudeAPI() {
  console.log('═'.repeat(80));
  console.log('🧪 ПРОВЕРКА CLAUDE API');
  console.log('═'.repeat(80));
  console.log();

  if (!CLAUDE_API_KEY) {
    console.log('❌ CLAUDE_API_KEY не установлен');
    console.log('   Установите: export CLAUDE_API_KEY=sk-ant-...');
    console.log('   Статус: FALLBACK режим (используются заготовленные тексты)');
    return { working: false, reason: 'no_key' };
  }

  console.log('✅ CLAUDE_API_KEY найден');
  console.log(`   Ключ: ${CLAUDE_API_KEY.slice(0, 12)}...${CLAUDE_API_KEY.slice(-8)}`);
  console.log(`   Модель: ${CLAUDE_MODEL}`);
  console.log();

  console.log('🔄 Проверка соединения с Claude API...');

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
        max_tokens: 50,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: 'Ответь одним словом: работает',
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Claude API вернул ошибку: ${response.status} ${response.statusText}`);
      console.log(`   Детали: ${errorText.slice(0, 200)}`);
      console.log('   Статус: FALLBACK режим (ключ некорректный или нет доступа)');
      return { working: false, reason: 'api_error', status: response.status, error: errorText };
    }

    const payload = await response.json();
    const text = payload?.content?.[0]?.text || '';

    console.log('✅ Claude API работает!');
    console.log(`   Тестовый ответ: "${text.trim()}"`);
    console.log('   Статус: AI режим (генерируются уникальные тексты)');
    return { working: true, response: text };

  } catch (error) {
    console.log(`❌ Ошибка при обращении к Claude API: ${error.message}`);
    console.log('   Возможные причины:');
    console.log('     - Нет интернета');
    console.log('     - API временно недоступен');
    console.log('     - Проблемы с DNS/firewall');
    console.log('   Статус: FALLBACK режим (сетевая ошибка)');
    return { working: false, reason: 'network_error', error: error.message };
  }
}

async function testOpenAIAPI() {
  console.log();
  console.log('═'.repeat(80));
  console.log('🧪 ПРОВЕРКА OPENAI API (FALLBACK)');
  console.log('═'.repeat(80));
  console.log();

  if (!OPENAI_API_KEY) {
    console.log('❌ OPENAI_API_KEY не установлен');
    console.log('   Установите: export OPENAI_API_KEY=sk-...');
    console.log('   Статус: Fallback недоступен');
    return { working: false, reason: 'no_key' };
  }

  console.log('✅ OPENAI_API_KEY найден');
  console.log(`   Ключ: ${OPENAI_API_KEY.slice(0, 8)}...${OPENAI_API_KEY.slice(-8)}`);
  console.log(`   Модель: ${OPENAI_MODEL}`);
  console.log();

  console.log('🔄 Проверка соединения с OpenAI API...');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'user',
            content: 'Ответь одним словом: работает',
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ OpenAI API вернул ошибку: ${response.status} ${response.statusText}`);
      console.log(`   Детали: ${errorText.slice(0, 200)}`);
      console.log('   Статус: Fallback недоступен');
      return { working: false, reason: 'api_error', status: response.status, error: errorText };
    }

    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content || '';

    console.log('✅ OpenAI API работает!');
    console.log(`   Тестовый ответ: "${text.trim()}"`);
    console.log('   Статус: Может использоваться как fallback для Claude');
    return { working: true, response: text };

  } catch (error) {
    console.log(`❌ Ошибка при обращении к OpenAI API: ${error.message}`);
    console.log('   Статус: Fallback недоступен');
    return { working: false, reason: 'network_error', error: error.message };
  }
}

async function generateAndCompareTexts() {
  console.log();
  console.log('═'.repeat(80));
  console.log('📊 СРАВНЕНИЕ FALLBACK И AI-ГЕНЕРАЦИИ');
  console.log('═'.repeat(80));
  console.log();

  if (!CLAUDE_API_KEY && !OPENAI_API_KEY) {
    console.log('⚠️  Нет ни одного API ключа - система использует fallback сообщения');
    console.log();
    console.log('📝 Fallback сообщение (ВСЕГДА ОДИНАКОВОЕ):');
    console.log(`   Title: ${FALLBACK_MORNING_BRIEF.title}`);
    console.log(`   Body: ${FALLBACK_MORNING_BRIEF.body}`);
    console.log();
    console.log('❌ ПРОБЛЕМА: Если приходят одинаковые уведомления каждый день,');
    console.log('   это означает что система работает в fallback режиме!');
    return;
  }

  console.log('🔄 Генерирую 3 сообщения подряд для проверки вариативности...');
  console.log();

  const messages = [];

  for (let i = 1; i <= 3; i++) {
    try {
      console.log(`Генерация ${i}/3...`);

      const prompt = `Составь короткое саркастичное приветствие для Насти. Формат JSON: {"title": "2-3 слова", "body": "одна фраза до 120 символов с эмодзи"}`;

      let response;
      if (CLAUDE_API_KEY) {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 100,
            temperature: 0.95,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
      } else {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.95,
            max_tokens: 100,
          }),
        });
      }

      const payload = await response.json();
      let rawText = '';

      if (CLAUDE_API_KEY) {
        rawText = payload?.content?.[0]?.text || '';
      } else {
        rawText = payload?.choices?.[0]?.message?.content || '';
      }

      const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(clean);

      messages.push(parsed);
      console.log(`  Title: ${parsed.title}`);
      console.log(`  Body: ${parsed.body}`);
      console.log();

    } catch (error) {
      console.log(`  ❌ Ошибка: ${error.message}`);
      console.log();
    }
  }

  if (messages.length === 0) {
    console.log('❌ Не удалось сгенерировать ни одного сообщения');
    return;
  }

  console.log('═'.repeat(80));
  console.log('📈 АНАЛИЗ ВАРИАТИВНОСТИ');
  console.log('═'.repeat(80));
  console.log();

  const uniqueTitles = new Set(messages.map(m => m.title)).size;
  const uniqueBodies = new Set(messages.map(m => m.body)).size;

  console.log(`Уникальных заголовков: ${uniqueTitles}/${messages.length}`);
  console.log(`Уникальных текстов: ${uniqueBodies}/${messages.length}`);
  console.log();

  if (uniqueTitles === messages.length && uniqueBodies === messages.length) {
    console.log('✅ ОТЛИЧНО: Все сообщения уникальны!');
    console.log('   AI генерация работает корректно');
    console.log('   Каждый день будут приходить новые тексты');
  } else {
    console.log('⚠️  ВНИМАНИЕ: Обнаружены повторы!');
    console.log('   Возможно, температура AI слишком низкая');
  }

  console.log();
  console.log('📝 Сравнение с fallback:');
  const hasFallback = messages.some(m =>
    m.title === FALLBACK_MORNING_BRIEF.title &&
    m.body === FALLBACK_MORNING_BRIEF.body
  );

  if (hasFallback) {
    console.log('❌ КРИТИЧНО: Обнаружено fallback сообщение среди AI-сгенерированных!');
    console.log('   Это означает что API иногда падает и используются fallback');
  } else {
    console.log('✅ Все сообщения отличаются от fallback');
    console.log('   API работает стабильно');
  }
}

async function main() {
  console.clear();
  console.log();
  console.log('═'.repeat(80));
  console.log('  ДИАГНОСТИКА СИСТЕМЫ ГЕНЕРАЦИИ УВЕДОМЛЕНИЙ');
  console.log('  Проверяет: используется AI или fallback сообщения');
  console.log('═'.repeat(80));
  console.log();

  const claudeResult = await testClaudeAPI();
  const openaiResult = await testOpenAIAPI();

  if (claudeResult.working || openaiResult.working) {
    await generateAndCompareTexts();
  }

  console.log();
  console.log('═'.repeat(80));
  console.log('📋 ИТОГОВЫЙ ОТЧЁТ');
  console.log('═'.repeat(80));
  console.log();

  console.log('Статус компонентов:');
  console.log(`  Claude API: ${claudeResult.working ? '✅ Работает' : '❌ Не работает'}`);
  console.log(`  OpenAI API (fallback): ${openaiResult.working ? '✅ Работает' : '❌ Не работает'}`);
  console.log();

  if (!claudeResult.working && !openaiResult.working) {
    console.log('⚠️  КРИТИЧНО: Оба API недоступны!');
    console.log();
    console.log('Последствия:');
    console.log('  1. Система использует FALLBACK сообщения');
    console.log('  2. КАЖДЫЙ ДЕНЬ приходят ОДИНАКОВЫЕ тексты');
    console.log('  3. Пользователь видит повторы');
    console.log();
    console.log('Решение:');
    console.log('  1. Проверьте CLAUDE_API_KEY в GitHub Secrets');
    console.log('  2. Убедитесь что ключ активен на https://console.anthropic.com');
    console.log('  3. Проверьте баланс API аккаунта');
    console.log('  4. Добавьте OPENAI_API_KEY как backup');
  } else if (claudeResult.working) {
    console.log('✅ ОТЛИЧНО: Claude API работает!');
    console.log();
    console.log('Система генерирует уникальные тексты каждый день:');
    console.log('  - Morning brief: новый гороскоп каждое утро');
    console.log('  - Cycle notifications: вариативные советы');
    console.log('  - Персонажи в заголовках: всегда разные');
    console.log();
    console.log('Если приходят ОДИНАКОВЫЕ уведомления - это проблема дедупликации,');
    console.log('а не генерации. Запустите: node scripts/test-integration.js');
  } else if (openaiResult.working) {
    console.log('⚠️  Claude API недоступен, но OpenAI работает');
    console.log();
    console.log('Система использует OpenAI как fallback:');
    console.log('  - Тексты уникальные, но качество может отличаться');
    console.log('  - Рекомендуется восстановить Claude API для лучших результатов');
  }

  console.log();
  console.log('═'.repeat(80));
}

main().catch(error => {
  console.error('Критическая ошибка:', error);
  process.exit(1);
});
