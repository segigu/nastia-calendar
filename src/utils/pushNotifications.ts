// Утилиты для работы с push-уведомлениями

// Public VAPID key
// Это публичный ключ, можно хранить в коде
const VAPID_PUBLIC_KEY = 'BHny9gVuz3Muw9SYx2IiPyN6dapIeqdWUtPK24USYjrXwXz-IjyPVk6dN9RqzTsYP61zr7kaEilNk0bBFC0HXkc';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  settings?: NotificationSettings;
}

export interface NotificationSettings {
  enabled: boolean;
}

const SETTINGS_KEY = 'nastia-notification-settings';
const SUBSCRIPTION_KEY = 'nastia-push-subscription';

function resolveServiceWorkerPath(): string {
  const publicUrl = process.env.PUBLIC_URL ?? '';

  if (!publicUrl) {
    return '/service-worker.js';
  }

  const normalizePath = (value: string): string => {
    const trimmed = value.replace(/\/+$/, '');
    if (!trimmed) {
      return '/service-worker.js';
    }
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${withLeadingSlash}/service-worker.js`;
  };

  try {
    const url = new URL(publicUrl, window.location.href);
    const pathname = url.pathname || '/';
    return normalizePath(pathname);
  } catch {
    if (publicUrl.startsWith('http')) {
      try {
        const parsed = new URL(publicUrl);
        return normalizePath(parsed.pathname || '/');
      } catch {
        /* noop */
      }
    }

    return normalizePath(publicUrl);
  }
}

// Регистрация Service Worker
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('Service Worker registration skipped in non-production environment');
    return null;
  }

  if ('serviceWorker' in navigator) {
    try {
      const swPath = resolveServiceWorkerPath();
      const registration = await navigator.serviceWorker.register(swPath);
      console.log('Service Worker registered with path:', swPath);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }
  return null;
};

// Проверка поддержки уведомлений
export const isNotificationSupported = (): boolean => {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
};

// Запрос разрешения на уведомления
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!isNotificationSupported()) {
    throw new Error('Notifications not supported');
  }

  const permission = await Notification.requestPermission();
  return permission;
};

// Конвертация VAPID ключа
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Подписка на push-уведомления
export const subscribeToPush = async (): Promise<PushSubscriptionData | null> => {
  try {
    const registration = await navigator.serviceWorker.ready;

    // Проверяем существующую подписку
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Создаём новую подписку
      const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as BufferSource
      });
    }

    // Конвертируем подписку в формат для хранения
    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('p256dh')!)))),
        auth: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('auth')!))))
      },
      settings: getNotificationSettings()
    };

    // Сохраняем локально
    localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscriptionData));

    return subscriptionData;
  } catch (error) {
    console.error('Error subscribing to push:', error);
    return null;
  }
};

// Отписка от push-уведомлений
export const unsubscribeFromPush = async (): Promise<boolean> => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      localStorage.removeItem(SUBSCRIPTION_KEY);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error unsubscribing from push:', error);
    return false;
  }
};

// Получение сохранённой подписки
export const getSavedSubscription = (): PushSubscriptionData | null => {
  const saved = localStorage.getItem(SUBSCRIPTION_KEY);
  return saved ? JSON.parse(saved) : null;
};

// Сохранение настроек уведомлений
export const saveNotificationSettings = (settings: NotificationSettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

// Получение настроек уведомлений
export const getNotificationSettings = (): NotificationSettings => {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        enabled: Boolean(parsed.enabled),
      };
    } catch (error) {
      console.warn('Failed to parse notification settings, resetting to defaults', error);
    }
  }
  // Настройки по умолчанию
  return {
    enabled: false,
  };
};

// Тестовое уведомление
export const sendTestNotification = async (): Promise<void> => {
  try {
    console.log('Sending test notification...');
    console.log('Notification permission:', Notification.permission);

    if (Notification.permission !== 'granted') {
      throw new Error('Notification permission not granted');
    }

    // Используем только Service Worker API для совместимости с Android
    console.log('Waiting for Service Worker...');
    const registration = await navigator.serviceWorker.ready;

    console.log('Service Worker ready, showing notification...');

    // Android Chrome поддерживает vibrate, поэтому добавляем его
    const notificationOptions: NotificationOptions & { vibrate?: number[] } = {
      body: 'Тестовое уведомление работает! 🎉',
      icon: '/nastia-calendar/logo192.png',
      badge: '/nastia-calendar/logo192.png',
      tag: 'test-notification',
      requireInteraction: false,
      vibrate: [200, 100, 200]
    };

    await registration.showNotification('Nastia Calendar', notificationOptions);

    console.log('Test notification sent successfully');
  } catch (error) {
    console.error('Error sending test notification:', error);
    throw error;
  }
};
