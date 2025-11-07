/**
 * Диагностический скрипт для проверки AI конфигурации Nastia Calendar
 *
 * Использование:
 * 1. Откройте https://segigu.github.io/nastia-calendar/
 * 2. Нажмите F12 (откройте DevTools)
 * 3. Перейдите на вкладку Console
 * 4. Скопируйте весь этот файл и вставьте в консоль
 * 5. Нажмите Enter
 *
 * Скрипт выведет полную диагностику AI конфигурации.
 */

(function() {
  console.log('🔍 Nastia Calendar AI Configuration Diagnostics\n');
  console.log('='.repeat(60));

  // 1. Проверка переменных окружения
  console.log('\n📦 Environment Variables:');
  const env = {
    claudeKey: process.env.REACT_APP_CLAUDE_API_KEY,
    claudeProxy: process.env.REACT_APP_CLAUDE_PROXY_URL,
    openaiKey: process.env.REACT_APP_OPENAI_API_KEY,
    openaiProxy: process.env.REACT_APP_OPENAI_PROXY_URL,
  };

  console.log('  REACT_APP_CLAUDE_API_KEY:', env.claudeKey ? `✅ Set (${env.claudeKey.substring(0, 10)}...)` : '❌ Not set');
  console.log('  REACT_APP_CLAUDE_PROXY_URL:', env.claudeProxy ? `✅ ${env.claudeProxy}` : '❌ Not set');
  console.log('  REACT_APP_OPENAI_API_KEY:', env.openaiKey ? `✅ Set (${env.openaiKey.substring(0, 10)}...)` : '❌ Not set');
  console.log('  REACT_APP_OPENAI_PROXY_URL:', env.openaiProxy ? `✅ ${env.openaiProxy}` : '❌ Not set');

  // 2. Проверка localStorage
  console.log('\n💾 LocalStorage:');
  const cloudConfig = localStorage.getItem('nastia-cloud-config');
  if (cloudConfig) {
    try {
      const parsed = JSON.parse(cloudConfig);
      console.log('  Cloud config:', parsed);
      console.log('  GitHub Token:', parsed.githubToken ? '✅ Set' : '❌ Not set');
    } catch (e) {
      console.log('  ❌ Failed to parse cloud config:', e.message);
    }
  } else {
    console.log('  ⚠️ No cloud config in localStorage');
  }

  // 3. Тест доступности OpenAI proxy
  console.log('\n🌐 Testing OpenAI Proxy:');
  const openaiProxyUrl = env.openaiProxy || 'https://nastia-openai-proxy.sergei-gubenov.workers.dev/v1/chat/completions';

  fetch(openaiProxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 10,
    }),
  })
    .then(response => {
      console.log(`  OpenAI Proxy Response: ${response.status} ${response.statusText}`);
      if (response.ok) {
        console.log('  ✅ OpenAI Proxy is accessible');
        return response.json();
      } else if (response.status === 403) {
        console.log('  ⚠️ 403 Forbidden - Check ALLOWED_ORIGINS in Worker settings');
        console.log('  Expected origin: ' + window.location.origin);
        return response.text();
      } else {
        console.log('  ❌ OpenAI Proxy returned error');
        return response.text();
      }
    })
    .then(data => {
      console.log('  Response body:', data);
    })
    .catch(error => {
      console.log('  ❌ OpenAI Proxy error:', error.message);
    });

  // 4. Проверка удалённой конфигурации
  console.log('\n☁️ Remote Configuration:');
  if (cloudConfig) {
    const parsed = JSON.parse(cloudConfig);
    if (parsed.githubToken) {
      console.log('  Fetching remote config from GitHub...');

      fetch('https://api.github.com/repos/segigu/nastia-data/contents/nastia-config.json', {
        headers: {
          'Authorization': `token ${parsed.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      })
        .then(response => {
          if (response.status === 404) {
            console.log('  ⚠️ nastia-config.json not found in nastia-data repo');
            return null;
          }
          if (!response.ok) {
            console.log('  ❌ Failed to fetch remote config:', response.status);
            return response.text().then(text => {
              console.log('  Error:', text);
              return null;
            });
          }
          return response.json();
        })
        .then(data => {
          if (!data) return;

          const content = atob(data.content.replace(/\n/g, ''));
          const config = JSON.parse(content);

          console.log('  ✅ Remote config loaded successfully');
          console.log('  Config structure:');
          console.log('    - Claude API Key:', config.claude?.apiKey ? '✅ Present' : '❌ Missing');
          console.log('    - Claude Proxy URL:', config.claudeProxy?.url || '❌ Not set');
          console.log('    - OpenAI API Key:', config.openAI?.apiKey ? '✅ Present' : '❌ Missing');
          console.log('    - OpenAI Proxy URL:', config.openAIProxy?.url || '❌ Not set');
          console.log('  Full config:', config);
        })
        .catch(error => {
          console.log('  ❌ Error loading remote config:', error.message);
        });
    } else {
      console.log('  ⚠️ No GitHub token configured');
    }
  } else {
    console.log('  ⚠️ Cloud sync not configured');
  }

  // 5. Рекомендации
  console.log('\n💡 Recommendations:');
  console.log('  1. Check browser console for [AI Client] logs when generating horoscope');
  console.log('  2. Look for [Config] logs to see if remote config was loaded');
  console.log('  3. If OpenAI Proxy returns 403, check ALLOWED_ORIGINS in Cloudflare Worker settings');
  console.log('  4. If no API keys are set, configure them in nastia-data/nastia-config.json');

  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnostics complete. Check the output above.\n');
})();
