/**
 * Unified Chat System Types
 *
 * Единая система управления чатом для вкладки "Узнай себя"
 * Объединяет диалог планет, сообщения Луны и интерактивную историю
 */

import { HistoryStoryOption } from '../utils/historyStory';

/**
 * Тип автора сообщения
 */
export type ChatAuthor =
  | 'Меркурий'
  | 'Венера'
  | 'Марс'
  | 'Юпитер'
  | 'Сатурн'
  | 'Уран'
  | 'Нептун'
  | 'Плутон'
  | 'Луна'
  | 'История'
  | 'system';

/**
 * Тип сообщения в чате
 */
export type ChatMessageType =
  | 'planet'      // Сообщение от планеты
  | 'moon'        // Сообщение от Луны (введение к истории)
  | 'story'       // Сообщение истории
  | 'finale'      // Финальное сообщение истории
  | 'choices'     // Варианты выбора (кнопки)
  | 'system';     // Системное сообщение

/**
 * Базовый интерфейс сообщения
 */
interface BaseChatMessage {
  id: string;
  author: ChatAuthor;
  time: string;
  type: ChatMessageType;
}

/**
 * Сообщение от планеты
 */
export interface PlanetMessage extends BaseChatMessage {
  type: 'planet';
  author: Exclude<ChatAuthor, 'История' | 'system'>;
  content: string;
}

/**
 * Сообщение от Луны (moon_summary перед историей)
 */
export interface MoonMessage extends BaseChatMessage {
  type: 'moon';
  author: 'Луна';
  content: string;
}

/**
 * Сообщение истории
 */
export interface StoryMessage extends BaseChatMessage {
  type: 'story' | 'finale';
  author: 'История';
  content: string;
  arcNumber?: number;
  stageLabel?: string;
}

/**
 * Варианты выбора (кнопки)
 */
export interface ChoicesMessage extends BaseChatMessage {
  type: 'choices';
  author: 'История';
  content: ''; // Пустое содержимое, только кнопки
  choices: HistoryStoryOption[];
  arcNumber: number;
}

/**
 * Системное сообщение
 */
export interface SystemMessage extends BaseChatMessage {
  type: 'system';
  author: 'system';
  content: string;
}

/**
 * Любое сообщение в чате
 */
export type ChatMessage =
  | PlanetMessage
  | MoonMessage
  | StoryMessage
  | ChoicesMessage
  | SystemMessage;

/**
 * Состояние чата
 */
export type ChatPhase =
  | 'idle'        // Пусто, ожидание начала
  | 'dialogue'    // Идет диалог планет
  | 'moon'        // Показывается сообщение Луны
  | 'story'       // Показывается история
  | 'choices'     // Ждем выбора пользователя
  | 'finale';     // Показывается финал

/**
 * Правила автоскролла для разных фаз
 */
export interface AutoScrollRule {
  phase: ChatPhase;
  scrollTo: 'bottom' | 'last-moon' | 'last-story' | 'choices';
}

/**
 * Правила автоскролла
 */
export const AUTO_SCROLL_RULES: AutoScrollRule[] = [
  { phase: 'idle', scrollTo: 'bottom' },
  { phase: 'dialogue', scrollTo: 'bottom' },
  { phase: 'moon', scrollTo: 'bottom' },
  { phase: 'story', scrollTo: 'bottom' },
  { phase: 'choices', scrollTo: 'last-moon' }, // Arc 1: скролл к Луне, Arc 2+: скролл вниз (будет учтено в логике)
  { phase: 'finale', scrollTo: 'bottom' },
];
