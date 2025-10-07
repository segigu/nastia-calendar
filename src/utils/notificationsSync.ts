import { NotificationItem, NotificationCategory } from '../types';

const GITHUB_OWNER = 'segigu';
const GITHUB_REPO = 'nastia-data';
const NOTIFICATIONS_FILE = 'nastia-notifications.json';

interface RemoteNotificationsPayload {
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    sentAt: string;
    type?: string;
  }>;
  lastUpdated?: string;
}

function normalizeCategory(value: string | undefined): NotificationCategory {
  if (value === 'fertile_window' || value === 'ovulation_day' || value === 'period_forecast' || value === 'period_start') {
    return value;
  }
  return 'generic';
}

export async function fetchRemoteNotifications(token: string): Promise<NotificationItem[]> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${NOTIFICATIONS_FILE}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to load notifications: ${message}`);
  }

  const payload = await response.json();
  const content = atob((payload.content as string).replace(/\n/g, ''));

  let parsed: RemoteNotificationsPayload;
  try {
    parsed = JSON.parse(content) as RemoteNotificationsPayload;
  } catch (error) {
    console.error('Failed to parse remote notifications file', error);
    return [];
  }

  if (!Array.isArray(parsed.notifications)) {
    return [];
  }

  return parsed.notifications.map(item => ({
    id: item.id,
    title: item.title,
    body: item.body,
    sentAt: item.sentAt,
    type: normalizeCategory(item.type),
  }));
}
