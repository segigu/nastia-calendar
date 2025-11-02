#!/usr/bin/env node

/**
 * Демонстрация текстов уведомлений
 * Показывает все типы уведомлений с примерами текстов
 */

const MORNING_BRIEF_URL = 'https://segigu.github.io/nastia-calendar/?open=daily-horoscope';
const NOTIFICATIONS_URL = 'https://segigu.github.io/nastia-calendar/?open=notifications';

// Копируем fallback сообщения из sendNotifications.js
const fallbackMessages = {
  fertile_window: {
    title: 'Людмила Фертильная',
    body: 'Настюш, зона риска, без защиты ни шагу! Презервативы в боевой готовности! 💋🛡️',
  },
  ovulation_day: {
    title: 'Фёдор Плодовитый',
    body: 'Настёна, сегодня овуляция — прикрывайся как на войне, это не шутки! 🔥',
  },
  period_forecast: {
    title: 'Зоя ПМСова',
    body: 'Настюх, пара дней до шторма — запасайся шоколадом, грелкой и терпением! 🙄🍫',
  },
  period_start: {
    title: 'Марфа Кровякова',
    body: 'Настёна, поток начался, грелку в зубы, плед на диван, сериал в телек! 🩸🛋️',
  },
  period_check: {
    title: 'Вероника Контрольная',
    body: 'Настюх, день Х по прогнозу — проверься и отметь, если началось! 👀',
  },
  period_waiting: {
    title: 'Глаша Терпеливая',
    body: 'Настёна, задержка — прислушайся к организму, он знает что творит! 🤔',
  },
  period_delay_warning: {
    title: 'Римма Тревожная',
    body: 'Настюш, задержка затянулась — может, пора тест сделать? Береги нервы! 😬🧪',
  },
  period_confirmed_day0: {
    title: 'Тамара Пледовая',
    body: 'Настёна, старт! Плед, грелка, любимый сериал — минимум героических подвигов! 🛋️💜',
  },
  period_confirmed_day1: {
    title: 'Соня Грелочникова',
    body: 'Настюш, второй день — грелку к пузику, шоколадку в рот, всех нафиг! 🔥🍫',
  },
  period_confirmed_day2: {
    title: 'Инга Железистая',
    body: 'Настёна, третий день, пей воду, береги нервы — скоро станет легче, держись! 💪✨',
  },
  birthday: {
    title: 'Галя Именинница',
    body: 'Настюш, с днюхой! Праздник без драмы, торт и подарки обязательны! 🎉💜🎂',
  },
  morning_brief: {
    title: 'Утренний пинок',
    body: 'Настя, сегодня выживание на грани — терпи, вечером полегчает, обещаем! 💥',
    url: MORNING_BRIEF_URL,
  },
};

