import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from './ui/button';

type RecordingState = 'idle' | 'recording' | 'processing' | 'done';

export function VoiceInput() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcribedText, setTranscribedText] = useState('');

  const handleStartRecording = () => {
    setRecordingState('recording');
  };

  const handleStopRecording = () => {
    setRecordingState('processing');
    
    // Имитация обработки
    setTimeout(() => {
      setTranscribedText('Достать телефон и показать несколько своих работ, рассказать о последнем проекте');
      setRecordingState('done');
    }, 2000);
  };

  const handleRetry = () => {
    setTranscribedText('');
    setRecordingState('idle');
  };

  const renderCustomOptionButton = () => {
    if (recordingState === 'idle') {
      return (
        <motion.button
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          onClick={handleStartRecording}
          className="w-full bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-4 hover:border-purple-300 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 text-left">
              <p className="text-purple-900">Свой вариант</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Продиктуй, как бы ты продолжила историю
              </p>
            </div>
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg group-hover:shadow-xl transition-shadow"
            >
              <Mic className="w-6 h-6 text-white" />
            </motion.div>
          </div>
        </motion.button>
      );
    }

    if (recordingState === 'recording') {
      return (
        <motion.button
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          onClick={handleStopRecording}
          className="w-full bg-gradient-to-br from-purple-100 to-pink-100 border-2 border-purple-400 rounded-2xl p-4 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-2 h-2 bg-red-500 rounded-full"
                />
                <p className="text-purple-900">Идёт запись...</p>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Нажмите, чтобы остановить
              </p>
            </div>
            <div className="relative w-12 h-12 flex-shrink-0">
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 bg-purple-400 rounded-full opacity-20"
              />
              <motion.div
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                className="absolute inset-0 bg-pink-400 rounded-full opacity-20"
              />
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Mic className="w-6 h-6 text-white" />
                </motion.div>
              </div>
            </div>
          </div>
        </motion.button>
      );
    }

    if (recordingState === 'processing') {
      return (
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          className="w-full bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 text-left">
              <p className="text-purple-900">Обработка варианта...</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Распознаём речь
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-6 h-6 text-white" />
              </motion.div>
            </div>
          </div>
        </motion.div>
      );
    }

    if (recordingState === 'done') {
      return (
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          className="w-full bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 text-left min-w-0">
              <p className="text-green-900">Свой вариант</p>
              <p className="text-sm text-gray-700 mt-2 leading-relaxed">
                {transcribedText}
              </p>
            </div>
            <motion.button
              onClick={handleRetry}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center flex-shrink-0 shadow-lg hover:shadow-xl transition-shadow"
              title="Перезаписать"
            >
              <RotateCcw className="w-5 h-5 text-white" />
            </motion.button>
          </div>
        </motion.div>
      );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 space-y-3">
        {/* Стандартные опции */}
        <motion.button
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="w-full bg-white border-2 border-gray-200 rounded-2xl p-4 hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
        >
          <p className="text-gray-900">Показать портфель</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Достать телефон и показать несколько своих работ
          </p>
        </motion.button>

        <motion.button
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="w-full bg-white border-2 border-gray-200 rounded-2xl p-4 hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
        >
          <p className="text-gray-900">Переменить тему</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Улыбнуться и сказать что-то другое
          </p>
        </motion.button>

        {/* Кнопка с голосовым вводом */}
        {renderCustomOptionButton()}
      </div>
    </div>
  );
}