import React from 'react';
import type { ChatMessage as ChatMessageType } from '../../types/chat';
import styles from '../NastiaApp.module.css';

interface ChatMessageProps {
  message: ChatMessageType;
  highlighted?: boolean;
  storyTitle?: string;
}

/**
 * Универсальный компонент для рендеринга всех типов сообщений в чате.
 * Поддерживает: planet, moon, story, finale, system.
 */
export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  highlighted = false,
  storyTitle = 'История',
}) => {
  // Системное сообщение (подключение планет и т.д.)
  if (message.type === 'system') {
    return (
      <div className={`${styles.historyChatSystem} ${styles.visible}`}>
        <span className={styles.historyChatSystemPlanet}>{message.author}</span> {message.content}
      </div>
    );
  }

  // Обычные сообщения от планет, Луны, Истории
  if (message.type === 'planet' || message.type === 'moon') {
    const isPlanet = message.type === 'planet';
    const isMoon = message.type === 'moon';
    const bubbleClasses = [
      styles.historyChatBubble,
      styles.historyChatIncoming,
      isPlanet ? styles.planetMessage : styles.historyMessage,
      styles.visible,
      highlighted && isMoon ? styles.historyMessageHighlight : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        className={bubbleClasses}
        data-author={isMoon ? 'Луна' : undefined}
      >
        <div className={styles.historyChatSender}>{message.author}</div>
        <div className={styles.historyChatContent}>{message.content}</div>
        <div className={styles.historyChatTime}>{message.time}</div>
      </div>
    );
  }

  // Сообщения истории (story, finale)
  if (message.type === 'story' || message.type === 'finale') {
    const displayTitle = message.type === 'finale' ? 'Развязка' : storyTitle;

    return (
      <div className={`${styles.historyChatBubble} ${styles.historyChatIncoming} ${styles.visible}`}>
        <div className={styles.historyChatStoryTitle}>{displayTitle}</div>
        <div className={styles.historyChatMessageWrapper}>
          <div className={styles.historyChatTextBlock}>
            <div className={styles.historyChatContent}>
              <div className={styles.historyChatScene}>{message.content}</div>
              <div className={styles.historyChatTime}>{message.time}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Сообщение от пользователя (Настя)
  if (message.type === 'user') {
    return (
      <div className={`${styles.historyChatBubble} ${styles.historyChatOutgoing} ${styles.visible}`}>
        <div className={styles.historyChatSender}>Настя</div>
        <div className={styles.historyChatContent}>{message.content}</div>
        <div className={styles.historyChatTime}>{message.time}</div>
      </div>
    );
  }

  // Сообщение с вариантами выбора (ChoicesMessage) рендерится через ChatChoices
  // здесь его НЕ рендерим
  return null;
};
