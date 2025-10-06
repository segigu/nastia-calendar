# Настройка Push-уведомлений

## Требования

1. GitHub Personal Access Token с правами `repo` для доступа к репозиторию `nastia-data`
2. VAPID ключи для Web Push
3. Android Chrome или Desktop Chrome для тестирования

## Шаг 1: Настройка GitHub Secrets

Добавьте следующие secrets в настройках репозитория `nastia-simple`:

1. Перейдите в **Settings** → **Secrets and variables** → **Actions**
2. Нажмите **New repository secret**
3. Добавьте три секрета:

### NASTIA_DATA_TOKEN
GitHub Personal Access Token с правами `repo` для доступа к приватному репозиторию `nastia-data`.

### VAPID_PUBLIC_KEY
```
BHL7bn7IEcJOy7unRivuOE-6e-svZMQQ_WMt5rTm7Ae86p4RN9BlTOqgeEWrvpiBJqwqcAGKUGNs2DXqybIhIv0
```

### VAPID_PRIVATE_KEY
```
mGifydhhVxO8wXtS4LGIjuc8j9pMjACf2M4K68F45L0
```

## Шаг 2: Как работает система

1. **Регистрация подписки:**
   - Пользователь открывает приложение в Chrome (Android/Desktop)
   - Переходит в **Настройки** → **Push-уведомления**
   - Включает уведомления и настраивает параметры
   - Подписка сохраняется в `nastia-data/subscriptions.json`

2. **Отправка уведомлений:**
   - GitHub Action запускается каждый день в 12:00 по Москве (9:00 UTC)
   - Читает данные о циклах из `nastia-data/nastia-data.json`
   - Читает подписки из `nastia-data/subscriptions.json`
   - Вычисляет даты месячных и овуляции
   - Отправляет уведомления согласно настройкам пользователя

3. **Типы уведомлений:**
   - За N дней до менструации (настраивается: 1-7 дней)
   - За N дней до овуляции (настраивается: 0-5 дней)
   - В день менструации
   - В день овуляции
   - Ежедневные напоминания (опционально)

## Шаг 3: Тестирование

1. Откройте приложение в Chrome (Android или Desktop)
2. Перейдите в Настройки
3. Включите облачную синхронизацию и добавьте GitHub токен
4. Включите Push-уведомления
5. Настройте параметры уведомлений
6. Нажмите "Отправить тестовое уведомление"

## Шаг 4: Ручной запуск GitHub Action

Для тестирования можно запустить Action вручную:

1. Перейдите в **Actions** → **Send Push Notifications**
2. Нажмите **Run workflow**
3. Выберите ветку `main`
4. Нажмите **Run workflow**

## Структура данных

### nastia-data/subscriptions.json
```json
{
  "subscriptions": [
    {
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "keys": {
        "p256dh": "...",
        "auth": "..."
      },
      "settings": {
        "enabled": true,
        "daysBeforePeriod": 3,
        "daysBeforeOvulation": 1,
        "dailyReminder": false
      }
    }
  ],
  "lastUpdated": "2025-10-06T12:00:00.000Z"
}
```

## Безопасность

- VAPID приватный ключ хранится в GitHub Secrets (зашифрованно)
- Публичный ключ безопасен для хранения в коде
- Подписки хранятся в приватном репозитории `nastia-data`
- Токен GitHub должен иметь минимальные права (`repo`)

## Поддерживаемые браузеры

- ✅ Chrome for Android
- ✅ Chrome for Desktop
- ❌ Safari (не поддерживает Web Push API)
- ❌ Firefox (не тестировалось)

## Отладка

Проверьте логи GitHub Action:
1. Перейдите в **Actions** → **Send Push Notifications**
2. Откройте последний запуск
3. Просмотрите логи шага **Send notifications**

Проверьте Service Worker в Chrome DevTools:
1. Откройте DevTools (F12)
2. Перейдите в **Application** → **Service Workers**
3. Проверьте статус регистрации
4. Просмотрите логи в Console
