import React, { forwardRef, useImperativeHandle, useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage as ChatMessageType, ChatPhase, ChatAuthor } from '../../types/chat';
import type { HistoryStoryOption } from '../../utils/historyStory';
import { ChatMessage } from './ChatMessage';
import { ChatChoices, type CustomOptionStatus } from './ChatChoices';
import { useChatMessages } from './useChatMessages';
import { useChatScroll } from './useChatScroll';
import styles from '../NastiaApp.module.css';

interface ChatManagerProps {
  /**
   * Callback при выборе обычной опции.
   */
  onChoiceSelect: (choice: HistoryStoryOption) => void;
  /**
   * Callback при клике на кнопку "Свой вариант".
   */
  onCustomOptionClick: () => void;
  /**
   * Callback когда сообщения изменились (для автоскролла в песочнице).
   */
  onMessagesChange?: () => void;
  /**
   * Флаг активности вкладки (для автоскролла).
   */
  isActive?: boolean;
  /**
   * Название истории (для отображения в Story сообщениях).
   */
  storyTitle?: string;
  /**
   * Текущий custom option (для реактивного обновления кнопки).
   */
  customOption?: HistoryStoryOption;
  /**
   * Статус custom option (для реактивного обновления кнопки).
   */
  customStatus?: CustomOptionStatus;
  /**
   * Уровень записи (0-1) для визуализации.
   */
  recordingLevel?: number;
}

export interface ChatManagerHandle {
  /**
   * Добавить одно сообщение в чат.
   */
  addMessage: (message: ChatMessageType) => void;
  /**
   * Добавить несколько сообщений сразу.
   */
  addMessages: (messages: ChatMessageType[]) => void;
  /**
   * Установить индикатор печати.
   */
  setTyping: (author: ChatAuthor | null) => void;
  /**
   * Сменить фазу чата.
   */
  setPhase: (phase: ChatPhase) => void;
  /**
   * Очистить все сообщения и вернуть в idle.
   */
  clearMessages: () => void;
  /**
   * Установить варианты выбора (кнопки).
   */
  setChoices: (
    choices: HistoryStoryOption[],
    customOption?: HistoryStoryOption,
    customStatus?: CustomOptionStatus,
    recordingLevel?: number,
    showCustomButton?: boolean
  ) => void;
  /**
   * Скрыть кнопки выбора (с анимацией fadeOut).
   */
  hideChoices: () => void;
  /**
   * Получить текущую фазу.
   */
  getPhase: () => ChatPhase;
  /**
   * Получить все сообщения.
   */
  getMessages: () => ChatMessageType[];
  /**
   * Получить текущий Arc (из последнего Story сообщения).
   */
  getCurrentArc: () => number;
}

/**
 * Главный компонент управления чатом.
 * Централизует всю логику сообщений, скроллинга, кнопок выбора.
 */
