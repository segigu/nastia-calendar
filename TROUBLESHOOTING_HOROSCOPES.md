# Диагностика проблем с генерацией гороскопов

## Быстрая диагностика (5 минут)

### Шаг 1: Проверка логов в браузере

1. Откройте https://segigu.github.io/nastia-calendar/
2. Нажмите F12 (откройте DevTools)
3. Перейдите на вкладку **Console**
4. Очистите консоль (кнопка 🚫 или Ctrl+L)
5. Попробуйте загрузить гороскоп (нажмите на карточку "Сегодня")
6. Посмотрите на логи в консоли

#### ✅ Что должно быть (рабочая конфигурация):

```
[Config] Remote config loaded: {hasClaudeKey: true, hasOpenAIKey: true, ...}
[Config] ✅ Claude API key loaded from remote config
[Config] ✅ OpenAI proxy URL loaded from remote config
[AI Client] Attempting to call AI with options: {...}
[AI Client] ✅ Claude API succeeded (primary)
Generated daily horoscope using claude
```

#### ❌ Возможные ошибки:

**Ошибка 1: Remote config не загружается**
```
[Config] No remote config loaded
```
**Решение**: Проверьте, настроен ли GitHub token (см. Шаг 2)

---

**Ошибка 2: API ключи отсутствуют**
```
[Config] Remote config loaded: {hasClaudeKey: false, hasOpenAIKey: false, ...}
```
**Решение**: Добавьте API ключи в `segigu/nastia-data/nastia-config.json` (см. Шаг 3)

---

**Ошибка 3: Оба провайдера недоступны**
```
[AI Client] ❌ Claude API failed, falling back to OpenAI: ...
[AI Client] ❌ OpenAI API also failed: ...
Both AI providers failed. Claude: ... OpenAI: ...
```
**Решение**: Проверьте Workers и API ключи (см. Шаги 4-5)

---

**Ошибка 4: CORS блокировка**
```
Access to fetch at 'https://api.openai.com/...' has been blocked by CORS
```
**Решение**: Убедитесь, что proxy URL настроен (см. Шаг 3)

---

### Шаг 2: Проверка GitHub Token

В браузере на сайте откройте консоль и выполните:

```javascript
const cloudConfig = localStorage.getItem('nastia-cloud-config');
if (cloudConfig) {
  const parsed = JSON.parse(cloudConfig);
  console.log('GitHub Token:', parsed.githubToken ? '✅ Настроен' : '❌ Отсутствует');
} else {
  console.log('❌ Cloud config не настроен');
}
```

**Если токен отсутствует**:
1. Перейдите в Настройки → Облачная синхронизация
2. Добавьте GitHub Personal Access Token

---

### Шаг 3: Проверка удалённой конфигурации

Откройте https://github.com/segigu/nastia-data/blob/main/nastia-config.json

**Минимальная рабочая конфигурация:**

```json
{
  "claude": {
    "apiKey": "sk-ant-api03-..."
  },
  "openAIProxy": {
    "url": "https://nastia-openai-proxy.sergei-gubenov.workers.dev/v1/chat/completions"
  }
}
```

**Или с Claude proxy:**

```json
{
  "claudeProxy": {
    "url": "https://nastia-claude-proxy.YOUR-SUBDOMAIN.workers.dev"
  },
  "openAIProxy": {
    "url": "https://nastia-openai-proxy.sergei-gubenov.workers.dev/v1/chat/completions"
  }
}
```

**⚠️ Важно**: Если используете proxy, API ключи хранятся в Worker secrets, а не в config файле.

---

### Шаг 4: Проверка Cloudflare Workers

Перейдите на https://dash.cloudflare.com → Workers & Pages

#### Для `nastia-openai-proxy`:

1. Проверьте статус: должен быть **Active** (зелёная точка)
2. Перейдите в **Settings → Variables**
3. Убедитесь, что установлены:
   - `OPENAI_API_KEY` (тип: Secret) - OpenAI API ключ
   - `ALLOWED_ORIGINS` (опционально) - должен включать `https://segigu.github.io`

4. Проверьте **Analytics**:
   - Если видите ошибки 500/403 → проверьте secrets
   - Если превышен лимит (100k req/day) → обновите план или дождитесь сброса

#### Для `nastia-claude-proxy` (если используется):

1. Аналогично проверьте статус
2. Убедитесь, что установлен:
   - `ANTHROPIC_API_KEY` (тип: Secret) - Claude API ключ
   - `ALLOWED_ORIGINS` (опционально)

---

### Шаг 5: Тест OpenAI Proxy вручную

В консоли браузера выполните:

```javascript
fetch('https://nastia-openai-proxy.sergei-gubenov.workers.dev/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'test' }],
    max_tokens: 10,
  }),
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

**Ожидаемый результат:**
```json
{
  "id": "chatcmpl-...",
  "choices": [{"message": {"role": "assistant", "content": "..."}}],
  ...
}
```

**Если 403 Forbidden**:
- Добавьте `https://segigu.github.io` в `ALLOWED_ORIGINS` Worker
- Или измените `ALLOWED_ORIGINS` на `*` (менее безопасно)

**Если 500 Internal Server Error**:
- Проверьте, установлен ли `OPENAI_API_KEY` в Worker secrets

---

## Автоматическая диагностика

Скопируйте и выполните в консоли браузера содержимое файла:
```
debug-ai-config.js
```

Этот скрипт проверит:
- ✅ Переменные окружения
- ✅ LocalStorage конфигурацию
- ✅ Доступность OpenAI proxy
- ✅ Удалённую конфигурацию с GitHub
- ✅ Выведет рекомендации по исправлению

---

## Типичные проблемы и решения

### Проблема: "Гороскопы раньше работали, а теперь нет"

**Возможные причины:**
1. **API ключ истёк** → Проверьте дату истечения на https://platform.openai.com/api-keys или https://console.anthropic.com/settings/keys
2. **Worker достиг лимита** → Проверьте Analytics в Cloudflare Dashboard
3. **GitHub token истёк** → Обновите токен в настройках приложения
4. **Remote config изменился** → Проверьте последний коммит в `nastia-data` репозитории

---

### Проблема: "Worker работает, но гороскопы не генерируются"

**Проверьте:**
1. Установлены ли API ключи в Worker secrets (не в переменных!)
2. Правильно ли указан URL proxy в remote config
3. Загружается ли remote config (лог `[Config] ✅ ... loaded from remote config`)

---

### Проблема: "403 Forbidden от Worker"

**Решение:**
```bash
# Через Wrangler CLI:
wrangler secret put ALLOWED_ORIGINS --name nastia-openai-proxy
# Введите: https://segigu.github.io,http://localhost:3000

# Или через Dashboard:
# Workers → nastia-openai-proxy → Settings → Variables
# Добавьте: ALLOWED_ORIGINS = https://segigu.github.io,http://localhost:3000
```

---

## Контакты для поддержки

Если проблема не решена:
1. Соберите логи из браузерной консоли
2. Выполните автоматическую диагностику (`debug-ai-config.js`)
3. Опишите проблему с приложением логов

---

## Полезные ссылки

- [OpenAI Proxy Setup](OPENAI_PROXY_SETUP.md)
- [Cloudflare Worker Setup](CLOUDFLARE_WORKER_SETUP.md)
- [Cloud Sync Setup](CLOUD_SETUP.md)
- [OpenAI Platform](https://platform.openai.com)
- [Anthropic Console](https://console.anthropic.com)
- [Cloudflare Dashboard](https://dash.cloudflare.com)