// Описания типов уведомлений
const notificationDescriptions = {
  morning_brief: {
    name: 'Утренний гороскоп',
    timing: '06:45 по Берлину',
    frequency: 'Ежедневно',
    description: 'Житейский гороскоп с саркастичным тоном, НЕ астрология',
  },
  fertile_window: {
    name: 'Фертильное окно',
    timing: '07:00-21:00 (случайное время)',
    frequency: '5 дней до овуляции',
    description: 'Напоминание о повышенном риске беременности',
  },
  ovulation_day: {
    name: 'День овуляции',
    timing: '07:00-21:00 (случайное время)',
    frequency: 'Раз в цикл (день овуляции)',
    description: 'Пик фертильности, саркастичное предупреждение',
  },
  period_forecast: {
    name: 'Прогноз менструации',
    timing: '07:00-21:00 (случайное время)',
    frequency: 'За 1-5 дней до менструации',
    description: 'Напоминание о скором начале ПМС',
  },
  period_check: {
    name: 'Проверка начала',
    timing: '07:00-21:00 (случайное время)',
    frequency: 'День прогноза менструации',
    description: 'Просьба проверить и отметить начало',
  },
  period_waiting: {
    name: 'Лёгкая задержка',
    timing: '07:00-21:00 (случайное время)',
    frequency: 'Задержка 1-2 дня',
    description: 'Поддержка при небольшой задержке',
  },
  period_delay_warning: {
    name: 'Серьёзная задержка',
    timing: '07:00-21:00 (случайное время)',
    frequency: 'Задержка 3+ дней',
    description: 'Намёк про тест на беременность',
  },
  period_confirmed_day0: {
    name: 'Первый день менструации',
    timing: '07:00-21:00 (случайное время)',
    frequency: 'День 1 (отмечен пользователем)',
    description: 'Поддержка в первый день',
  },
  period_confirmed_day1: {
    name: 'Второй день менструации',
    timing: '07:00-21:00 (случайное время)',
    frequency: 'День 2',
    description: 'Поддержка во второй день',
  },
  period_confirmed_day2: {
    name: 'Третий день менструации',
    timing: '07:00-21:00 (случайное время)',
    frequency: 'День 3',
    description: 'Поддержка в третий день, обнадёживание',
  },
  birthday: {
    name: 'День рождения',
    timing: '07:00-21:00 (случайное время)',
    frequency: '12 апреля (раз в год)',
    description: 'Поздравление Насти',
  },
};

