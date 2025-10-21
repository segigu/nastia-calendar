import React from 'react';
import { motion } from 'framer-motion';
import { Mic, Square, Loader2, RotateCcw } from 'lucide-react';
import type { HistoryStoryOption } from '../../utils/historyStory';
import styles from '../NastiaApp.module.css';

export type CustomOptionStatus =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'generating'
  | 'ready'
  | 'error';

interface ChatChoicesProps {
  /**
   * Список опций для выбора (AI-generated).
   */
  options: HistoryStoryOption[];
  /**
   * Callback при выборе обычной опции.
   */
  onOptionSelect: (option: HistoryStoryOption) => void;
  /**
   * Callback при клике на кнопку "Свой вариант".
   */
  onCustomOptionClick: () => void;
  /**
   * Состояние кнопки "Свой вариант".
   */
  customOptionStatus?: CustomOptionStatus;
  /**
   * Готовая кастомная опция (когда status === 'ready').
   */
  customOption?: HistoryStoryOption;
  /**
   * Уровень записи для анимации пульсации (0-1).
   */
  recordingLevel?: number;
  /**
   * Количество видимых кнопок (для последовательной анимации появления).
   */
  visibleCount?: number;
  /**
   * Флаг анимации скрытия (для анимации fadeOut).
   */
  hiding?: boolean;
  /**
   * Флаг отключения кнопок (когда идёт загрузка).
   */
  disabled?: boolean;
  /**
   * Показывать ли кнопку "Свой вариант" (по умолчанию true для обратной совместимости).
   */
  showCustomButton?: boolean;
}

/**
 * Компонент для рендеринга кнопок выбора и голосового варианта.
 */
