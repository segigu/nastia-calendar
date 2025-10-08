#!/usr/bin/env node

const fetch = (...args) => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(...args);
  }
  return import('node-fetch').then(({ default: fetchModule }) => fetchModule(...args));
};

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error('Missing GITHUB_TOKEN');
  process.exit(1);
}

async function main() {
  try {
    // Get username
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
    console.log('GitHub username:', username);

    // Check subscriptions
    const subsUrl = `https://api.github.com/repos/${username}/nastia-data/contents/subscriptions.json`;
    const subsResponse = await fetch(subsUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (subsResponse.status === 404) {
      console.log('\n❌ subscriptions.json NOT FOUND');
      console.log('This is why notifications are not being sent!');
      console.log('\nTo fix: Enable notifications in the app with cloud sync enabled');
      return;
    }

    if (!subsResponse.ok) {
      throw new Error(`Failed to fetch subscriptions: ${subsResponse.statusText}`);
    }

    const subsData = await subsResponse.json();
    const content = Buffer.from(subsData.content, 'base64').toString('utf8');
    const subscriptions = JSON.parse(content);

    console.log('\n✅ subscriptions.json found');
    console.log('Total subscriptions:', subscriptions.subscriptions.length);
    console.log('\nSubscriptions:');
    subscriptions.subscriptions.forEach((sub, i) => {
      console.log(`\n${i + 1}. Endpoint: ${sub.endpoint.slice(-20)}`);
      console.log(`   Enabled: ${sub.settings?.enabled !== false}`);
      console.log(`   Full endpoint: ${sub.endpoint}`);
    });

    console.log('\nLast updated:', subscriptions.lastUpdated);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
