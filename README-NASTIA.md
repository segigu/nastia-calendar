# 🌸 Nastia - Персональный календарь

Элегантное веб-приложение для отслеживания менструального цикла с красивым дизайном и персональным подходом.

![Nastia App](https://img.shields.io/badge/Status-Ready-success) ![React](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## ✨ Особенности

- 🌸 **Персональный дизайн** - нежно-розовая цветовая гамма с градиентами
- 📅 **Визуальный календарь** - интуитивно понятный интерфейс с цветовыми индикаторами
- 🤖 **Автоматические расчеты** - прогнозирование следующих циклов на основе истории
- 💾 **Локальное хранение** - данные остаются на вашем устройстве
- 📱 **PWA поддержка** - установка как нативное приложение
- 📤 **Экспорт/импорт** - резервное копирование данных
- 📱 **Адаптивный дизайн** - идеально работает на всех устройствах

## 🚀 Быстрый старт

### Запуск приложения

```bash
npm start
```

Откройте [http://localhost:3001](http://localhost:3001) в браузере.

### Сборка для продакшена

```bash
npm run build
```

## 🎨 Дизайн

### Цветовая схема

```css
:root {
  --nastia-pink: #FFB6C1;    /* Основной розовый */
  --nastia-purple: #DDA0DD;  /* Фиолетовый акцент */
  --nastia-light: #FFF0F5;   /* Светлый фон */
  --nastia-dark: #8B008B;    /* Темный акцент */
  --nastia-red: #ff6b9d;     /* Для периодов */
}
```

## 📊 Функциональность

### Основные возможности

1. **Календарь циклов**
   - Навигация по месяцам
   - Добавление дат начала циклов
   - Цветовые индикаторы:
     - 🔴 Красный - дни периода
     - 🌸 Розовый - прогнозируемые дни
     - 🟣 Фиолетовый - сегодняшний день

2. **Умная аналитика**
   - Средняя длина цикла
   - Количество записанных циклов
   - Прогноз следующего цикла
   - Дни до следующего периода

3. **Управление данными**
   - Локальное хранение в localStorage
   - Экспорт данных в JSON файл
   - Импорт данных из файла
   - Возможность удаления записей

## 🔒 Приватность

- ✅ Все данные хранятся локально на вашем устройстве
- ✅ Никакой аналитики или отслеживания
- ✅ Полный контроль над вашими данными
- ✅ Работает без интернета после первой загрузки

## 🛠 Архитектура

### Структура проекта

```
src/
├── components/
│   ├── ModernNastiaApp.tsx      # Основной компонент
│   └── NastiaApp.module.css     # CSS модули
├── types/
│   └── index.ts                 # TypeScript интерфейсы
├── utils/
│   ├── dateUtils.ts            # Работа с датами
│   ├── cycleUtils.ts           # Расчеты циклов
│   └── storage.ts              # Управление данными
└── index.css                   # Глобальные стили
```

### Технологии

- **React 19** - современная библиотека UI
- **TypeScript** - типизированный JavaScript
- **CSS Modules** - изолированные стили
- **Lucide React** - красивые иконки
- **PWA** - прогрессивное веб-приложение

## 🤝 Использование

### Добавление цикла
1. Кликните на дату в календаре
2. Нажмите "Добавить" в модальном окне
3. Цикл будет сохранен и отображен

### Просмотр статистики
1. Нажмите кнопку "Статистика"
2. Изучите метрики циклов
3. Используйте данные для планирования

### Экспорт данных
1. Нажмите кнопку "Экспорт"
2. Файл `nastia-data.json` загрузится автоматически
3. Сохраните файл как резервную копию

---

❤️ **Создано с любовью для Nastia**

*Версия: 1.0.0*  
*Последнее обновление: 3 июля 2025*