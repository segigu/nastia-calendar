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
        return {
          cycles: [],
          settings: {
            averageCycleLength: 28,
            periodLength: 5,
            notifications: true,
          },
        };
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`GitHub API error: ${error.message || 'Unknown error'}`);
      }

      const fileData = await response.json();
      const content = atob(fileData.content.replace(/\n/g, ''));
      return JSON.parse(content);

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
      const content = JSON.stringify(data, null, 2);
      const encodedContent = btoa(content);
      
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