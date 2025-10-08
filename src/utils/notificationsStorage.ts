import { NotificationItem } from '../types';

const NOTIFICATIONS_KEY = 'nastia-notifications';
const READ_SET_KEY = 'nastia-notifications-read';

export interface StoredNotification extends NotificationItem {
  read: boolean;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn('Failed to parse stored notifications payload', error);
    return fallback;
  }
}

export function loadLocalNotifications(): StoredNotification[] {
  return parseJson<StoredNotification[]>(localStorage.getItem(NOTIFICATIONS_KEY), []);
}

export function saveLocalNotifications(notifications: StoredNotification[]): void {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
}

export function clearLocalNotifications(): void {
  localStorage.removeItem(NOTIFICATIONS_KEY);
  localStorage.removeItem(READ_SET_KEY);
}

export function loadReadSet(): Set<string> {
  const parsed = parseJson<string[]>(localStorage.getItem(READ_SET_KEY), []);
  return new Set(parsed);
}

export function saveReadSet(ids: Set<string>): void {
  localStorage.setItem(READ_SET_KEY, JSON.stringify(Array.from(ids)));
}

export function mergeNotifications(
  incoming: NotificationItem[],
  existing: StoredNotification[],
  readIds: Set<string>
): StoredNotification[] {
  const byId = new Map<string, StoredNotification>();
  for (const item of existing) {
    byId.set(item.id, item);
  }

  for (const incomingItem of incoming) {
    const read = readIds.has(incomingItem.id);
    byId.set(incomingItem.id, { ...incomingItem, read });
  }

  const merged = Array.from(byId.values())
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

  return merged;
}

export function markAllAsRead(notifications: StoredNotification[]): {
  updated: StoredNotification[];
  readSet: Set<string>;
} {
  const updated = notifications.map(notification => ({ ...notification, read: true }));
  const readSet = new Set(updated.map(notification => notification.id));
  return { updated, readSet };
}

export function addSingleNotification(
  notification: NotificationItem,
  notifications: StoredNotification[],
  readIds: Set<string>
): StoredNotification[] {
  const merged = mergeNotifications([notification], notifications, readIds);
  // Ensure new notification inserted at top and read value stays false if not previously read
  return merged.map(item =>
    item.id === notification.id ? { ...item, read: readIds.has(item.id) } : item
  );
}
