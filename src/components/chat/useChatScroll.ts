import { useEffect, useCallback, useRef } from 'react';
import type { ChatPhase, ChatMessage } from '../../types/chat';

interface UseChatScrollOptions {
  /**
   * Все сообщения в чате.
   */
  messages: ChatMessage[];
  /**
   * Текущая фаза чата.
   */
  phase: ChatPhase;
  /**
   * Текущий номер дуги (Arc) истории.
   */
  currentArc?: number;
  /**
   * Флаг: есть ли кнопки выбора.
   */
  hasChoices?: boolean;
  /**
   * Флаг: показывается ли индикатор печати.
   */
  isTyping?: boolean;
  /**
   * Флаг: активна ли вкладка "Узнай себя".
   */
  isActive?: boolean;
}

/**
 * Вычисляет позицию скролла до конца страницы с учётом отступа на tab bar (80px).
 */
function getScrollToBottomPosition(): number {
  return document.documentElement.scrollHeight - window.innerHeight + 80;
}

/**
 * Выполняет плавный скролл к указанной позиции.
 * Использует тройной requestAnimationFrame для надёжности.
 */
function smoothScrollTo(position: number, behavior: ScrollBehavior = 'smooth') {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: position,
          behavior,
        });
      });
    });
  });
}

/**
 * Хук для централизованного управления автоскроллом чата.
 * Объединяет все правила скроллинга в одном месте.
 *
 * Правила скролла:
 * - dialogue: скролл вниз при новых сообщениях планет
 * - moon: скролл вниз при появлении сообщения Луны
 * - story (Arc 1 + ready): скролл к последнему сообщению Луны (с подсветкой)
 * - story (Arc 2+ + ready): скролл вниз к кнопкам
 * - choices: скролл при появлении кнопок
 * - finale: скролл вниз
 */
export function useChatScroll({
  messages,
  phase,
  currentArc = 1,
  hasChoices = false,
  isTyping = false,
  isActive = true,
}: UseChatScrollOptions) {
  const prevMessagesLengthRef = useRef(0);
  const prevPhaseRef = useRef<ChatPhase>('idle');
  const prevHasChoicesRef = useRef(false);

  /**
   * Скролл к последнему сообщению Луны (для Arc 1 в фазе ready).
   */
  const scrollToLastMoon = useCallback(() => {
    // Ждём задержку для гарантированного рендера кнопок
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const moonElements = document.querySelectorAll('[data-author="Луна"]');
            if (moonElements.length > 0) {
              const lastMoonEl = moonElements[moonElements.length - 1] as HTMLElement;
              const rect = lastMoonEl.getBoundingClientRect();
              const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
              const targetTop = scrollTop + rect.top - 120; // 120px отступ сверху

              console.log('[useChatScroll] Scrolling to MOON, targetTop:', targetTop);
              window.scrollTo({
                top: targetTop,
                behavior: 'smooth',
              });
            } else {
              console.log('[useChatScroll] No Moon elements found, scrolling to BOTTOM');
              smoothScrollTo(getScrollToBottomPosition());
            }
          });
        });
      });
    }, 1000); // Задержка 1000ms для гарантированного рендера кнопок
  }, []);

  /**
   * Скролл вниз к концу чата.
   */
  const scrollToBottom = useCallback((delay = 0) => {
    if (delay > 0) {
      setTimeout(() => {
        smoothScrollTo(getScrollToBottomPosition());
      }, delay);
    } else {
      smoothScrollTo(getScrollToBottomPosition());
    }
  }, []);

  // Автоскролл при изменении сообщений или фазы
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const messagesChanged = messages.length !== prevMessagesLengthRef.current;
    const phaseChanged = phase !== prevPhaseRef.current;
    const choicesAppeared = hasChoices && !prevHasChoicesRef.current;

    // Обновляем refs
    prevMessagesLengthRef.current = messages.length;
    prevPhaseRef.current = phase;
    prevHasChoicesRef.current = hasChoices;

    // Idle - ничего не делаем
    if (phase === 'idle') {
      return;
    }

    // Dialogue (генерация планетарных сообщений) - скролл вниз при новых сообщениях
    if (phase === 'dialogue') {
      if (messagesChanged || isTyping) {
        console.log('[useChatScroll] Phase: dialogue, scrolling to BOTTOM');
        scrollToBottom();
      }
      return;
    }

    // Moon (сообщение Луны после диалога) - скролл вниз
    if (phase === 'moon') {
      if (messagesChanged) {
        console.log('[useChatScroll] Phase: moon, scrolling to BOTTOM');
        scrollToBottom();
      }
      return;
    }

    // Story (показ истории) - зависит от Arc
    if (phase === 'story') {
      const isArc1 = currentArc === 1;

      // Arc 1 + кнопки появились → скролл к Луне
      if (isArc1 && choicesAppeared) {
        console.log('[useChatScroll] Phase: story, Arc 1, choices appeared → scrolling to MOON');
        scrollToLastMoon();
      }
      // Arc 2+ → скролл вниз
      else if (!isArc1 && (messagesChanged || choicesAppeared)) {
        console.log('[useChatScroll] Phase: story, Arc 2+, scrolling to BOTTOM');
        scrollToBottom(200);
      }
      return;
    }

    // Choices (ожидание выбора) - обычно уже проскроллено
    if (phase === 'choices') {
      // Ничего не делаем, скролл уже был выполнен в story
      return;
    }

    // Finale (финал истории) - скролл вниз
    if (phase === 'finale') {
      if (messagesChanged) {
        console.log('[useChatScroll] Phase: finale, scrolling to BOTTOM');
        scrollToBottom(300);
      }
      return;
    }
  }, [messages, phase, currentArc, hasChoices, isTyping, isActive, scrollToBottom, scrollToLastMoon]);

  return {
    scrollToBottom,
    scrollToLastMoon,
  };
}