export const ChatManager = forwardRef<ChatManagerHandle, ChatManagerProps>(
  ({
    onChoiceSelect,
    onCustomOptionClick,
    onMessagesChange,
    isActive = true,
    storyTitle = 'История',
    customOption: customOptionProp,
    customStatus: customStatusProp = 'idle',
    recordingLevel: recordingLevelProp = 0,
  }, ref) => {
    const chat = useChatMessages();
    const [choices, setChoicesState] = useState<HistoryStoryOption[]>([]);
    const [showCustomButtonState, setShowCustomButtonState] = useState(true); // По умолчанию показываем
    const [visibleButtonsCount, setVisibleButtonsCount] = useState(0);
    const [choicesHiding, setChoicesHiding] = useState(false);
    const [highlightedMessageIndex, setHighlightedMessageIndex] = useState(-1);

    const buttonAnimationTimeoutsRef = useRef<number[]>([]);

    // Вычисляем текущий Arc из последнего Story сообщения
    const currentArc = chat.messages
      .filter((m) => m.type === 'story' || m.type === 'finale')
      .map((m) => (m.type === 'story' || m.type === 'finale' ? m.arcNumber : undefined))
      .filter((arc): arc is number => arc !== undefined)
      .pop() ?? 1;

    // Автоскролл
    useChatScroll({
      messages: chat.messages,
      phase: chat.phase,
      currentArc,
      hasChoices: choices.length > 0,
      isTyping: chat.typingAuthor !== null,
      isActive,
    });

    // Очистка таймеров кнопок
    const clearButtonAnimationTimers = useCallback(() => {
      buttonAnimationTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      buttonAnimationTimeoutsRef.current = [];
    }, []);

    // Последовательное появление кнопок
    useEffect(() => {
      if (choices.length === 0) {
        setVisibleButtonsCount(0);
        return;
      }

      if (chat.typingAuthor !== null || choicesHiding) {
        return;
      }

      clearButtonAnimationTimers();

      const isArc1 = currentArc === 1;
      const totalButtons = choices.length + 1; // +1 для кастомной кнопки
      const delayBetweenButtons = 500;

      for (let i = 0; i < totalButtons; i++) {
        const timeoutId = window.setTimeout(() => {
          setVisibleButtonsCount(i + 1);

          // Уведомляем родителя о появлении кнопки (для автоскролла в песочнице)
          if (onMessagesChange) {
            onMessagesChange();
          }

          // Arc 2+: скроллим вниз при появлении каждой кнопки (для основного приложения)
          // (для Arc 1 скролл происходит в useChatScroll к Луне)
          if (!isArc1) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  window.scrollTo({
                    top: document.documentElement.scrollHeight - window.innerHeight + 80,
                    behavior: 'smooth',
                  });
                });
              });
            });
          }
        }, delayBetweenButtons * (i + 1));

        buttonAnimationTimeoutsRef.current.push(timeoutId);
      }

      return () => {
        clearButtonAnimationTimers();
      };
    }, [choices, chat.typingAuthor, choicesHiding, currentArc, clearButtonAnimationTimers]);

    // Уведомляем родителя об изменении сообщений И индикатора печати (для автоскролла)
    useEffect(() => {
      if (onMessagesChange) {
        onMessagesChange();
      }
    }, [chat.messages.length, chat.typingAuthor, onMessagesChange]);

    // Imperative API для родительского компонента
    useImperativeHandle(
      ref,
      () => ({
        addMessage: chat.addMessage,
        addMessages: chat.addMessages,
        setTyping: chat.setTyping,
        setPhase: chat.setPhase,
        clearMessages: () => {
          chat.clearMessages();
          setChoicesState([]);
          // customOption/customStatus/recordingLevel now controlled by props
          setVisibleButtonsCount(0);
          setChoicesHiding(false);
          setHighlightedMessageIndex(-1);
          clearButtonAnimationTimers();
        },
        setChoices: (newChoices, newCustomOption, newCustomStatus, newRecordingLevel, showCustomButton) => {
          setChoicesState(newChoices);
          // customOption/customStatus/recordingLevel now controlled by props, ignore parameters
          setShowCustomButtonState(showCustomButton ?? true); // По умолчанию показываем
          setVisibleButtonsCount(0);
          setChoicesHiding(false);
        },
        hideChoices: () => {
          setChoicesHiding(true);
          setTimeout(() => {
            setChoicesState([]);
            setVisibleButtonsCount(0);
            setChoicesHiding(false);
          }, 500); // Длительность анимации fadeOut
        },
        getPhase: () => chat.phase,
        getMessages: () => chat.messages,
        getCurrentArc: () => currentArc,
      }),
      [chat, currentArc, clearButtonAnimationTimers]
    );

    return (
      <div
        className={`${styles.historyChatMessages} ${
          chat.phase !== 'story' ? styles.calendarElementAnimated : ''
        } ${
          chat.phase === 'dialogue' ||
          chat.phase === 'moon' ||
          chat.phase === 'story' ||
          chat.phase === 'choices' ||
          chat.phase === 'finale'
            ? styles.calendarElementVisible
            : ''
        }`}
      >
        {/* Рендеринг всех сообщений */}
        {chat.phase !== 'idle' &&
          chat.messages.map((msg, index) => {
            // Для Луны определяем подсветку (только для moon типа)
            const shouldHighlight =
              msg.type === 'moon' && index === highlightedMessageIndex;

            return (
              <ChatMessage
                key={msg.id}
                message={msg}
                highlighted={shouldHighlight}
                storyTitle={storyTitle}
              />
            );
          })}

        {/* Индикатор печати (только для планет и Луны, НЕ для Истории) */}
        {(chat.phase === 'dialogue' || chat.phase === 'moon') &&
          chat.typingAuthor &&
          chat.typingAuthor !== 'История' && (
            <div
              className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${styles.planetMessage} ${styles.visible}`}
            >
              <div className={styles.historyChatSender}>{chat.typingAuthor}</div>
              <div className={styles.historyChatTyping}>
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

        {/* Индикатор печати для самой истории (только в фазе story) */}
        {chat.phase === 'story' && chat.typingAuthor === 'История' && (
          <div className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${styles.visible}`}>
            <div className={styles.historyChatStoryTitle}>{storyTitle}</div>
            <div className={styles.historyChatTyping}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {/* Кнопки выбора */}
        {!chat.typingAuthor && choices.length > 0 && (
          <ChatChoices
            options={choices}
            onOptionSelect={onChoiceSelect}
            onCustomOptionClick={onCustomOptionClick}
            customOption={customOptionProp}
            customOptionStatus={customStatusProp}
            recordingLevel={recordingLevelProp}
            visibleCount={visibleButtonsCount}
            hiding={choicesHiding}
            disabled={chat.typingAuthor !== null}
            showCustomButton={showCustomButtonState}
          />
        )}
      </div>
    );
  }
);

ChatManager.displayName = 'ChatManager';