export const ChatChoices: React.FC<ChatChoicesProps> = ({
  options,
  onOptionSelect,
  onCustomOptionClick,
  customOptionStatus = 'idle',
  customOption,
  recordingLevel = 0,
  visibleCount = 0,
  hiding = false,
  disabled = false,
  showCustomButton = true, // По умолчанию показываем для обратной совместимости
}) => {
  const showCustomOption = showCustomButton && options.length > 0;
  const isCustomProcessing = customOptionStatus === 'transcribing' || customOptionStatus === 'generating';
  const showLiveRecordingDot = customOptionStatus === 'recording';

  // Определяем CSS классы для кастомной кнопки
  const getCustomButtonClass = (): string => {
    const baseClass = styles.historyCustomButton;
    switch (customOptionStatus) {
      case 'recording':
        return `${baseClass} ${styles.historyCustomButtonRecording}`;
      case 'transcribing':
      case 'generating':
        return `${baseClass} ${styles.historyCustomButtonProcessing}`;
      case 'ready':
        return `${baseClass} ${styles.historyCustomButtonReady}`;
      case 'error':
        return `${baseClass} ${styles.historyCustomButtonError}`;
      default:
        return `${baseClass} ${styles.historyCustomButtonIdle}`;
    }
  };

  // Определяем текст для кастомной кнопки
  const getCustomButtonContent = () => {
    switch (customOptionStatus) {
      case 'recording':
        return {
          title: 'Идёт запись…',
          description: 'Нажмите, чтобы остановить',
        };
      case 'transcribing':
        return {
          title: 'Обрабатываем запись…',
          description: 'Перевожу голос в текст.',
        };
      case 'generating':
        return {
          title: 'Придумываем формулировку…',
          description: 'Собираю заголовок и описание из твоих слов.',
        };
      case 'ready':
        return {
          title: customOption?.title ?? 'Свой вариант',
          description: customOption?.description ?? 'Проверь, всё ли звучит, как тебе хочется.',
        };
      case 'error':
        return {
          title: 'Не удалось распознать',
          description: 'Попробуем записать снова?',
        };
      default:
        return {
          title: 'Свой вариант',
          description: 'Продиктуй, как бы ты продолжила историю.',
        };
    }
  };

  // Определяем иконку для кастомной кнопки
  const getCustomButtonIcon = (): React.ReactNode => {
    switch (customOptionStatus) {
      case 'idle':
        return <Mic size={18} strokeWidth={2.2} />;
      case 'recording':
        return <Square size={12} strokeWidth={2.5} fill="white" />;
      case 'transcribing':
      case 'generating':
        return <Loader2 size={18} className={styles.historyCustomLoaderIcon} strokeWidth={2.4} />;
      case 'ready':
        return <RotateCcw size={20} strokeWidth={2} />;
      case 'error':
        return <RotateCcw size={18} strokeWidth={2.4} />;
      default:
        return <Mic size={18} strokeWidth={2.2} />;
    }
  };

  const customContent = getCustomButtonContent();
  const customButtonClass = getCustomButtonClass();

  return (
    <div className={`${styles.historyChatReplies} ${hiding ? styles.historyChatRepliesHiding : ''}`}>
      {/* AI-generated опции */}
      {options.map((option, index) => {
        const accentClass = index === 0 ? styles.historyChatReplyPrimary : styles.historyChatReplyAlt;
        const isVisible = index < visibleCount;

        return (
          <div
            key={option.id}
            className={`${styles.historyChatReplyItem} ${isVisible ? styles.visible : ''}`}
          >
            <button
              type="button"
              className={`${styles.historyChatReplyButton} ${accentClass}`}
              onClick={() => onOptionSelect(option)}
              disabled={disabled}
            >
              <span className={styles.historyChatReplyTitle}>{option.title}</span>
              <span className={styles.historyChatReplyDescription}>{option.description}</span>
            </button>
          </div>
        );
      })}

      {/* Кнопка "Свой вариант" */}
      {showCustomOption && (
        <div
          key="custom-history-option"
          className={`${styles.historyChatReplyItem} ${visibleCount > options.length ? styles.visible : ''}`}
        >
          <motion.button
            type="button"
            className={customButtonClass}
            onClick={onCustomOptionClick}
            disabled={disabled || isCustomProcessing}
            aria-label={customContent.title}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className={styles.historyCustomButtonLayout}>
              <div className={styles.historyCustomButtonTexts}>
                <span className={`${styles.historyChatReplyTitle} ${styles.historyCustomTitle}`}>
                  {showLiveRecordingDot && (
                    <span className={styles.historyCustomLiveDot} aria-hidden="true" />
                  )}
                  {customContent.title}
                </span>
                <span className={`${styles.historyChatReplyDescription} ${styles.historyCustomDescription}`}>
                  {customContent.description}
                </span>
              </div>
              {/* Иконка с анимацией */}
              {customOptionStatus === 'recording' ? (
                <div className={styles.historyCustomRecordingPulseWrapper}>
                  <div
                    className={`${styles.historyCustomRecordingPulse} ${styles.historyCustomRecordingPulse1}`}
                    style={{
                      transform: `scale(${1 + recordingLevel * 1.2})`,
                      opacity: 0.3 + recordingLevel * 0.4,
                      transition: 'transform 0.2s ease-out, opacity 0.2s ease-out',
                    }}
                  />
                  <div
                    className={`${styles.historyCustomRecordingPulse} ${styles.historyCustomRecordingPulse2}`}
                    style={{
                      transform: `scale(${1 + recordingLevel * 1.8})`,
                      opacity: 0.2 + recordingLevel * 0.3,
                      transition: 'transform 0.25s ease-out, opacity 0.25s ease-out',
                    }}
                  />
                  <div
                    className={`${styles.historyCustomIconCircle} ${styles.historyCustomIconRecording}`}
                    style={{
                      transform: `scale(${1 + recordingLevel * 0.15})`,
                      transition: 'transform 0.2s ease-out',
                    }}
                  >
                    {getCustomButtonIcon()}
                  </div>
                </div>
              ) : customOptionStatus === 'ready' ? (
                <motion.div
                  className={`${styles.historyCustomIconCircle} ${styles.historyCustomIconReady}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCustomOptionClick(); // Позволяет перезаписать
                  }}
                  style={{ cursor: 'pointer' }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {getCustomButtonIcon()}
                </motion.div>
              ) : (
                <div
                  className={`${styles.historyCustomIconCircle} ${
                    customOptionStatus === 'error'
                      ? styles.historyCustomIconError
                      : customOptionStatus === 'transcribing' || customOptionStatus === 'generating'
                        ? styles.historyCustomIconProcessing
                        : styles.historyCustomIconIdle
                  }`}
                >
                  {getCustomButtonIcon()}
                </div>
              )}
            </div>
          </motion.button>
        </div>
      )}
    </div>
  );
};
