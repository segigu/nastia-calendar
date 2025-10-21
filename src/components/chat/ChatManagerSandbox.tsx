import React, { useRef, useState, useCallback } from 'react';
import { ChatManager, type ChatManagerHandle } from './ChatManager';
import type { PlanetMessage, MoonMessage, StoryMessage, UserMessage } from '../../types/chat';
import type { HistoryStoryOption } from '../../utils/historyStory';

/**
 * Песочница для тестирования ChatManager.
 * Отдельная страница с кнопками управления для проверки всех функций.
 */
const TAB_BAR_HEIGHT = 80; // Высота нижней панели (как в приложении)

export const ChatManagerSandbox: React.FC = () => {
  const chatRef = useRef<ChatManagerHandle>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [messageCounter, setMessageCounter] = useState(1);
  const [showTabBar, setShowTabBar] = useState(true);

  // Вспомогательная функция для генерации ID
  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Текущее время
  const getCurrentTime = () =>
    new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  // Автоскролл при изменении сообщений
  const handleMessagesChange = useCallback(() => {
    // Используем тройной RAF для надёжности - DOM должен обновиться
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (chatScrollRef.current) {
            // Просто скроллим до конца контента
            // Tab bar учитывается через paddingBottom внешнего контейнера
            chatScrollRef.current.scrollTo({
              top: chatScrollRef.current.scrollHeight,
              behavior: 'smooth',
            });
            console.log(
              '[Sandbox] Auto-scroll to:',
              chatScrollRef.current.scrollHeight,
              'Tab Bar:',
              showTabBar ? 'ON (padding-bottom applied)' : 'OFF'
            );
          }
        });
      });
    });
  }, [showTabBar]);

  // Добавить сообщение от планеты
  const addPlanetMessage = (planet: string, content: string) => {
    const message: PlanetMessage = {
      id: generateId(),
      author: planet as any,
      time: getCurrentTime(),
      type: 'planet',
      content,
    };
    chatRef.current?.addMessage(message);
    setMessageCounter((c) => c + 1);
  };

  // Добавить сообщение от Луны
  const addMoonMessage = (content: string) => {
    const message: MoonMessage = {
      id: generateId(),
      author: 'Луна',
      time: getCurrentTime(),
      type: 'moon',
      content,
    };
    chatRef.current?.addMessage(message);
    setMessageCounter((c) => c + 1);
  };

  // Добавить сообщение истории
  const addStoryMessage = (content: string, arcNumber: number = 1) => {
    const message: StoryMessage = {
      id: generateId(),
      author: 'История',
      time: getCurrentTime(),
      type: 'story',
      content,
      arcNumber,
      stageLabel: 'Завязка',
    };
    chatRef.current?.addMessage(message);
    setMessageCounter((c) => c + 1);
  };

  // Симуляция диалога планет
  const simulatePlanetDialogue = () => {
    chatRef.current?.setPhase('dialogue');

    const planets = ['Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн'];
    const messages = [
      'Привет! Я начну диалог.',
      'Согласна, давайте обсудим карту Насти.',
      'Вижу тут интересные аспекты!',
      'Нужно глубже копнуть.',
      'Давайте придумаем историю.',
    ];

    let delay = 0;
    planets.forEach((planet, index) => {
      setTimeout(() => {
        // Показываем индикатор печати
        chatRef.current?.setTyping(planet as any);

        setTimeout(() => {
          // Добавляем сообщение
          chatRef.current?.setTyping(null);
          addPlanetMessage(planet, messages[index]);
        }, 1500);
      }, delay);
      delay += 2500;
    });

    // Переходим к Луне
    setTimeout(() => {
      chatRef.current?.setPhase('moon');
      chatRef.current?.setTyping('Луна');

      setTimeout(() => {
        chatRef.current?.setTyping(null);
        addMoonMessage('Итак, планеты решили создать для тебя историю о внутреннем конфликте.');
      }, 1500);
    }, delay + 1000);
  };

  // Показать кнопки выбора
  const showChoices = () => {
    const choices: HistoryStoryOption[] = [
      {
        id: 'choice-1',
        title: 'Сказать правду',
        description: 'Честно озвучить свои чувства и потребности',
        kind: 'ai',
      },
      {
        id: 'choice-2',
        title: 'Промолчать',
        description: 'Промолчать ради сохранения мира',
        kind: 'ai',
      },
    ];

    chatRef.current?.setChoices(choices);
    chatRef.current?.setPhase('story');
  };

  // Симуляция полного флоу истории
  const simulateStoryFlow = () => {
    chatRef.current?.setPhase('story');

    // Добавляем сообщение истории
    addStoryMessage(
      'Ты стоишь на перепутье. Близкий человек просит о помощи, но это может нарушить твои планы.',
      1
    );

    // Через 1 секунду показываем кнопки выбора
    setTimeout(() => {
      showChoices();
    }, 1000);
  };

  // Добавить сообщение от Насти
  const addUserMessage = (content: string) => {
    const message: UserMessage = {
      id: generateId(),
      author: 'Настя',
      time: getCurrentTime(),
      type: 'user',
      content,
    };
    chatRef.current?.addMessage(message);
    setMessageCounter((c) => c + 1);
  };

  // Обработчик выбора опции - полный флоу
  const handleChoiceSelect = (choice: HistoryStoryOption) => {
    console.log('Selected choice:', choice);

    // 1. Скрываем кнопки
    chatRef.current?.hideChoices();

    // 2. Добавляем сообщение от Насти с текстом выбора
    setTimeout(() => {
      const choiceText = choice.description
        ? `${choice.title}. ${choice.description}`
        : choice.title;
      addUserMessage(choiceText);

      // 3. Включаем индикатор печати
      setTimeout(() => {
        chatRef.current?.setTyping('История');

        // 4. Добавляем новое сообщение истории
        setTimeout(() => {
          chatRef.current?.setTyping(null);
          addStoryMessage(
            `Ты выбрала "${choice.title}". Твой выбор привел к неожиданным последствиям...`,
            2
          );

          // 5. Снова показываем кнопки выбора
          setTimeout(() => {
            showChoices();
          }, 1000);
        }, 2000); // Имитация печати 2 секунды
      }, 300);
    }, 500); // Задержка для анимации скрытия кнопок
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Заголовок - фиксированный */}
      <div style={{ padding: '20px', background: 'white', borderBottom: '2px solid #e5e7eb' }}>
        <h1 style={{ margin: 0 }}>🧪 ChatManager Sandbox</h1>
      </div>

      {/* Панель управления - фиксированная */}
      <div
        style={{
          background: '#f5f5f5',
          padding: '15px 20px',
          borderBottom: '2px solid #e5e7eb',
          overflowY: 'auto',
          maxHeight: '200px',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: '18px' }}>Панель управления</h2>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
          <button onClick={() => chatRef.current?.setPhase('idle')} style={buttonStyle}>
            Фаза: idle
          </button>
          <button onClick={() => chatRef.current?.setPhase('dialogue')} style={buttonStyle}>
            Фаза: dialogue
          </button>
          <button onClick={() => chatRef.current?.setPhase('moon')} style={buttonStyle}>
            Фаза: moon
          </button>
          <button onClick={() => chatRef.current?.setPhase('story')} style={buttonStyle}>
            Фаза: story
          </button>
          <button onClick={() => chatRef.current?.setPhase('finale')} style={buttonStyle}>
            Фаза: finale
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
          <button
            onClick={() => addPlanetMessage('Меркурий', `Сообщение ${messageCounter} от Меркурия`)}
            style={buttonStyle}
          >
            + Меркурий
          </button>
          <button
            onClick={() => addPlanetMessage('Венера', `Сообщение ${messageCounter} от Венеры`)}
            style={buttonStyle}
          >
            + Венера
          </button>
          <button
            onClick={() => addPlanetMessage('Марс', `Сообщение ${messageCounter} от Марса`)}
            style={buttonStyle}
          >
            + Марс
          </button>
          <button
            onClick={() => addMoonMessage(`Сообщение ${messageCounter} от Луны`)}
            style={buttonStyle}
          >
            + Луна
          </button>
          <button
            onClick={() =>
              addStoryMessage(`Фрагмент истории ${messageCounter}. Это пример текста истории.`, 1)
            }
            style={buttonStyle}
          >
            + История
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
          <button onClick={() => chatRef.current?.setTyping('Меркурий')} style={buttonStyle}>
            Печатает: Меркурий
          </button>
          <button onClick={() => chatRef.current?.setTyping('Луна')} style={buttonStyle}>
            Печатает: Луна
          </button>
          <button onClick={() => chatRef.current?.setTyping('История')} style={buttonStyle}>
            Печатает: История
          </button>
          <button onClick={() => chatRef.current?.setTyping(null)} style={buttonStyle}>
            Печать: стоп
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
          <button onClick={showChoices} style={{ ...buttonStyle, background: '#8b5cf6' }}>
            Показать кнопки выбора
          </button>
          <button onClick={simulatePlanetDialogue} style={{ ...buttonStyle, background: '#10b981' }}>
            🎬 Симуляция диалога планет
          </button>
          <button onClick={simulateStoryFlow} style={{ ...buttonStyle, background: '#f59e0b' }}>
            📖 Симуляция истории с кнопками
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => chatRef.current?.clearMessages()}
            style={{ ...buttonStyle, background: '#ef4444' }}
          >
            🗑️ Очистить всё
          </button>
          <button
            onClick={() => {
              console.log('Current phase:', chatRef.current?.getPhase());
              console.log('Current arc:', chatRef.current?.getCurrentArc());
              console.log('Messages:', chatRef.current?.getMessages());
            }}
            style={{ ...buttonStyle, background: '#3b82f6' }}
          >
            📊 Логировать состояние
          </button>
          <button
            onClick={() => setShowTabBar((prev) => !prev)}
            style={{ ...buttonStyle, background: showTabBar ? '#10b981' : '#6b7280' }}
          >
            {showTabBar ? '✅ Tab Bar: ON' : '⬜ Tab Bar: OFF'}
          </button>
        </div>

        <div style={{ marginTop: '15px', fontSize: '14px', color: '#666' }}>
          <strong>Текущая фаза:</strong> {chatRef.current?.getPhase() ?? 'idle'} <br />
          <strong>Arc:</strong> {chatRef.current?.getCurrentArc() ?? 1} <br />
          <strong>Сообщений:</strong> {chatRef.current?.getMessages()?.length ?? 0} <br />
          <strong>Tab Bar:</strong> {showTabBar ? '✅ Включен (+80px offset)' : '⬜ Выключен (0px offset)'}
        </div>
      </div>

      {/* Scrollable область с ChatManager и инструкциями */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          background: '#fafafa'
        }}
      >
        {/* ChatManager */}
        <div
          style={{
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
            height: '400px', // ФИКСИРОВАННАЯ высота
            background: 'white',
            padding: '20px',
            marginBottom: '20px',
            overflow: 'hidden', // Прячем overflow
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div ref={chatScrollRef} style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ paddingBottom: showTabBar ? `${TAB_BAR_HEIGHT}px` : '0px' }}>
              <ChatManager
                ref={chatRef}
                onChoiceSelect={handleChoiceSelect}
                onCustomOptionClick={() => {
                  console.log('Custom option clicked!');
                  alert('Голосовой вариант пока не реализован в песочнице');
                }}
                onMessagesChange={handleMessagesChange}
                isActive={false}
                storyTitle="История (тест)"
              />
            </div>
          </div>
        </div>

        {/* Инструкции */}
        <div style={{ fontSize: '14px', color: '#666', background: 'white', padding: '20px', borderRadius: '12px' }}>
          <h3>📖 Как тестировать:</h3>
        <ol>
          <li>
            <strong>🎬 Диалог планет:</strong> Полная автоматическая симуляция диалога планет → сообщение Луны
          </li>
          <li>
            <strong>📖 История с кнопками (ГЛАВНЫЙ ТЕСТ):</strong> Нажми "📖 Симуляция истории с кнопками"
            <ul>
              <li>Появится сообщение истории</li>
              <li>Кнопки выбора появятся одна за другой (автоскролл при каждой!)</li>
              <li>Выбери вариант — он превратится в сообщение от Насти</li>
              <li>Появится индикатор печати "..."</li>
              <li>Появится новое сообщение истории</li>
              <li>Снова кнопки выбора — можно продолжать бесконечно</li>
            </ul>
          </li>
          <li>
            <strong>Добавление сообщений вручную:</strong> Используй кнопки "+ Меркурий", "+ Венера" и т.д.
          </li>
          <li>
            <strong>Индикаторы печати:</strong> Кнопки "Печатает: ..." покажут три точки (автоскролл!)
          </li>
          <li>
            <strong>Автоскролл:</strong> Смотри в консоль логи <code>[Sandbox] Auto-scroll to: ...</code>
          </li>
          <li>
            <strong>🎚️ Tab Bar (НОВОЕ!):</strong> Используй кнопку "Tab Bar: ON/OFF" для проверки автоскролла с учетом нижней панели
            <ul>
              <li>Когда Tab Bar включен, внизу появляется фиксированная панель (имитация реального приложения)</li>
              <li>ChatManager внутри получает wrapper с padding-bottom: 80px, создавая пространство внизу</li>
              <li>Последнее сообщение/кнопка должны быть видны полностью (не скрыты за панелью)</li>
              <li>Автоскролл доходит до самого низа, учитывая этот padding</li>
              <li>Проверь, что все корректно скроллится при включенной и выключенной панели</li>
              <li>В консоли будет показываться статус: "Tab Bar: ON (padding-bottom applied)" или "OFF"</li>
            </ul>
          </li>
        </ol>
        </div>
      </div>

      {/* Имитация tab bar */}
      {showTabBar && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${TAB_BAR_HEIGHT}px`,
            background: 'rgba(253, 242, 248, 0.95)',
            backdropFilter: 'blur(16px)',
            borderTop: '1px solid rgba(255, 182, 193, 0.3)',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            padding: '0 20px',
            boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
          }}
        >
          {/* Имитация кнопок вкладок */}
          <div style={{ textAlign: 'center', opacity: 0.5 }}>
            <div style={{ fontSize: '24px' }}>📅</div>
            <div style={{ fontSize: '11px', marginTop: '2px' }}>Календарь</div>
          </div>
          <div style={{ textAlign: 'center', opacity: 0.5 }}>
            <div style={{ fontSize: '24px' }}>📊</div>
            <div style={{ fontSize: '11px', marginTop: '2px' }}>Статистика</div>
          </div>
          <div style={{ textAlign: 'center', opacity: 1, color: '#ff6b9d' }}>
            <div style={{ fontSize: '24px' }}>🔮</div>
            <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 'bold' }}>Узнай себя</div>
          </div>
          <div style={{ textAlign: 'center', opacity: 0.5 }}>
            <div style={{ fontSize: '24px' }}>⚙️</div>
            <div style={{ fontSize: '11px', marginTop: '2px' }}>Настройки</div>
          </div>
        </div>
      )}
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#6b7280',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500',
};
