/**
 * discoverTabStorage.ts
 *
 * Утилиты для сохранения и загрузки состояния вкладки "Узнай себя" (Discover Tab)
 */

import type { DiscoverTabState } from '../types';

const STORAGE_KEY = 'nastia-discover-tab-state';

/**
 * Создает пустое состояние Discover Tab
 */
export function createEmptyDiscoverTabState(): DiscoverTabState {
  return {
    isStarted: false,
    phase: null,
    messages: [],
    storyMeta: null,
    currentArc: 1,
    storySegments: [],
    choices: [],
    finaleInterpretations: null,
    finaleInterpretationMode: 'human',
    hasUnreadChoices: false,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Сохраняет состояние Discover Tab в localStorage
 */
export function saveDiscoverTabState(state: DiscoverTabState): void {
  try {
    const stateToSave: DiscoverTabState = {
      ...state,
      lastUpdated: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    console.log('[DiscoverTabStorage] State saved successfully', {
      isStarted: stateToSave.isStarted,
      phase: stateToSave.phase,
      messagesCount: stateToSave.messages.length,
      choicesCount: stateToSave.choices.length,
      hasUnreadChoices: stateToSave.hasUnreadChoices,
    });
  } catch (error) {
    console.error('[DiscoverTabStorage] Failed to save state:', error);
  }
}

/**
 * Загружает состояние Discover Tab из localStorage
 */
export function loadDiscoverTabState(): DiscoverTabState | null {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      console.log('[DiscoverTabStorage] No saved state found');
      return null;
    }

    const state = JSON.parse(serialized) as DiscoverTabState;

    console.log('[DiscoverTabStorage] State loaded successfully', {
      isStarted: state.isStarted,
      phase: state.phase,
      messagesCount: state.messages?.length || 0,
      choicesCount: state.choices?.length || 0,
      hasUnreadChoices: state.hasUnreadChoices,
      lastUpdated: state.lastUpdated,
    });

    // Валидация загруженного состояния
    if (!validateDiscoverTabState(state)) {
      console.warn('[DiscoverTabStorage] Invalid state structure, returning null');
      return null;
    }

    return state;
  } catch (error) {
    console.error('[DiscoverTabStorage] Failed to load state:', error);
    return null;
  }
}

/**
 * Очищает сохраненное состояние Discover Tab
 */
export function clearDiscoverTabState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[DiscoverTabStorage] State cleared');
  } catch (error) {
    console.error('[DiscoverTabStorage] Failed to clear state:', error);
  }
}

/**
 * Проверяет, есть ли сохраненное состояние с активной историей
 */
export function hasActiveStory(): boolean {
  const state = loadDiscoverTabState();
  return state?.isStarted === true && state.phase !== null;
}

/**
 * Проверяет, есть ли непрочитанные варианты выбора
 */
export function hasUnreadChoices(): boolean {
  const state = loadDiscoverTabState();
  return state?.hasUnreadChoices === true;
}

/**
 * Помечает варианты выбора как прочитанные
 */
export function markChoicesAsRead(): void {
  const state = loadDiscoverTabState();
  if (state) {
    saveDiscoverTabState({
      ...state,
      hasUnreadChoices: false,
    });
  }
}

/**
 * Валидация структуры состояния
 */
function validateDiscoverTabState(state: any): state is DiscoverTabState {
  if (!state || typeof state !== 'object') {
    return false;
  }

  // Проверяем обязательные поля
  if (typeof state.isStarted !== 'boolean') {
    return false;
  }

  if (state.phase !== null &&
      state.phase !== 'dialogue' &&
      state.phase !== 'moon' &&
      state.phase !== 'story' &&
      state.phase !== 'finale') {
    return false;
  }

  if (!Array.isArray(state.messages)) {
    return false;
  }

  if (typeof state.currentArc !== 'number') {
    return false;
  }

  if (!Array.isArray(state.storySegments)) {
    return false;
  }

  if (!Array.isArray(state.choices)) {
    return false;
  }

  if (typeof state.hasUnreadChoices !== 'boolean') {
    return false;
  }

  return true;
}
