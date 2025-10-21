import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ChatPhase, ChatAuthor } from '../../types/chat';

interface UseChatMessagesReturn {
  /**
   * Все сообщения в чате.
   */
  messages: ChatMessage[];
  /**
   * Текущая фаза чата.
   */
  phase: ChatPhase;
  /**
   * Кто сейчас печатает (для индикатора "...").
   */
  typingAuthor: ChatAuthor | null;
  /**
   * Добавить сообщение в чат.
   */
  addMessage: (message: ChatMessage) => void;
  /**
   * Добавить несколько сообщений сразу.
   */
  addMessages: (messages: ChatMessage[]) => void;
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
   * Найти последнее сообщение от Луны (для скролла в Arc 1).
   */
  getLastMoonMessageIndex: () => number;
}

/**
 * Хук для управления сообщениями чата.
 * Централизованное хранилище сообщений, фаз и состояния печати.
 */
export function useChatMessages(): UseChatMessagesReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhaseState] = useState<ChatPhase>('idle');
  const [typingAuthor, setTypingAuthor] = useState<ChatAuthor | null>(null);

  // Refs для синхронного доступа в callback'ах
  const messagesRef = useRef<ChatMessage[]>([]);
  const phaseRef = useRef<ChatPhase>('idle');

  // Обновление refs при изменении state
  messagesRef.current = messages;
  phaseRef.current = phase;

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      const updated = [...prev, message];
      messagesRef.current = updated;
      return updated;
    });
  }, []);

  const addMessages = useCallback((newMessages: ChatMessage[]) => {
    if (newMessages.length === 0) {
      return;
    }
    setMessages((prev) => {
      const updated = [...prev, ...newMessages];
      messagesRef.current = updated;
      return updated;
    });
  }, []);

  const setTyping = useCallback((author: ChatAuthor | null) => {
    setTypingAuthor(author);
  }, []);

  const setPhase = useCallback((newPhase: ChatPhase) => {
    setPhaseState(newPhase);
    phaseRef.current = newPhase;
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setTypingAuthor(null);
    setPhaseState('idle');
    phaseRef.current = 'idle';
  }, []);

  const getLastMoonMessageIndex = useCallback(() => {
    const moonMessages = messages.filter((m) => m.type === 'moon');
    return messages.lastIndexOf(moonMessages[moonMessages.length - 1]);
  }, [messages]);

  return {
    messages,
    phase,
    typingAuthor,
    addMessage,
    addMessages,
    setTyping,
    setPhase,
    clearMessages,
    getLastMoonMessageIndex,
  };
}
