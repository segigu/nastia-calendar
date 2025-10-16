const fetch = require('node-fetch');

const HOROSCOPE_TEXT = `Arrangements for a get-together you're planning to host could go awry, with everything turned upside down and nothing happening the way you planned. This isn't going to halt your plans, Aries, but it's going to require more effort to get things back on track and make it happen. This is going to be exasperating for you, but don't waste time moaning about it. Get busy and take care of business.`;

const PROMPT = `Ты переводчик гороскопов с лёгким женским сарказмом и юмором. Переведи текст на русский язык естественно, выразительно и с долей иронии. Добавь 2-3 подходящих эмодзи в ключевых местах текста, чтобы сделать его более живым и эмоциональным. Сохраняй общий смысл, но не бойся добавить чуточку дерзости и самоиронии. Отвечай только переводом с эмодзи, без дополнительных пояснений.`;

async function translateWithChatGPT(apiKey) {
  console.log('\n🤖 ChatGPT (GPT-4o-mini) перевод:\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: PROMPT,
        },
        {
          role: 'user',
          content: HOROSCOPE_TEXT,
        },
      ],
      temperature: 0.8,
      max_tokens: 500,
    }),
  });

  const data = await response.json();
  const translation = data.choices?.[0]?.message?.content?.trim();
  console.log(translation);
  console.log('\n' + '='.repeat(80) + '\n');
}

async function translateWithClaude(apiKey) {
  console.log('\n🧠 Claude Haiku 4.5 перевод:\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      temperature: 0.8,
      system: PROMPT,
      messages: [
        {
          role: 'user',
          content: HOROSCOPE_TEXT,
        },
      ],
    }),
  });

  const data = await response.json();
  const translation = data.content?.[0]?.text?.trim();
  console.log(translation);
  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;

  if (!openaiKey) {
    console.error('❌ OPENAI_API_KEY не найден в переменных окружения');
    process.exit(1);
  }

  if (!claudeKey) {
    console.error('❌ ANTHROPIC_API_KEY не найден в переменных окружения');
    process.exit(1);
  }

  console.log('\n📝 Оригинальный текст гороскопа (английский):\n');
  console.log(HOROSCOPE_TEXT);
  console.log('\n' + '='.repeat(80));

  try {
    await translateWithChatGPT(openaiKey);
    await translateWithClaude(claudeKey);

    console.log('\n✅ Сравнение завершено!\n');
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    if (error.response) {
      const errorData = await error.response.json();
      console.error('Детали ошибки:', errorData);
    }
  }
}

main();
