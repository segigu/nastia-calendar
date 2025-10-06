import { PushSubscriptionData } from './pushNotifications';

const GITHUB_REPO = 'nastia-data';
const SUBSCRIPTIONS_FILE = 'subscriptions.json';

interface SubscriptionsData {
  subscriptions: PushSubscriptionData[];
  lastUpdated: string;
}

// Получить все подписки из репозитория
export const fetchSubscriptions = async (token: string): Promise<SubscriptionsData> => {
  try {
    const username = await getGithubUsername(token);
    const url = `https://api.github.com/repos/${username}/${GITHUB_REPO}/contents/${SUBSCRIPTIONS_FILE}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (response.status === 404) {
      // Файл не существует - возвращаем пустой массив
      return { subscriptions: [], lastUpdated: new Date().toISOString() };
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch subscriptions: ${response.statusText}`);
    }

    const data = await response.json();
    const content = atob(data.content);
    return JSON.parse(content);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return { subscriptions: [], lastUpdated: new Date().toISOString() };
  }
};

// Сохранить подписку в репозиторий
export const saveSubscription = async (
  token: string,
  subscription: PushSubscriptionData
): Promise<boolean> => {
  try {
    const username = await getGithubUsername(token);
    const url = `https://api.github.com/repos/${username}/${GITHUB_REPO}/contents/${SUBSCRIPTIONS_FILE}`;

    // Получаем текущие подписки
    const currentData = await fetchSubscriptions(token);

    // Проверяем, есть ли уже такая подписка (по endpoint)
    const existingIndex = currentData.subscriptions.findIndex(
      sub => sub.endpoint === subscription.endpoint
    );

    if (existingIndex !== -1) {
      // Обновляем существующую подписку
      currentData.subscriptions[existingIndex] = subscription;
    } else {
      // Добавляем новую подписку
      currentData.subscriptions.push(subscription);
    }

    currentData.lastUpdated = new Date().toISOString();

    // Получаем SHA файла (если файл существует)
    let sha: string | undefined;
    try {
      const fileResponse = await fetch(url, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      if (fileResponse.ok) {
        const fileData = await fileResponse.json();
        sha = fileData.sha;
      }
    } catch (error) {
      // Файл не существует - это нормально для первого сохранения
    }

    // Сохраняем обновленные данные
    const content = btoa(JSON.stringify(currentData, null, 2));
    const body: any = {
      message: `Update push subscription ${subscription.endpoint.slice(-20)}`,
      content,
    };
    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return response.ok;
  } catch (error) {
    console.error('Error saving subscription:', error);
    return false;
  }
};

// Удалить подписку из репозитория
export const removeSubscription = async (
  token: string,
  endpoint: string
): Promise<boolean> => {
  try {
    const username = await getGithubUsername(token);
    const url = `https://api.github.com/repos/${username}/${GITHUB_REPO}/contents/${SUBSCRIPTIONS_FILE}`;

    // Получаем текущие подписки
    const currentData = await fetchSubscriptions(token);

    // Удаляем подписку
    currentData.subscriptions = currentData.subscriptions.filter(
      sub => sub.endpoint !== endpoint
    );
    currentData.lastUpdated = new Date().toISOString();

    // Получаем SHA файла
    const fileResponse = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (!fileResponse.ok) {
      return false;
    }
    const fileData = await fileResponse.json();

    // Сохраняем обновленные данные
    const content = btoa(JSON.stringify(currentData, null, 2));
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Remove push subscription ${endpoint.slice(-20)}`,
        content,
        sha: fileData.sha,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Error removing subscription:', error);
    return false;
  }
};

// Вспомогательная функция для получения имени пользователя GitHub
async function getGithubUsername(token: string): Promise<string> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get GitHub username');
  }

  const data = await response.json();
  return data.login;
}
