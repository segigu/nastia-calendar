import React, { useState, useEffect } from 'react';
import { CloudSync, CloudSyncConfig } from '../utils/cloudSync';
import { Cloud, CloudOff, Settings, Check, X, AlertCircle } from 'lucide-react';
import styles from './CloudSettings.module.css';

interface CloudSettingsProps {
  cloudSync: CloudSync;
  onConfigChanged: () => void;
}

const CloudSettings: React.FC<CloudSettingsProps> = ({ cloudSync, onConfigChanged }) => {
  const [config, setConfig] = useState<CloudSyncConfig>(cloudSync.getConfig());
  const [showSettings, setShowSettings] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'success' | 'error'>('unknown');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    setConfig(cloudSync.getConfig());
  }, [cloudSync]);

  const handleSave = async () => {
    try {
      cloudSync.saveConfig(config);
      
      if (config.enabled && config.token) {
        setIsTestingConnection(true);
        const isConnected = await cloudSync.testConnection();
        setConnectionStatus(isConnected ? 'success' : 'error');
        setMessage(isConnected ? 'Подключение успешно!' : 'Ошибка подключения к GitHub');
      } else {
        setConnectionStatus('unknown');
        setMessage('Настройки сохранены');
      }
      
      onConfigChanged();
      
      if (config.enabled) {
        setTimeout(() => setShowSettings(false), 2000);
      }
    } catch (error) {
      setConnectionStatus('error');
      setMessage('Ошибка сохранения настроек');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const isConfigured = cloudSync.isConfigured();

  return (
    <div className={styles.cloudSettings}>
      <div className={styles.statusBar}>
        {isConfigured ? (
          <div className={styles.statusItem}>
            <Cloud size={16} className={styles.iconSuccess} />
            <span>Облачная синхронизация включена</span>
          </div>
        ) : (
          <div className={styles.statusItem}>
            <CloudOff size={16} className={styles.iconWarning} />
            <span>Только локальное хранение</span>
          </div>
        )}
        
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={styles.settingsButton}
        >
          <Settings size={16} />
        </button>
      </div>

      {showSettings && (
        <div className={styles.settingsPanel}>
          <h3 className={styles.title}>Настройки облачного хранения</h3>
          
          <div className={styles.helpText}>
            <AlertCircle size={16} />
            <div>
              <p>Данные будут храниться в GitHub репозитории <strong>nastia-data</strong></p>
              <p>Нужен Personal Access Token с правами на создание репозиториев</p>
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              />
              Включить облачную синхронизацию
            </label>
          </div>

          {config.enabled && (
            <div className={styles.inputGroup}>
              <label htmlFor="token">GitHub Token:</label>
              <input
                id="token"
                type="password"
                value={config.token}
                onChange={(e) => setConfig({ ...config, token: e.target.value })}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className={styles.tokenInput}
              />
            </div>
          )}

          <div className={styles.actions}>
            <button
              onClick={handleSave}
              disabled={isTestingConnection}
              className={`${styles.button} ${styles.primary}`}
            >
              {isTestingConnection ? 'Проверка...' : 'Сохранить'}
            </button>

            <button
              onClick={() => setShowSettings(false)}
              className={`${styles.button} ${styles.secondary}`}
            >
              Отмена
            </button>
          </div>

          {message && (
            <div className={`${styles.message} ${styles[connectionStatus]}`}>
              {connectionStatus === 'success' && <Check size={16} />}
              {connectionStatus === 'error' && <X size={16} />}
              <span>{message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CloudSettings;