import { NotificationItem, NotificationCategory } from '../types';

const GITHUB_OWNER = 'segigu';
const GITHUB_REPO = 'nastia-data';
const NOTIFICATIONS_FILE = 'nastia-notifications.json';

interface RemoteNotificationsPayload {
  notifications: Array<{
    id?: string;
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
  const content = stripBom(await extractFileContent(payload, token, url)).trim();

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

  const seenIds = new Set<string>();

  return parsed.notifications.map((item, index) => {
    const resolvedId = resolveNotificationId(item, index);
    const uniqueId = ensureUniqueId(resolvedId, seenIds);
    seenIds.add(uniqueId);

    return {
      id: uniqueId,
      title: item.title,
      body: item.body,
      sentAt: item.sentAt,
      type: normalizeCategory(item.type),
    };
  });
}

function decodeBase64Utf8(value: string): string {
  const normalized = (value || '').replace(/\s/g, '');
  if (!normalized) {
    return '';
  }

  const binary = atob(normalized);

  if (typeof TextDecoder !== 'undefined') {
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  try {
    let percentEncoded = '';
    for (let i = 0; i < binary.length; i += 1) {
      const hex = binary.charCodeAt(i).toString(16).padStart(2, '0');
      percentEncoded += `%${hex}`;
    }
    return decodeURIComponent(percentEncoded);
  } catch (error) {
    console.warn('Failed to decode UTF-8 content from base64', error);
    return binary;
  }
}

function resolveNotificationId(
  item: { id?: string; sentAt?: string; title?: string; body?: string },
  index: number
): string {
  // Ensure every notification has a stable id so lists do not collapse when remote data misses the field.
  const existing = (item.id ?? '').trim();
  if (existing) {
    return existing;
  }

  const sentAt = (item.sentAt ?? '').trim();
  if (sentAt) {
    return `auto-${hashString(`${sentAt}-${index}`)}`;
  }

  const title = (item.title ?? '').trim();
  const body = (item.body ?? '').trim();
  const fallbackSource = `${title}|${body}|${index}`;

  return `auto-${hashString(fallbackSource)}`;
}

function stripBom(value: string): string {
  if (!value) {
    return '';
  }

  if (value.charCodeAt(0) === 0xfeff) {
    return value.slice(1);
  }
  return value;
}

async function extractFileContent(
  payload: {
    content?: string;
    encoding?: string;
    download_url?: string;
    truncated?: boolean;
  },
  token: string,
  apiUrl: string
): Promise<string> {
  const { content, encoding, download_url: downloadUrl, truncated } = payload;

  if (!truncated && content && encoding === 'base64') {
    return decodeBase64Utf8(content);
  }

  if (downloadUrl) {
    const downloadResponse = await fetch(downloadUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/octet-stream',
      },
    });

    if (downloadResponse.ok) {
      return await downloadResponse.text();
    }
  }

  const rawResponse = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3.raw',
    },
  });

  if (rawResponse.ok) {
    return await rawResponse.text();
  }

  if (content) {
    return decodeBase64Utf8(content);
  }

  return '';
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  // Convert to unsigned and to base36 for shorter ids
  return (hash >>> 0).toString(36);
}

function ensureUniqueId(id: string, seen: Set<string>): string {
  if (!seen.has(id)) {
    return id;
  }

  let counter = 1;
  let candidate = `${id}-${counter}`;
  while (seen.has(candidate)) {
    counter += 1;
    candidate = `${id}-${counter}`;
  }
  return candidate;
}
