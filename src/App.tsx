import React from 'react';
import ModernNastiaApp from './components/ModernNastiaApp';
import { ChatManagerSandbox } from './components/chat/ChatManagerSandbox';

function App() {
  // Проверяем, есть ли в URL параметр ?sandbox
  const urlParams = new URLSearchParams(window.location.search);
  const isSandbox = urlParams.has('sandbox');

  if (isSandbox) {
    return <ChatManagerSandbox />;
  }

  return <ModernNastiaApp />;
}

export default App;
