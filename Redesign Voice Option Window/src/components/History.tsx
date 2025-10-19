import { Button } from './ui/button';

export function History() {
  return (
    <div className="p-6 bg-purple-50/50 border-b border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-900">История</h2>
        <Button variant="outline" size="sm" className="text-xs text-purple-600 border-purple-200 hover:bg-purple-50">
          Закончить историю
        </Button>
      </div>
      
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-sm text-gray-700">
          хобби...» Лена наклоняется вперёд, её глаза светлеют. «Серьёзно? Покажи мне что-нибудь!»
        </p>
        <p className="text-xs text-gray-400 text-right mt-2">19:26</p>
      </div>
    </div>
  );
}