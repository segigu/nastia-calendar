# Настройка OpenAI Proxy для Nastia Calendar

Эта инструкция описывает, как развернуть Cloudflare Worker для проксирования запросов к OpenAI API, по аналогии с Claude proxy.

## Зачем нужен proxy?

OpenAI API не разрешает прямые запросы из браузера (CORS), поэтому нужен серверный прокси, который:
- Скрывает OpenAI API ключ от браузера
- Добавляет необходимые CORS заголовки
- Передает запросы к OpenAI API

## Шаг 1: Деплой Worker на Cloudflare

```bash
# Залогиньтесь в Cloudflare (если еще не сделали)
wrangler login

# Деплой OpenAI proxy worker
wrangler deploy cloudflare/openai-proxy.ts --name nastia-openai-proxy
```

После деплоя вы получите URL, например:
```
https://nastia-openai-proxy.YOUR-SUBDOMAIN.workers.dev
```

Сохраните этот URL - он понадобится для конфигурации.

## Шаг 2: Добавьте секреты в Cloudflare Worker

### Вариант A: Через CLI

```bash
# Добавьте OpenAI API ключ
wrangler secret put OPENAI_API_KEY --name nastia-openai-proxy
# Вставьте ваш OpenAI API ключ (начинается с sk-...)

# (Опционально) Добавьте разрешенные origins для CORS
wrangler secret put ALLOWED_ORIGINS --name nastia-openai-proxy
# Вставьте: http://localhost:3000,http://localhost:3001,https://segigu.github.io
```

### Вариант B: Через Cloudflare Dashboard

1. Откройте https://dash.cloudflare.com
2. Перейдите в **Workers & Pages**
3. Найдите worker `nastia-openai-proxy`
4. Перейдите в **Settings → Variables**
5. Добавьте переменные:
   - `OPENAI_API_KEY` (тип: Secret) - ваш OpenAI API ключ
   - `ALLOWED_ORIGINS` (тип: Text или Secret) - список разрешенных origins через запятую

## Шаг 3: Настройте remote config

В репозитории `segigu/nastia-data` обновите файл `nastia-config.json`:

```json
{
  "claudeProxy": {
    "url": "https://nastia-claude-proxy.YOUR-SUBDOMAIN.workers.dev"
  },
  "openAIProxy": {
    "url": "https://nastia-openai-proxy.YOUR-SUBDOMAIN.workers.dev"
  },
  "apiKeys": {
    "claude": "ваш-claude-ключ-если-нужен",
    "openai": "ваш-openai-ключ-если-нужен"
  }
}
```

**Примечание:** Если вы используете proxy, API ключи в `apiKeys` могут быть пустыми или отсутствовать - ключи хранятся на стороне Worker'а.

## Шаг 4: (Опционально) Локальная разработка

Для локальной разработки можете использовать переменную окружения:

```bash
# В файле .env добавьте:
REACT_APP_OPENAI_PROXY_URL=https://nastia-openai-proxy.YOUR-SUBDOMAIN.workers.dev

# Запустите приложение
npm start
```

## Шаг 5: Проверьте работу

1. Запустите приложение локально (`npm start`)
2. Откройте консоль браузера (F12)
3. Перейдите на вкладку "Узнай себя"
4. В консоли должны появиться логи:

```
[Config] ✅ OpenAI proxy URL loaded from remote config
[PersonalizedMessages] Starting background load
[AI Client] Attempting to call AI with options: { hasOpenAIProxy: true, preferOpenAI: true }
[AI Client] ✅ OpenAI API succeeded (primary)
[PlanetMessages] ✅ Successfully generated personalized messages
```

## Устранение проблем

### CORS ошибка при запросе к OpenAI

**Проблема:**
```
Access to fetch at 'https://api.openai.com/v1/chat/completions' has been blocked by CORS
```

**Решение:** Убедитесь, что:
- OpenAI proxy URL настроен в remote config или переменных окружения
- Worker успешно задеплоен и доступен
- В консоли есть лог `[Config] ✅ OpenAI proxy URL loaded from remote config`

### Worker возвращает 500 ошибку

**Проблема:**
```
{"error": "Missing OPENAI_API_KEY env var"}
```

**Решение:**
- Убедитесь, что добавили секрет `OPENAI_API_KEY` через `wrangler secret put`
- Проверьте в Cloudflare Dashboard что секрет установлен

### Медленная загрузка персонализированных сообщений

OpenAI proxy с моделью `gpt-4o-mini` должен работать быстрее Claude (5-10 секунд вместо 20-30).

Если загрузка всё равно медленная:
1. Проверьте, что используется `gpt-4o-mini` (не `gpt-4o`)
2. Убедитесь, что `preferOpenAI: true` в вызовах AI
3. При повторном запуске сообщения должны грузиться из кеша мгновенно

## Архитектура

```
Браузер → Cloudflare Worker (openai-proxy) → OpenAI API
         (добавляет Authorization header)
         (добавляет CORS headers)
```

Преимущества:
- ✅ API ключ скрыт от браузера
- ✅ Нет проблем с CORS
- ✅ Работает на бесплатном плане Cloudflare (100,000 запросов/день)
- ✅ Быстрая работа (serverless функция близко к пользователю)

## Дополнительная безопасность

Для production рекомендуется:

1. Ограничить CORS только вашим доменом:
```bash
wrangler secret put ALLOWED_ORIGINS --name nastia-openai-proxy
# Вставьте только: https://segigu.github.io
```

2. Добавить rate limiting (опционально, требует доработки worker'а)

3. Мониторить использование в Cloudflare Dashboard (Workers → Analytics)

---

**Готово!** Теперь ваше приложение использует OpenAI через безопасный proxy.
