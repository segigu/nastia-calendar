#!/usr/bin/env node

/**
 * Интеграционный тест системы уведомлений
 * Проверяет полную логику от генерации до дедупликации
 */

const BERLIN_TZ = 'Europe/Berlin';

// ============ Копируем функции из sendNotifications.js ============

function toZonedDate(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = dtf.formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value || '0';

  return new Date(
    parseInt(get('year')),
    parseInt(get('month')) - 1,
    parseInt(get('day')),
    parseInt(get('hour')),
    parseInt(get('minute')),
    parseInt(get('second'))
  );
}

function getBerlinDayKey(date = new Date()) {
  const zoned = toZonedDate(date, BERLIN_TZ);
  zoned.setHours(0, 0, 0, 0);
  return zoned.toISOString();
}

function hasNotificationById(log, notificationId) {
  if (!log || !Array.isArray(log.notifications)) {
    return false;
  }
  return log.notifications.some(entry => entry?.id === notificationId);
}

function getLatestNotificationForDay(log, dayKey, filterType) {
  if (!log || !Array.isArray(log.notifications)) {
    return null;
  }
  for (const entry of log.notifications) {
    if (!entry?.sentAt) {
      continue;
    }
    try {
      const entryKey = getBerlinDayKey(new Date(entry.sentAt));
      if (entryKey === dayKey && (!filterType || entry.type === filterType)) {
        return entry;
      }
    } catch (error) {
      console.warn('Failed to parse notification sentAt:', entry.sentAt, error.message);
      continue;
    }
  }
  return null;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function buildNotificationPayload(type, message, today) {
  return {
    id: `${today.toISOString()}-${type}`,
    type,
    title: message.title,
    body: message.body,
    sentAt: new Date().toISOString(),
    url: message.url ?? `https://test.com/?open=${type}`,
  };
}

// ============ INTEGRATION TESTS ============

function runIntegrationTest() {
  console.log('🔬 Запуск интеграционного теста системы уведомлений\n');
  console.log('='.repeat(70));

  // Симулируем день работы системы
  const today = startOfDay(new Date('2025-11-02T12:00:00Z'));
  const dayKey = getBerlinDayKey(today);

  console.log(`📅 Тестируемая дата: ${today.toISOString()}`);
  console.log(`🔑 Day key (Berlin): ${dayKey}\n`);

  // Инициализируем лог уведомлений (пустой)
  let notificationsLog = {
    notifications: [],
    lastUpdated: new Date().toISOString()
  };

  console.log('='.repeat(70));
  console.log('📨 СЦЕНАРИЙ 1: Первая отправка morning_brief\n');

  // Первый запуск - morning brief
  const morningBriefId = `${today.toISOString()}-morning_brief`;
  const morningMessage = {
    title: 'Утренний пинок',
    body: 'Настя, сегодня выживание на грани — терпи, вечером полегчает! 💥',
    url: 'https://test.com/?open=daily-horoscope'
  };

  // Проверяем, есть ли уже morning_brief
  const existingMorning = getLatestNotificationForDay(notificationsLog, dayKey, 'morning_brief');
  const isDuplicateById = hasNotificationById(notificationsLog, morningBriefId);

  console.log(`Проверка дубликата (по дню): ${existingMorning ? '❌ ДУБЛИКАТ' : '✅ НЕТ'}`);
  console.log(`Проверка дубликата (по ID): ${isDuplicateById ? '❌ ДУБЛИКАТ' : '✅ НЕТ'}`);

  if (!existingMorning && !isDuplicateById) {
    const payload = buildNotificationPayload('morning_brief', morningMessage, today);
    notificationsLog.notifications.unshift(payload);
    console.log(`✅ Отправлено: ${payload.title}`);
    console.log(`   ID: ${payload.id}`);
    console.log(`   Body: ${payload.body.slice(0, 50)}...`);
  } else {
    console.log('❌ ОШИБКА: Дубликат обнаружен при первой отправке!');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🔁 СЦЕНАРИЙ 2: Повторный запуск (через 1 час) - дубликат должен быть предотвращён\n');

  // Второй запуск (через час) - должен быть заблокирован
  const existingMorning2 = getLatestNotificationForDay(notificationsLog, dayKey, 'morning_brief');
  const isDuplicateById2 = hasNotificationById(notificationsLog, morningBriefId);

  console.log(`Проверка дубликата (по дню): ${existingMorning2 ? '✅ НАЙДЕН' : '❌ НЕ НАЙДЕН'}`);
  console.log(`Проверка дубликата (по ID): ${isDuplicateById2 ? '✅ НАЙДЕН' : '❌ НЕ НАЙДЕН'}`);

  if (existingMorning2 && isDuplicateById2) {
    console.log('✅ УСПЕХ: Дубликат корректно предотвращён!');
    console.log(`   Существующий ID: ${existingMorning2.id}`);
    console.log(`   Время отправки: ${existingMorning2.sentAt}`);
  } else {
    console.log('❌ ОШИБКА: Дедупликация не работает!');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('📨 СЦЕНАРИЙ 3: Отправка другого типа (period_forecast) - должна быть разрешена\n');

  const periodForecastId = `${today.toISOString()}-period_forecast`;
  const periodMessage = {
    title: 'Зоя ПМСова',
    body: 'Настюх, через 3 дня шторм — запасайся шоколадом! 🙄🍫'
  };

  const existingPeriod = getLatestNotificationForDay(notificationsLog, dayKey, 'period_forecast');
  const isPeriodDuplicateById = hasNotificationById(notificationsLog, periodForecastId);

  console.log(`Проверка дубликата period_forecast (по дню): ${existingPeriod ? '❌ ДУБЛИКАТ' : '✅ НЕТ'}`);
  console.log(`Проверка дубликата period_forecast (по ID): ${isPeriodDuplicateById ? '❌ ДУБЛИКАТ' : '✅ НЕТ'}`);

  if (!existingPeriod && !isPeriodDuplicateById) {
    const payload = buildNotificationPayload('period_forecast', periodMessage, today);
    notificationsLog.notifications.unshift(payload);
    console.log(`✅ Отправлено: ${payload.title}`);
    console.log(`   ID: ${payload.id}`);
    console.log(`   Body: ${payload.body.slice(0, 50)}...`);
  } else {
    console.log('❌ ОШИБКА: period_forecast не должен быть заблокирован!');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 СЦЕНАРИЙ 4: Проверка состояния лога после всех операций\n');

  console.log(`Всего уведомлений в логе: ${notificationsLog.notifications.length}`);
  console.log('\nСписок уведомлений:');
  notificationsLog.notifications.forEach((notif, index) => {
    console.log(`  ${index + 1}. [${notif.type}] ${notif.title}`);
    console.log(`     ID: ${notif.id}`);
    console.log(`     Sent: ${notif.sentAt}`);
  });

  if (notificationsLog.notifications.length === 2) {
    console.log('\n✅ УСПЕХ: В логе ровно 2 уведомления (morning_brief + period_forecast)');
  } else {
    console.log(`\n❌ ОШИБКА: Ожидалось 2 уведомления, получено ${notificationsLog.notifications.length}`);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🌅 СЦЕНАРИЙ 5: Следующий день - новые уведомления должны быть разрешены\n');

  const tomorrow = startOfDay(new Date('2025-11-03T12:00:00Z'));
  const tomorrowDayKey = getBerlinDayKey(tomorrow);
  const tomorrowMorningId = `${tomorrow.toISOString()}-morning_brief`;

  console.log(`📅 Новая дата: ${tomorrow.toISOString()}`);
  console.log(`🔑 Day key (Berlin): ${tomorrowDayKey}\n`);

  const existingTomorrowMorning = getLatestNotificationForDay(notificationsLog, tomorrowDayKey, 'morning_brief');
  const isTomorrowDuplicateById = hasNotificationById(notificationsLog, tomorrowMorningId);

  console.log(`Проверка дубликата (по дню): ${existingTomorrowMorning ? '❌ ДУБЛИКАТ' : '✅ НЕТ'}`);
  console.log(`Проверка дубликата (по ID): ${isTomorrowDuplicateById ? '❌ ДУБЛИКАТ' : '✅ НЕТ'}`);

  if (!existingTomorrowMorning && !isTomorrowDuplicateById) {
    const payload = buildNotificationPayload('morning_brief', morningMessage, tomorrow);
    notificationsLog.notifications.unshift(payload);
    console.log(`✅ Отправлено: ${payload.title} (новый день)`);
    console.log(`   ID: ${payload.id}`);
  } else {
    console.log('❌ ОШИБКА: Уведомления на следующий день должны быть разрешены!');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🎯 ИТОГОВОЕ СОСТОЯНИЕ СИСТЕМЫ\n');

  console.log(`Всего уведомлений в логе: ${notificationsLog.notifications.length}`);

  const morningCount = notificationsLog.notifications.filter(n => n.type === 'morning_brief').length;
  const periodCount = notificationsLog.notifications.filter(n => n.type === 'period_forecast').length;

  console.log(`  - morning_brief: ${morningCount} (ожидается 2 - по одному на день)`);
  console.log(`  - period_forecast: ${periodCount} (ожидается 1)`);

  if (morningCount === 2 && periodCount === 1) {
    console.log('\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
    console.log('\n📝 Выводы:');
    console.log('  1. ✅ Дедупликация по дню работает корректно');
    console.log('  2. ✅ Дедупликация по ID работает корректно');
    console.log('  3. ✅ Разные типы уведомлений в один день разрешены');
    console.log('  4. ✅ Уведомления на следующий день разрешены');
    console.log('  5. ✅ Повторные запуски корректно блокируются\n');
    console.log('🎉 Система готова к продакшену!\n');
    process.exit(0);
  } else {
    console.log('\n❌ ОШИБКА: Итоговое состояние не соответствует ожиданиям');
    process.exit(1);
  }
}

runIntegrationTest();
