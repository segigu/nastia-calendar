# Исправление автоскролла для планетарного чата

## Проблема

Автоскролл не работал при появлении новых сообщений от планет (Юпитер, Нептун, Плутон и т.д.) в фазе генерации истории. Скролл срабатывал только после появления готовых сегментов истории и кнопок выбора.

## Причина

**Скроллили не тот элемент!**

- Попытка скроллить `historyMessagesRef.current` (div с классом `.historyChatMessages`)
- Этот div НЕ имеет `overflow: auto/scroll` в CSS
- Реально скроллируемым контейнером является весь `window` (вся страница)

## Решение

### 1. Разделили автоскролл на два отдельных useEffect

**Для фазы `generating` (планетарные сообщения):**
```typescript
useEffect(() => {
  if (historyStoryPhase !== 'generating') {
    return;
  }

  if (planetChatMessages.length === 0 && !currentTypingPlanet) {
    return;
  }

  // Тройной requestAnimationFrame для надежного ожидания рендера
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'smooth'
        });
      });
    });
  });
}, [planetChatMessages, currentTypingPlanet, historyStoryPhase]);
```

**Для фазы `ready` (сообщения истории):**
```typescript
useEffect(() => {
  if (historyStoryPhase !== 'ready') {
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'smooth'
        });
      });
    });
  });
}, [historyStorySegments, historyStoryLoading, historyStoryTyping, historyStoryPhase]);
```

### 2. Ключевые изменения

✅ **Изменили целевой элемент скролла:**
- Было: `container.scrollTo({ top: container.scrollHeight, ... })`
- Стало: `window.scrollTo({ top: document.documentElement.scrollHeight, ... })`

✅ **Использовали тройной requestAnimationFrame:**
- 1-й кадр: React обновляет виртуальный DOM
- 2-й кадр: Браузер применяет изменения к реальному DOM
- 3-й кадр: Элементы получают финальные размеры и позиции → выполняем скролл

✅ **Добавили проверку для пустых состояний:**
- `if (planetChatMessages.length === 0 && !currentTypingPlanet)` - не скроллим без причины

### 3. Дополнительные исправления CSS

**Отступ для кнопок выбора:**
```css
.historyChatReplies {
  padding-bottom: 5.5rem; /* Кнопки не прячутся за меню */
}
```

**Отступ для сообщений:**
```css
.historyChatMessages {
  padding-bottom: 1.5rem; /* Небольшой визуальный отступ */
}
```

## Результат

Теперь автоскролл работает корректно во всех случаях:
- ✅ При появлении сообщений от планет (генерация)
- ✅ При появлении индикатора печати
- ✅ При появлении сегментов истории
- ✅ При появлении кнопок выбора
- ✅ Кнопки не прячутся за нижнее меню

## Файлы

- `src/components/ModernNastiaApp.tsx` - строки 1350-1392
- `src/components/NastiaApp.module.css` - строки 1185-1191, 1431-1437

## Дата исправления

2025-01-XX
