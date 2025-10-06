// Утилиты для работы с push-уведомлениями

// Public VAPID key
// Это публичный ключ, можно хранить в коде
const VAPID_PUBLIC_KEY = 'BHL7bn7IEcJOy7unRivuOE-6e-svZMQQ_WMt5rTm7Ae86p4RN9BlTOqgeEWrvpiBJqwqcAGKUGNs2DXqybIhIv0';

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
  daysBeforePeriod: number;
  daysBeforeOvulation: number;
  dailyReminder: boolean;
}

const SETTINGS_KEY = 'nastia-notification-settings';
const SUBSCRIPTION_KEY = 'nastia-push-subscription';

// Регистрация Service Worker
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/nastia-calendar/service-worker.js');
      console.log('Service Worker registered:', registration);
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
        applicationServerKey: convertedVapidKey
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
    return JSON.parse(saved);
  }
  // Настройки по умолчанию
  return {
    enabled: false,
    daysBeforePeriod: 1,
    daysBeforeOvulation: 1,
    dailyReminder: false
  };
};

// Тестовое уведомление
export const sendTestNotification = async (): Promise<void> => {
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('Nastia Calendar', {
    body: 'Тестовое уведомление работает! 🎉',
    icon: '/nastia-calendar/logo192.png',
    badge: '/nastia-calendar/favicon.ico',
    vibrate: [200, 100, 200],
    tag: 'test-notification'
  });
};
