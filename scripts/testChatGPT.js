const https = require('https');

const HOROSCOPE_TEXT = `Arrangements for a get-together you're planning to host could go awry, with everything turned upside down and nothing happening the way you planned. This isn't going to halt your plans, Aries, but it's going to require more effort to get things back on track and make it happen. This is going to be exasperating for you, but don't waste time moaning about it. Get busy and take care of business.`;

const PROMPT = `Ты переводчик гороскопов с лёгким женским сарказмом и юмором. Переведи текст на русский язык естественно, выразительно и с долей иронии. Добавь 2-3 подходящих эмодзи в ключевых местах текста, чтобы сделать его более живым и эмоциональным. Сохраняй общий смысл, но не бойся добавить чуточку дерзости и самоиронии. Отвечай только переводом с эмодзи, без дополнительных пояснений.`;

async function getConfig(token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/segigu/nastia-data/contents/config.json',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Node.js'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        const config = JSON.parse(Buffer.from(json.content, 'base64').toString());
        resolve(config);
      });
    }).on('error', reject);
  });
}

async function translateWithChatGPT(apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: HOROSCOPE_TEXT },
      ],
      temperature: 0.8,
      max_tokens: 500,
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        resolve(json.choices?.[0]?.message?.content?.trim());
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  const githubToken = process.env.GITHUB_TOKEN || process.argv[2];

  if (!githubToken) {
    console.error('❌ Укажите GITHUB_TOKEN');
    process.exit(1);
  }

  console.log('\n📝 Оригинальный текст:\n');
  console.log(HOROSCOPE_TEXT);
  console.log('\n' + '='.repeat(80) + '\n');

  const config = await getConfig(githubToken);
  const openaiKey = config.openAI?.apiKey;

  if (!openaiKey) {
    console.error('❌ OpenAI ключ не найден в config.json');
    process.exit(1);
  }

  console.log('🤖 ChatGPT (gpt-4o-mini) перевод:\n');
  const translation = await translateWithChatGPT(openaiKey);
  console.log(translation);
  console.log('\n' + '='.repeat(80) + '\n');

  console.log('\n🧠 Claude 4.5 Sonnet перевод (для сравнения):\n');
  console.log('Планы на встречу, которую ты собралась устроить, могут полететь к чертям 🙃 — всё пойдёт наперекосяк, и ни одна деталь не сложится так, как задумывалось. Конечно, это не остановит тебя, Овен, но придётся попотеть, чтобы вернуть всё в нормальное русло. Да, будет бесить 😤, но хватит ныть — бери себя в руки и делай, что надо. Время на драму не тратим! 💪');
  console.log('\n' + '='.repeat(80) + '\n');
}

main().catch(console.error);
