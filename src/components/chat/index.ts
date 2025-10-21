/**
 * Unified Chat Manager Module
 *
 * Централизованная система управления чатом для вкладки "Узнай себя".
 * Объединяет:
 * - Диалог планет
 * - Сообщения Луны
 * - Интерактивную историю
 * - Кнопки выбора и голосовые варианты
 * - Автоскролл
 */

export { ChatManager, type ChatManagerHandle } from './ChatManager';
export { ChatMessage } from './ChatMessage';
export { ChatChoices, type CustomOptionStatus } from './ChatChoices';
export { useChatMessages } from './useChatMessages';
export { useChatScroll } from './useChatScroll';
