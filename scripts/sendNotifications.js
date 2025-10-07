#!/usr/bin/env node

const webpush = require('web-push');

const fetch = (...args) => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(...args);
  }
  return import('node-fetch').then(({ default: fetchModule }) => fetchModule(...args));
};

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_NOTIFICATIONS_MODEL = process.env.OPENAI_NOTIFICATIONS_MODEL || 'gpt-4o-mini';

const CONFIG_FILE = 'nastia-config.json';

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const MOSCOW_TZ = 'Europe/Moscow';

if (!GITHUB_TOKEN) {
  console.error('Missing GITHUB_TOKEN');
  process.exit(1);
}

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Missing VAPID keys');
  process.exit(1);
}

webpush.setVapidDetails(
  'mailto:noreply@nastia-calendar.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const responseSchema = {
  name: 'push_notification',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'body'],
    properties: {
      title: {
        type: 'string',
        description: 'Very short push title in Russian (max 5 words), no emoji.',
      },
      body: {
        type: 'string',
        description: 'Push body up to 110 characters with 1-2 emojis and biting supportive sarcasm.',
      },
    },
  },
};

const fallbackMessages = {
  fertile_window: {
    title: 'Настя подсказывает',
    body: '💋 Фертильное окно открыто. Если не хочешь мини-Насть — держи план Б под рукой.',
  },
  ovulation_day: {
    title: 'Овуляция на подходе',
    body: '🔥 Сегодня овуляция. Презервативы не на тумбочке для красоты, а ради спокойствия.',
  },
  period_forecast: {
    title: 'ПМС-бронежилет',
    body: '🙄 До менструации пару дней. Держи шоколад, грелку и боевой настрой.',
  },
  period_start: {
    title: 'День Х пришёл',
    body: '🩸 Менструация на горизонте. Укутайся и не подпускай никого без чая и извинений.',
  },
};

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getMoscowToday() {
  const now = new Date();
  const moscowString = now.toLocaleString('en-US', { timeZone: MOSCOW_TZ });
  const moscowDate = new Date(moscowString);
  moscowDate.setHours(0, 0, 0, 0);
  return moscowDate;
}

function diffInDays(from, to) {
  return Math.round((to.getTime() - from.getTime()) / MS_IN_DAY);
}

