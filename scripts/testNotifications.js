#!/usr/bin/env node

// Тестовый скрипт для проверки отправки уведомлений локально

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

async function main() {
  try {
    console.log('🔍 Fetching GitHub username...');
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch GitHub user');
    }

    const userData = await userResponse.json();
    const username = userData.login;
    console.log('✅ Username:', username);

    console.log('\n🔍 Fetching subscriptions...');
    const subsUrl = `https://api.github.com/repos/${username}/nastia-data/contents/subscriptions.json`;
    const subsResponse = await fetch(subsUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (subsResponse.status === 404) {
      console.error('❌ subscriptions.json not found');
      console.log('\nTo fix: Enable cloud sync and push notifications in the app');
      return;
    }

    if (!subsResponse.ok) {
      throw new Error(`Failed to fetch subscriptions: ${subsResponse.statusText}`);
    }

    const subsData = await subsResponse.json();
    const content = Buffer.from(subsData.content, 'base64').toString('utf8');
    const subscriptions = JSON.parse(content);

    console.log('✅ Found', subscriptions.subscriptions.length, 'subscription(s)');

    let sent = 0;
    for (const subscription of subscriptions.subscriptions) {
      const settings = subscription.settings || {};
      const enabled = settings.enabled !== false;

      console.log('\n📱 Subscription:', subscription.endpoint.slice(-20));
      console.log('   Enabled:', enabled);

      if (!enabled) {
        console.log('   ⏭️  Skipping (disabled)');
        continue;
      }

      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      };

      const payload = JSON.stringify({
        title: 'Тестовое уведомление',
        body: '🎉 Привет! Это тест от Насти. Если видишь это — всё работает!',
        id: `test-${Date.now()}`,
        type: 'generic',
        sentAt: new Date().toISOString(),
      });

      console.log('   📤 Sending test notification...');

      try {
        const result = await webpush.sendNotification(
          pushSubscription,
          Buffer.from(payload, 'utf-8'),
          {
            contentEncoding: 'aes128gcm'
          }
        );
        sent += 1;
        console.log('   ✅ Sent! Status:', result.statusCode);
      } catch (error) {
        const status = error?.statusCode ?? error?.status ?? 'unknown';
        const responseBody = error?.body ? error.body.toString() : 'no body';
        console.error('   ❌ Failed:', error.message);
        console.error('   Status:', status);
        console.error('   Response:', responseBody);
      }
    }

    console.log('\n📊 Summary:');
    console.log('   Total subscriptions:', subscriptions.subscriptions.length);
    console.log('   Notifications sent:', sent);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
