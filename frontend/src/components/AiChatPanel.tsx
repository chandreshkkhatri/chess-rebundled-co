"use client";

import { useEffect, useRef, useState } from "react";
import { AiChatMessage, AiPersonaPublic } from "@/types/aiGame";

interface AiChatPanelProps {
  persona: AiPersonaPublic | null;
  chat: AiChatMessage[];
  botTyping: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  className?: string;
}

const MAX_CHAT_LENGTH = 280;
const FLOOD_WINDOW_MS = 10_000;
const FLOOD_MAX = 4;

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

export function AiChatPanel({
  persona,
  chat,
  botTyping,
  disabled = false,
  onSend,
  className = "",
}: AiChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [floodWarning, setFloodWarning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentTimestampsRef = useRef<number[]>([]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, botTyping]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || disabled) return;

    const now = Date.now();
    sentTimestampsRef.current = sentTimestampsRef.current.filter(
      (ts) => now - ts < FLOOD_WINDOW_MS,
    );
    if (sentTimestampsRef.current.length >= FLOOD_MAX) {
      setFloodWarning(true);
      setTimeout(() => setFloodWarning(false), 2000);
      return;
    }
    sentTimestampsRef.current.push(now);

    onSend(text.slice(0, MAX_CHAT_LENGTH));
    setDraft("");
  };

  return (
    <div
      className={`flex flex-col bg-slate-800 rounded-2xl overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <span className="text-xl">{persona?.emoji || "🤖"}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-100 truncate">
            {persona?.name || "AI Opponent"}
          </div>
          <div className="text-xs text-slate-500">
            {botTyping ? "typing…" : `~${persona?.rating || "?"} rated`}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[160px]"
      >
        {chat.length === 0 && !botTyping && (
          <p className="text-xs text-slate-500 text-center pt-4">
            Say hi — your opponent talks back
          </p>
        )}
        {chat.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.from === "player" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                message.from === "player"
                  ? "bg-purple-600 text-white rounded-br-sm"
                  : "bg-slate-700 text-slate-100 rounded-bl-sm"
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
        {botTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-700 px-3 py-2.5 rounded-2xl rounded-bl-sm">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-700">
        {floodWarning && (
          <p className="text-xs text-yellow-400 mb-1">
            Slow down a little between messages
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHAT_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder={disabled ? "Game over" : "Talk to your opponent…"}
            disabled={disabled}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={disabled || !draft.trim()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-all"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
