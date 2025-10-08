import { NotificationCategory } from '../types';

const GITHUB_OWNER = 'segigu';
const GITHUB_REPO = 'nastia-data';
const CONFIG_FILE = 'nastia-config.json';

interface RemoteConfig {
  openAI?: {
    apiKey?: string;
  };
  claude?: {
    apiKey?: string;
  };
  notifications?: {
    defaultType?: NotificationCategory;
  };
  notificationSchedule?: {
    dayKey?: string;
    targetMinutes?: number;
    targetTime?: string;
    timezone?: string;
    slotMinutes?: number;
    generatedAt?: string;
  };
  updatedAt?: string;
}

export async function fetchRemoteConfig(token: string): Promise<RemoteConfig | null> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIG_FILE}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to load remote config: ${message}`);
  }

  const payload = await response.json();
  const content = atob((payload.content as string).replace(/\n/g, ''));

  try {
    return JSON.parse(content) as RemoteConfig;
  } catch (error) {
    console.error('Failed to parse remote config', error);
    console.error('Config content:', content.substring(0, 500));
    return null;
  }
}
