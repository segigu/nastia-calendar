# 🚀 Инструкции по деплою Nastia Calendar

## Шаг 1: Создание GitHub репозитория

1. Перейдите на https://github.com/new
2. Название репозитория: `nastia-calendar`
3. Описание: `Nastia - Персональный календарь менструального цикла`
4. Выберите Public
5. НЕ добавляйте README, .gitignore или license (они уже есть)
6. Нажмите "Create repository"

## Шаг 2: Связывание с GitHub

После создания репозитория выполните команды:

```bash
cd /Users/sergey/nastia-simple
git remote add origin https://github.com/YOUR_USERNAME/nastia-calendar.git
git branch -M main
git push -u origin main
```

Замените `YOUR_USERNAME` на ваш GitHub username.

## Шаг 3: Настройка GitHub Pages

1. Перейдите в Settings репозитория
2. Найдите раздел "Pages" в левом меню
3. В Source выберите "Deploy from a branch"
4. Выберите branch: `gh-pages`
5. Folder: `/ (root)`
6. Нажмите Save

## Шаг 4: Настройка деплоя

Добавьте в package.json:

```json
{
  "homepage": "https://YOUR_USERNAME.github.io/nastia-calendar",
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d build"
  }
}
```

## Шаг 5: Деплой

```bash
npm install --save-dev gh-pages
npm run deploy
```

## Альтернатива: Vercel

1. Перейдите на https://vercel.com
2. Войдите через GitHub
3. Нажмите "New Project"
4. Выберите репозиторий nastia-calendar
5. Нажмите Deploy

## Результат

Приложение будет доступно по адресу:
- GitHub Pages: `https://YOUR_USERNAME.github.io/nastia-calendar`
- Vercel: `https://nastia-calendar.vercel.app` (или другой автоматически сгенерированный домен)

## Особенности

- Данные сохраняются в localStorage браузера
- Приложение работает полностью в браузере
- Доступ с любого устройства через веб-интерфейс
- PWA - можно установить как приложение на телефон

## Обновления

Для обновления приложения:

```bash
git add .
git commit -m "Update application"
git push origin main
npm run deploy  # для GitHub Pages
```

Для Vercel обновления происходят автоматически при push в main.