import { Calendar, Zap, Sparkles, Settings } from 'lucide-react';

export function BottomNav() {
  const navItems = [
    { icon: Calendar, label: 'Календарь', count: 5 },
    { icon: Zap, label: 'Циклы', count: 6 },
    { icon: Sparkles, label: 'Узнай себя', active: true },
    { icon: Settings, label: 'Настройки' }
  ];

  return (
    <div className="border-t border-gray-100 bg-white">
      <div className="flex items-center justify-around p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              className={`flex flex-col items-center gap-1 transition-colors ${
                item.active ? 'text-pink-500' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className="relative">
                <Icon className="w-6 h-6" />
                {item.count && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 text-white text-xs rounded-full flex items-center justify-center">
                    {item.count}
                  </span>
                )}
              </div>
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