function printNotification(type, message, description) {
  const titleLength = message.title.length;
  const bodyLength = message.body.length;
  const url = message.url || NOTIFICATIONS_URL;

  console.log('┌' + '─'.repeat(78) + '┐');
  console.log('│ ' + type.toUpperCase().padEnd(76) + ' │');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log('│ ' + ('📱 ' + description.name).padEnd(76) + ' │');
  console.log('│ ' + ('⏰ Время: ' + description.timing).padEnd(76) + ' │');
  console.log('│ ' + ('📅 Частота: ' + description.frequency).padEnd(76) + ' │');
  console.log('│ ' + ('📝 Описание: ' + description.description).padEnd(76) + ' │');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log('│ ' + '📬 TITLE:'.padEnd(76) + ' │');
  console.log('│   ' + message.title.padEnd(74) + ' │');
  console.log('│   ' + `(${titleLength} символов)`.padEnd(74) + ' │');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log('│ ' + '💬 BODY:'.padEnd(76) + ' │');

  // Разбиваем body на строки по 70 символов для красивого отображения
  const bodyWords = message.body.split(' ');
  let currentLine = '';
  const lines = [];

  for (const word of bodyWords) {
    if ((currentLine + ' ' + word).trim().length <= 70) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  lines.forEach(line => {
    console.log('│   ' + line.padEnd(74) + ' │');
  });
  console.log('│   ' + `(${bodyLength} символов)`.padEnd(74) + ' │');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log('│ ' + '🔗 URL:'.padEnd(76) + ' │');
  console.log('│   ' + url.padEnd(74) + ' │');
  console.log('└' + '─'.repeat(78) + '┘');
  console.log();
}

function printStatistics() {
  const stats = {
    totalTypes: Object.keys(fallbackMessages).length,
    avgTitleLength: 0,
    avgBodyLength: 0,
    minBodyLength: Infinity,
    maxBodyLength: 0,
    withEmoji: 0,
  };

  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{1F004}-\u{1F9FF}]/u;

  Object.values(fallbackMessages).forEach(msg => {
    stats.avgTitleLength += msg.title.length;
    stats.avgBodyLength += msg.body.length;
    stats.minBodyLength = Math.min(stats.minBodyLength, msg.body.length);
    stats.maxBodyLength = Math.max(stats.maxBodyLength, msg.body.length);
    if (emojiRegex.test(msg.body)) {
      stats.withEmoji++;
    }
  });

  stats.avgTitleLength = Math.round(stats.avgTitleLength / stats.totalTypes);
  stats.avgBodyLength = Math.round(stats.avgBodyLength / stats.totalTypes);

  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║ ' + 'СТАТИСТИКА УВЕДОМЛЕНИЙ'.padEnd(76) + ' ║');
  console.log('╠' + '═'.repeat(78) + '╣');
  console.log('║ ' + `Всего типов уведомлений: ${stats.totalTypes}`.padEnd(76) + ' ║');
  console.log('║ ' + `Средняя длина заголовка: ${stats.avgTitleLength} символов`.padEnd(76) + ' ║');
  console.log('║ ' + `Средняя длина тела: ${stats.avgBodyLength} символов`.padEnd(76) + ' ║');
  console.log('║ ' + `Минимальная длина body: ${stats.minBodyLength} символов`.padEnd(76) + ' ║');
  console.log('║ ' + `Максимальная длина body: ${stats.maxBodyLength} символов`.padEnd(76) + ' ║');
  console.log('║ ' + `Уведомлений с эмодзи: ${stats.withEmoji} из ${stats.totalTypes}`.padEnd(76) + ' ║');
  console.log('║ ' + `Лимит body: 120 символов`.padEnd(76) + ' ║');
  console.log('║ ' + `Лимит title: 40 символов`.padEnd(76) + ' ║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log();
}

function printSimulatedDay() {
  const today = new Date('2025-11-02T00:00:00Z');

  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║ ' + 'СИМУЛЯЦИЯ РАБОЧЕГО ДНЯ (2 ноября 2025)'.padEnd(76) + ' ║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log();

  // Morning brief (06:45 Berlin)
  console.log('🌅 06:45 (Berlin) - Morning brief отправляется...');
  console.log();
  printNotification('morning_brief', fallbackMessages.morning_brief, notificationDescriptions.morning_brief);

  // Period forecast (случайное время 07:00-21:00)
  console.log('⏰ 14:23 (Berlin) - Period forecast отправляется (за 3 дня до менструации)...');
  console.log();
  printNotification('period_forecast', fallbackMessages.period_forecast, notificationDescriptions.period_forecast);

  console.log('✅ День завершён. Всего отправлено: 2 уведомления');
  console.log('📊 В логе сохранено с ID:');
  console.log(`   - ${today.toISOString()}-morning_brief`);
  console.log(`   - ${today.toISOString()}-period_forecast`);
  console.log();
}

function main() {
  console.clear();
  console.log();
  console.log('═'.repeat(80));
  console.log('  ДЕМОНСТРАЦИЯ ТЕКСТОВ PUSH-УВЕДОМЛЕНИЙ NASTIA CALENDAR');
  console.log('═'.repeat(80));
  console.log();

  // Статистика
  printStatistics();

  // Все типы уведомлений
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║ ' + 'ВСЕ ТИПЫ УВЕДОМЛЕНИЙ (11 типов)'.padEnd(76) + ' ║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log();

  const order = [
    'morning_brief',
    'fertile_window',
    'ovulation_day',
    'period_forecast',
    'period_check',
    'period_waiting',
    'period_delay_warning',
    'period_confirmed_day0',
    'period_confirmed_day1',
    'period_confirmed_day2',
    'birthday',
  ];

  order.forEach((type, index) => {
    console.log(`📌 ${index + 1}/${order.length}`);
    printNotification(type, fallbackMessages[type], notificationDescriptions[type]);
  });

  // Симуляция рабочего дня
  printSimulatedDay();

  console.log('═'.repeat(80));
  console.log('  💡 ВАЖНО:');
  console.log('  - В продакшене тексты генерируются через AI (Claude Haiku 4.5)');
  console.log('  - Fallback сообщения используются только при отсутствии API ключей');
  console.log('  - Каждый день генерируются уникальные тексты с учётом контекста');
  console.log('  - Дедупликация предотвращает повторную отправку одинаковых типов');
  console.log('═'.repeat(80));
  console.log();
}

main();
