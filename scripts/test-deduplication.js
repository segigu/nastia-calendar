#!/usr/bin/env node

/**
 * Тест для проверки исправлений дедупликации уведомлений
 */

const BERLIN_TZ = 'Europe/Berlin';
const MOSCOW_TZ = 'Europe/Moscow';

// Копируем исправленную функцию toZonedDate
function toZonedDate(date, timeZone) {
  // More reliable timezone conversion using Intl API
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

  // Create date in local time (which will be interpreted as UTC in Date.UTC)
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

// ============ TESTS ============

function runTests() {
  console.log('🧪 Запуск тестов дедупликации уведомлений...\n');

  let passed = 0;
  let failed = 0;

  // Test 1: toZonedDate correctly converts timezone
  console.log('Test 1: Проверка toZonedDate для разных временных зон');
  try {
    const testDate = new Date('2025-11-02T10:30:00Z'); // 10:30 UTC
    const berlinDate = toZonedDate(testDate, BERLIN_TZ);
    const moscowDate = toZonedDate(testDate, MOSCOW_TZ);

    console.log(`  UTC:    ${testDate.toISOString()}`);
    console.log(`  Berlin: ${berlinDate.toISOString().slice(0, -1)} (local time)`);
    console.log(`  Moscow: ${moscowDate.toISOString().slice(0, -1)} (local time)`);

    // В ноябре Berlin = UTC+1, Moscow = UTC+3
    // 10:30 UTC = 11:30 Berlin = 13:30 Moscow
    if (berlinDate.getHours() === 11 && moscowDate.getHours() === 13) {
      console.log('  ✅ PASSED: Временные зоны конвертируются корректно\n');
      passed++;
    } else {
      console.log(`  ❌ FAILED: Ожидалось Berlin=11h, Moscow=13h, получено Berlin=${berlinDate.getHours()}h, Moscow=${moscowDate.getHours()}h\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
    failed++;
  }

  // Test 2: getBerlinDayKey returns consistent day keys
  console.log('Test 2: Проверка консистентности getBerlinDayKey');
  try {
    const morning = new Date('2025-11-02T06:00:00Z'); // 07:00 Berlin
    const evening = new Date('2025-11-02T22:00:00Z'); // 23:00 Berlin
    const nextDay = new Date('2025-11-03T01:00:00Z'); // 02:00 Berlin (next day)

    const key1 = getBerlinDayKey(morning);
    const key2 = getBerlinDayKey(evening);
    const key3 = getBerlinDayKey(nextDay);

    console.log(`  Morning (07:00 Berlin): ${key1}`);
    console.log(`  Evening (23:00 Berlin): ${key2}`);
    console.log(`  Next day (02:00 Berlin): ${key3}`);

    if (key1 === key2 && key1 !== key3) {
      console.log('  ✅ PASSED: День определяется корректно\n');
      passed++;
    } else {
      console.log('  ❌ FAILED: Ключи дня не соответствуют ожиданиям\n');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
    failed++;
  }

  // Test 3: hasNotificationById correctly detects duplicates
  console.log('Test 3: Проверка hasNotificationById');
  try {
    const log = {
      notifications: [
        { id: '2025-11-02T00:00:00.000Z-morning_brief', type: 'morning_brief', sentAt: '2025-11-02T04:45:00Z' },
        { id: '2025-11-02T00:00:00.000Z-period_forecast', type: 'period_forecast', sentAt: '2025-11-02T08:30:00Z' }
      ]
    };

    const exists = hasNotificationById(log, '2025-11-02T00:00:00.000Z-morning_brief');
    const notExists = hasNotificationById(log, '2025-11-03T00:00:00.000Z-morning_brief');

    if (exists && !notExists) {
      console.log('  ✅ PASSED: Проверка по ID работает корректно\n');
      passed++;
    } else {
      console.log('  ❌ FAILED: Проверка по ID не работает\n');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
    failed++;
  }

  // Test 4: getLatestNotificationForDay finds notifications correctly
  console.log('Test 4: Проверка getLatestNotificationForDay');
  try {
    const dayKey = '2025-11-02T00:00:00.000Z';
    const log = {
      notifications: [
        { id: '1', type: 'morning_brief', sentAt: '2025-11-02T04:45:00Z', title: 'Morning 1' },
        { id: '2', type: 'period_forecast', sentAt: '2025-11-02T08:30:00Z', title: 'Period 1' },
        { id: '3', type: 'morning_brief', sentAt: '2025-11-03T04:45:00Z', title: 'Morning 2' }
      ]
    };

    const morningToday = getLatestNotificationForDay(log, dayKey, 'morning_brief');
    const periodToday = getLatestNotificationForDay(log, dayKey, 'period_forecast');
    const anyToday = getLatestNotificationForDay(log, dayKey);

    if (morningToday?.title === 'Morning 1' && periodToday?.title === 'Period 1' && anyToday?.title === 'Morning 1') {
      console.log('  ✅ PASSED: Поиск уведомлений по дню работает корректно\n');
      passed++;
    } else {
      console.log('  ❌ FAILED: Поиск уведомлений по дню не работает\n');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
    failed++;
  }

  // Test 5: Duplicate prevention simulation
  console.log('Test 5: Симуляция предотвращения дубликатов');
  try {
    const today = new Date('2025-11-02T12:00:00Z');
    const dayKey = getBerlinDayKey(today);
    const notificationLog = {
      notifications: [
        { id: '2025-11-02T00:00:00.000Z-morning_brief', type: 'morning_brief', sentAt: '2025-11-02T04:45:00Z' }
      ]
    };

    // Попытка отправить второй morning_brief
    const morningBriefId = `${today.toISOString()}-morning_brief`;
    const isDuplicate1 = getLatestNotificationForDay(notificationLog, dayKey, 'morning_brief') !== null;
    const isDuplicate2 = hasNotificationById(notificationLog, morningBriefId);

    // Попытка отправить period_forecast (должно быть разрешено)
    const periodForecastId = `${today.toISOString()}-period_forecast`;
    const isPeriodDuplicate1 = getLatestNotificationForDay(notificationLog, dayKey, 'period_forecast') !== null;
    const isPeriodDuplicate2 = hasNotificationById(notificationLog, periodForecastId);

    if (isDuplicate1 && isDuplicate2 && !isPeriodDuplicate1 && !isPeriodDuplicate2) {
      console.log('  ✅ PASSED: Дубликаты успешно предотвращены, новые типы разрешены\n');
      passed++;
    } else {
      console.log(`  ❌ FAILED: Логика дедупликации работает неправильно`);
      console.log(`     Morning duplicate (by day): ${isDuplicate1}, (by ID): ${isDuplicate2}`);
      console.log(`     Period duplicate (by day): ${isPeriodDuplicate1}, (by ID): ${isPeriodDuplicate2}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
    failed++;
  }

  // Test 6: Edge case - malformed notification entries
  console.log('Test 6: Обработка некорректных записей');
  try {
    const dayKey = '2025-11-02T00:00:00.000Z';
    const log = {
      notifications: [
        { id: '1', type: 'morning_brief' }, // Missing sentAt
        { id: '2', type: 'period_forecast', sentAt: 'invalid-date' }, // Invalid date
        { id: '3', type: 'morning_brief', sentAt: '2025-11-02T04:45:00Z' } // Valid
      ]
    };

    const found = getLatestNotificationForDay(log, dayKey, 'morning_brief');

    if (found?.id === '3') {
      console.log('  ✅ PASSED: Некорректные записи игнорируются, валидные находятся\n');
      passed++;
    } else {
      console.log('  ❌ FAILED: Обработка некорректных записей не работает\n');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
    failed++;
  }

  // Summary
  console.log('='.repeat(60));
  console.log(`📊 Результаты тестов:`);
  console.log(`   ✅ Пройдено: ${passed}`);
  console.log(`   ❌ Провалено: ${failed}`);
  console.log(`   📈 Общий процент: ${Math.round(passed / (passed + failed) * 100)}%`);
  console.log('='.repeat(60));

  if (failed === 0) {
    console.log('\n🎉 Все тесты пройдены успешно! Дедупликация работает корректно.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Некоторые тесты провалились. Требуется доработка.\n');
    process.exit(1);
  }
}

runTests();
