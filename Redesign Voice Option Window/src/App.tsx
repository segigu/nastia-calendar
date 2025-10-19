import { useState } from "react";
import { VoiceInput } from "./components/VoiceInput";
import { History } from "./components/History";
import { BottomNav } from "./components/BottomNav";

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        <History />

        <VoiceInput />

        <BottomNav />
      </div>
    </div>
  );
}