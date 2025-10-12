import { NastiaData } from '../types';

// Конфигурация для GitHub хранилища
const GITHUB_CONFIG = {
  owner: 'segigu',
  repo: 'nastia-data', // Отдельный репозиторий для данных
  fileName: 'nastia-cycles.json',
  branch: 'main'
};

export interface CloudSyncConfig {
  token: string;
  enabled: boolean;
}

export class CloudSync {
  private config: CloudSyncConfig;
  
  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): CloudSyncConfig {
    const saved = localStorage.getItem('nastia-cloud-config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing cloud config:', e);
      }
    }
    // Проверяем есть ли токен в localStorage
    const savedToken = localStorage.getItem('nastia-github-token');
    if (savedToken) {
      return { token: savedToken, enabled: true };
    }
    return { token: '', enabled: false };
  }

  public saveConfig(config: CloudSyncConfig): void {
    this.config = config;
    localStorage.setItem('nastia-cloud-config', JSON.stringify(config));
  }

  public getConfig(): CloudSyncConfig {
    return { ...this.config };
  }

  public isConfigured(): boolean {
    return this.config.enabled && this.config.token.length > 0;
  }

  // Загрузка данных из GitHub
  public async downloadFromCloud(): Promise<NastiaData | null> {
    if (!this.isConfigured()) {
      throw new Error('Cloud sync not configured');
    }

    try {
      const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.fileName}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `token ${this.config.token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (response.status === 404) {
        // Файл не существует, возвращаем пустые данные
        return ensureNastiaData(null);
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`GitHub API error: ${error.message || 'Unknown error'}`);
      }

      const fileData = await response.json();
      const decoded = decodeBase64Unicode(fileData.content.replace(/\n/g, ''));
      return ensureNastiaData(JSON.parse(decoded));

    } catch (error) {
      console.error('Error downloading from cloud:', error);
      throw error;
    }
  }

  // Сохранение данных в GitHub
  public async uploadToCloud(data: NastiaData): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Cloud sync not configured');
    }

    try {
      const payload: NastiaData = {
        ...data,
        horoscopeMemory: data.horoscopeMemory ?? [],
      };
      const content = JSON.stringify(payload, null, 2);
      const encodedContent = encodeBase64Unicode(content);
      
      // Получаем SHA существующего файла (если есть)
      let sha = '';
      try {
        const getUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.fileName}`;
        const getResponse = await fetch(getUrl, {
          headers: {
            'Authorization': `token ${this.config.token}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        });
        
        if (getResponse.ok) {
          const fileData = await getResponse.json();
          sha = fileData.sha;
        }
      } catch (e) {
        // Файл не существует, создаем новый
      }

      const putUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.fileName}`;
      const requestBody = {
        message: `Update Nastia data - ${new Date().toISOString()}`,
        content: encodedContent,
        branch: GITHUB_CONFIG.branch,
        ...(sha && { sha }),
      };

      const response = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.config.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`GitHub API error: ${error.message || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('Error uploading to cloud:', error);
      throw error;
    }
  }

  // Проверка подключения
  public async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`, {
        headers: {
          'Authorization': `token ${this.config.token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

export const cloudSync = new CloudSync();

function ensureNastiaData(raw: any): NastiaData {
  const defaultSettings = {
    averageCycleLength: 28,
    periodLength: 5,
    notifications: true,
  };

  if (!raw || typeof raw !== 'object') {
    return {
      cycles: [],
      settings: defaultSettings,
      horoscopeMemory: [],
    };
  }

  const settings = {
    averageCycleLength: typeof raw?.settings?.averageCycleLength === 'number'
      ? raw.settings.averageCycleLength
      : defaultSettings.averageCycleLength,
    periodLength: typeof raw?.settings?.periodLength === 'number'
      ? raw.settings.periodLength
      : defaultSettings.periodLength,
    notifications: typeof raw?.settings?.notifications === 'boolean'
      ? raw.settings.notifications
      : defaultSettings.notifications,
  };

  const cycles = Array.isArray(raw.cycles) ? raw.cycles : [];
  const horoscopeMemory = Array.isArray(raw.horoscopeMemory) ? raw.horoscopeMemory : [];

  return {
    cycles,
    settings,
    horoscopeMemory,
  };
}

function encodeBase64Unicode(value: string): string {
  if (typeof TextEncoder !== 'undefined') {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(value);
    let binary = '';
    const chunkSize = 0x8000; // avoid call stack limits
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      let chunkString = '';
      for (let j = 0; j < chunk.length; j += 1) {
        chunkString += String.fromCharCode(chunk[j]!);
      }
      binary += chunkString;
    }
    return btoa(binary);
  }

  // Fallback для окружений без TextEncoder
  return btoa(unescape(encodeURIComponent(value)));
}

function decodeBase64Unicode(value: string): string {
  const clean = value.replace(/\s/g, '');
  const binary = atob(clean);

  if (typeof TextDecoder !== 'undefined') {
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  // Fallback
  return decodeURIComponent(escape(binary));
}
