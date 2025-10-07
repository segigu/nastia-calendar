#!/usr/bin/env node

// Script to fix corrupted nastia-notifications.json file

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

    const url = `https://api.github.com/repos/${username}/nastia-data/contents/nastia-notifications.json`;

    console.log('\n🔍 Fetching current file...');
    const getResponse = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    let sha;
    if (getResponse.ok) {
      const fileData = await getResponse.json();
      sha = fileData.sha;
      console.log('✅ Found file with SHA:', sha.substring(0, 7));
    } else if (getResponse.status === 404) {
      console.log('⚠️  File does not exist, will create new one');
    } else {
      throw new Error(`Failed to fetch file: ${getResponse.statusText}`);
    }

    // Create clean notifications log
    const cleanLog = {
      notifications: [],
      lastUpdated: new Date().toISOString(),
    };

    const content = Buffer.from(JSON.stringify(cleanLog, null, 2)).toString('base64');

    console.log('\n📝 Writing clean file...');
    const putResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Fix corrupted nastia-notifications.json',
        content,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!putResponse.ok) {
      const errorText = await putResponse.text();
      throw new Error(`Failed to save file: ${errorText}`);
    }

    console.log('✅ File fixed successfully!');
    console.log('\nClean notifications log created with:');
    console.log('  - notifications: []');
    console.log('  - lastUpdated:', cleanLog.lastUpdated);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