function formatRussianDate(date) {
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

async function fetchFromGitHub(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  return response;
}

async function loadRepoJson(username, filename, fallbackValue) {
  const url = `https://api.github.com/repos/${username}/nastia-data/contents/${filename}`;
  const response = await fetchFromGitHub(url);

  if (response.status === 404) {
    return fallbackValue;
  }

  if (!response.ok) {
    throw new Error(`Failed to load ${filename}: ${response.statusText}`);
  }

  const payload = await response.json();
  const content = Buffer.from(payload.content, 'base64').toString('utf8');
  return JSON.parse(content);
}

async function loadConfig(username) {
  try {
    return await loadRepoJson(username, CONFIG_FILE, null);
  } catch (error) {
    console.warn('Failed to load config, continuing with defaults:', error.message);
    return null;
  }
}

async function saveConfig(username, config) {
  const url = `https://api.github.com/repos/${username}/nastia-data/contents/${CONFIG_FILE}`;

  const content = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');

  let sha;
  const getResponse = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (getResponse.ok) {
    const fileData = await getResponse.json();
    sha = fileData.sha;
  }

  const putResponse = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Update config ${new Date().toISOString()}`,
      content,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putResponse.ok) {
    const errorPayload = await putResponse.text();
    throw new Error(`Failed to save config: ${errorPayload}`);
  }
}

function computeCycleStats(cycles) {
  if (!Array.isArray(cycles) || cycles.length === 0) {
    return null;
  }

  const sorted = [...cycles]
    .map(cycle => ({ ...cycle, startDate: startOfDay(new Date(cycle.startDate)) }))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  if (sorted.length === 0) {
    return null;
  }

  const cycleLengths = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].startDate;
    const current = sorted[i].startDate;
    cycleLengths.push(diffInDays(prev, current));
  }

  const averageLength = cycleLengths.length > 0
    ? Math.round(cycleLengths.reduce((sum, len) => sum + len, 0) / cycleLengths.length)
    : 28;

  const lastStart = sorted[sorted.length - 1].startDate;
  const nextPeriod = startOfDay(addDays(lastStart, averageLength));
  const ovulationDay = startOfDay(addDays(nextPeriod, -14));
  const fertileStart = startOfDay(addDays(ovulationDay, -5));

  return {
    lastStart,
    nextPeriod,
    averageLength,
    ovulationDay,
    fertileStart,
    fertileEnd: ovulationDay,
  };
}

function pickNotificationType(today, stats) {
  const { nextPeriod, ovulationDay, fertileStart } = stats;

  const daysUntilPeriod = diffInDays(today, nextPeriod);
  const daysUntilOvulation = diffInDays(today, ovulationDay);

  if (daysUntilPeriod === 0) {
    return {
      type: 'period_start',
      metadata: { daysUntilPeriod },
    };
  }

  if (daysUntilPeriod > 0 && daysUntilPeriod <= 5) {
    return {
      type: 'period_forecast',
      metadata: { daysUntilPeriod },
    };
  }

  if (daysUntilOvulation === 0) {
    return {
      type: 'ovulation_day',
      metadata: { daysUntilOvulation },
    };
  }

  const fertileEndExclusive = startOfDay(stats.fertileEnd);
  if (today.getTime() >= fertileStart.getTime() && today.getTime() < fertileEndExclusive.getTime()) {
    return {
      type: 'fertile_window',
      metadata: {
        daysUntilOvulation,
      },
    };
  }

  return null;
}

function buildPrompt(type, context) {
  const base = `Ты — Настя, язвительная подруга с чёрным, но тёплым чувством юмора. Пиши по-русски легко и разговорно, без официальности.
Задача: придумать push-уведомление для календаря цикла.
Формат: короткий заголовок до 5 слов (без эмодзи) и тело до 110 символов. В теле 1-2 подходящих эмодзи. Юмор — жесткий сарказм, но поддерживающий. Без обсценной лексики, без унижений, без упоминаний конкретных сервисов.
Сегодня: ${context.todayHuman}. Следующая менструация: ${context.periodHuman}.`;

  switch (type) {
    case 'fertile_window':
      return `${base}
Ситуация: фертильное окно, до овуляции ${context.daysUntilOvulation} ${context.daysWord}. Нужно ехидно предупредить про вероятность беременности и важность защиты.`;
    case 'ovulation_day':
      return `${base}
Ситуация: сегодня овуляция. Сообщи об этом с сухим сарказмом и прямым напоминанием про контрацепцию.`;
    case 'period_forecast':
      return `${base}
Ситуация: до менструации ${context.daysUntilPeriod} ${context.daysWord}. Поддержи в стиле ПМС-режима: подколы, самоирония, совет пережить качели.`;
    case 'period_start':
      return `${base}
Ситуация: ожидается начало менструации сегодня. Нужен ещё более хлёсткий сарказм, намёк на выживание и заботу о себе.`;
    default:
      return base;
  }
}

function getDaysWord(value) {
  const absValue = Math.abs(value);
  if (absValue === 1) return 'день';
  if (absValue >= 2 && absValue <= 4) return 'дня';
  return 'дней';
}

async function generateMessage(type, context, cache) {
  if (cache.has(type)) {
    return cache.get(type);
  }

  if (!OPENAI_API_KEY) {
    const fallback = fallbackMessages[type];
    cache.set(type, fallback);
    return fallback;
  }

  const prompt = buildPrompt(type, context);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_NOTIFICATIONS_MODEL,
        temperature: 0.95,
        max_tokens: 220,
        response_format: {
          type: 'json_schema',
          json_schema: responseSchema,
        },
        messages: [
          {
            role: 'system',
            content: 'You are Nastia, a witty, sarcastic Russian female friend. Always follow the schema and keep things concise.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('OpenAI returned empty content');
    }

    const parsed = JSON.parse(raw);
    if (!parsed.title || !parsed.body) {
      throw new Error('OpenAI response missing fields');
    }

    cache.set(type, parsed);
    return parsed;
  } catch (error) {
    console.warn(`Falling back to canned text for type ${type}:`, error.message);
    const fallback = fallbackMessages[type];
    cache.set(type, fallback);
    return fallback;
  }
}

async function loadNotificationsLog(username) {
  const data = await loadRepoJson(username, 'nastia-notifications.json', {
    notifications: [],
    lastUpdated: new Date().toISOString(),
  });
  if (!Array.isArray(data.notifications)) {
    data.notifications = [];
  }
  return data;
}

async function saveNotificationsLog(username, log) {
  const url = `https://api.github.com/repos/${username}/nastia-data/contents/nastia-notifications.json`;

  const content = Buffer.from(JSON.stringify(log, null, 2)).toString('base64');

  let sha;
  const getResponse = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (getResponse.ok) {
    const fileData = await getResponse.json();
    sha = fileData.sha;
  }

  const putResponse = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Update notifications log ${new Date().toISOString()}`,
      content,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putResponse.ok) {
    const errorPayload = await putResponse.text();
    throw new Error(`Failed to save notifications log: ${errorPayload}`);
  }
}

function buildNotificationPayload(type, message, today) {
  return {
    id: `${today.toISOString()}-${type}`,
    type,
    title: message.title,
    body: message.body,
    sentAt: new Date().toISOString(),
  };
}

async function main() {
  try {
    const userResponse = await fetchFromGitHub('https://api.github.com/user');
    if (!userResponse.ok) {
      throw new Error('Failed to fetch GitHub user');
    }
    const userData = await userResponse.json();
    const username = userData.login;

    const nastiaData = await loadRepoJson(username, 'nastia-data.json', null);
    if (!nastiaData || !nastiaData.cycles || nastiaData.cycles.length === 0) {
      console.log('No cycles available, skipping notifications');
      return;
    }

    const subscriptionsData = await loadRepoJson(username, 'subscriptions.json', {
      subscriptions: [],
      lastUpdated: new Date().toISOString(),
    });

    const currentConfig = await loadConfig(username);
    if (OPENAI_API_KEY && OPENAI_API_KEY.trim()) {
      const nextConfig = {
        ...(currentConfig ?? {}),
        openAI: {
          apiKey: OPENAI_API_KEY.trim(),
        },
        updatedAt: new Date().toISOString(),
      };

      const shouldUpdate =
        !currentConfig ||
        !currentConfig.openAI ||
        currentConfig.openAI.apiKey !== OPENAI_API_KEY.trim();

      if (shouldUpdate) {
        try {
          await saveConfig(username, nextConfig);
          console.log('Configuration file updated with OpenAI key');
        } catch (error) {
          console.error('Failed to update configuration file:', error.message);
        }
      }
    }

    const stats = computeCycleStats(nastiaData.cycles);
    if (!stats) {
      console.log('Not enough data to compute stats');
      return;
    }

    const today = getMoscowToday();
    const typeInfo = pickNotificationType(today, stats);

    if (!typeInfo) {
      console.log('No notification planned for today');
      return;
    }

    const { type, metadata } = typeInfo;
    const messageCache = new Map();

    const notificationsLog = await loadNotificationsLog(username);

    const context = {
      todayHuman: formatRussianDate(today),
      periodHuman: formatRussianDate(stats.nextPeriod),
      daysUntilPeriod: metadata?.daysUntilPeriod ?? diffInDays(today, stats.nextPeriod),
      daysUntilOvulation: metadata?.daysUntilOvulation ?? diffInDays(today, stats.ovulationDay),
      daysWord: getDaysWord(metadata?.daysUntilPeriod ?? metadata?.daysUntilOvulation ?? 0),
    };

    let sent = 0;
    let logEntry;

    for (const subscription of subscriptionsData.subscriptions) {
      const settings = subscription.settings || {};
      const enabled = settings.enabled !== false;
      if (!enabled) {
        continue;
      }

      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      };

      const message = await generateMessage(type, context, messageCache);
      if (!logEntry) {
        logEntry = buildNotificationPayload(type, message, today);
      }

      const payload = JSON.stringify({
        title: message.title,
        body: message.body,
        id: logEntry.id,
        type,
        sentAt: logEntry.sentAt,
      });

      try {
        await webpush.sendNotification(pushSubscription, payload);
        sent += 1;
        console.log(`Notification (${type}) sent to ${subscription.endpoint.slice(-20)}`);
      } catch (error) {
        console.error(`Failed to send to ${subscription.endpoint.slice(-20)}:`, error.message);
      }
    }

    if (sent > 0 && logEntry) {
      notificationsLog.notifications.unshift(logEntry);
      notificationsLog.notifications = notificationsLog.notifications.slice(0, 200);
      notificationsLog.lastUpdated = new Date().toISOString();
      try {
        await saveNotificationsLog(username, notificationsLog);
      } catch (error) {
        console.error('Failed to persist notifications log:', error.message);
      }
    }

    console.log(`Total notifications sent: ${sent}`);
  } catch (error) {
    console.error('Error in notification job:', error);
    process.exit(1);
  }
}

main();
