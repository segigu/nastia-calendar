import React from 'react';
import { Heart } from 'lucide-react';

const TestApp: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Heart className="w-8 h-8 text-purple-800 mr-2" />
            <h1 className="text-3xl font-bold text-purple-800">Nastia</h1>
          </div>
          <p className="text-gray-600">Персональный календарь</p>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-purple-800 mb-4">
            Тестовая версия работает!
          </h2>
          <p className="text-gray-600">
            Если вы видите это сообщение, то React и Tailwind работают корректно.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({length: 7}, (_, i) => (
              <div key={i} className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-800 font-medium">
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestApp;