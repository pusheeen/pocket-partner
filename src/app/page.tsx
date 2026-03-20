"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useVoice } from "@/lib/use-voice";
import { useRef, useEffect, useState, useCallback } from "react";
import { frameworkMetadata } from "@/lib/frameworks/office-hours";

const transport = new DefaultChatTransport({ api: "/api/chat" });

export default function Home() {
  const { messages, sendMessage, status } = useChat({ transport });
  const voice = useVoice();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [textInput, setTextInput] = useState("");
  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Auto-speak assistant messages + auto-resume listening in live mode
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "ready") return;
    const lastMsg = messages[messages.length - 1];
    if (
      lastMsg?.role === "assistant" &&
      lastMsg.id !== lastSpokenRef.current
    ) {
      const text = getMessageText(lastMsg);
      if (text) {
        lastSpokenRef.current = lastMsg.id;
        if (voice.liveMode) {
          voice.speak(text, { onDone: () => voice.resumeListening() });
        } else {
          voice.speak(text);
        }
      }
    }
  }, [status, messages, voice]);

  const handleLiveToggle = useCallback(() => {
    if (voice.liveMode) {
      voice.endLiveMode();
    } else {
      voice.startLiveMode((text) => {
        sendMessage({ text });
      });
    }
  }, [voice, sendMessage]);

  const handleMicPress = useCallback(async () => {
    if (voice.isRecording) {
      const text = await voice.stopRecording();
      if (text) sendMessage({ text });
    } else {
      voice.stopSpeaking();
      await voice.startRecording();
    }
  }, [voice, sendMessage]);

  const handleTextSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!textInput.trim() || isStreaming) return;
    sendMessage({ text: textInput.trim() });
    setTextInput("");
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-dvh bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">{frameworkMetadata.icon}</span>
          <h1 className="font-semibold text-sm tracking-tight">
            Pocket Partner
          </h1>
        </div>
        <button
          onClick={handleLiveToggle}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
            voice.liveMode
              ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {voice.liveMode ? "● Live" : "Go Live"}
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="text-4xl">💡</div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-200 mb-2">
                {frameworkMetadata.name}
              </h2>
              <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">
                {frameworkMetadata.greeting}
              </p>
            </div>
            <p className="text-zinc-600 text-xs max-w-[250px]">
              {voice.liveMode
                ? "Just start talking — I'll listen and respond automatically"
                : "Tap \"Go Live\" for hands-free conversation, or use the mic / type below"}
            </p>
          </div>
        )}

        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isStreaming &&
            messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-1.5 px-4 py-3">
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            )}
        </div>
      </div>

      {/* Voice status — more prominent in live mode */}
      {(voice.state !== "idle" || voice.liveMode) && (
        <div className="text-center py-2">
          {voice.liveMode && voice.state === "idle" && !isStreaming && (
            <span className="text-xs text-zinc-600">
              Waiting for you to speak...
            </span>
          )}
          {voice.isRecording && (
            <div className="flex items-center justify-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-xs text-red-400">Listening...</span>
            </div>
          )}
          {voice.isTranscribing && (
            <span className="text-xs text-zinc-500">Processing...</span>
          )}
          {voice.isSpeaking && (
            <button
              onClick={() => {
                voice.stopSpeaking();
                if (voice.liveMode) voice.resumeListening();
              }}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Speaking... tap to interrupt
            </button>
          )}
        </div>
      )}

      {voice.error && (
        <div className="text-center py-1 text-xs text-red-400">
          {voice.error}
        </div>
      )}

      {/* Input area — collapses in live mode */}
      <div className="border-t border-zinc-800/50 px-4 py-3 pb-safe">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {voice.liveMode ? (
            <button
              onClick={handleLiveToggle}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Tap to end live conversation
            </button>
          ) : (
            <>
              <form
                onSubmit={handleTextSubmit}
                className="flex-1 flex gap-2"
              >
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type a message..."
                  disabled={isStreaming}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-50 transition-colors"
                />
                {textInput.trim() && (
                  <button
                    type="submit"
                    disabled={isStreaming}
                    className="bg-zinc-100 text-zinc-900 rounded-full px-4 py-2.5 text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
                  >
                    Send
                  </button>
                )}
              </form>

              <button
                onClick={handleMicPress}
                disabled={voice.isTranscribing || isStreaming}
                className={`relative flex items-center justify-center w-12 h-12 rounded-full transition-all disabled:opacity-50 ${
                  voice.isRecording
                    ? "bg-red-500 scale-110 shadow-lg shadow-red-500/25"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                {voice.isRecording && (
                  <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
                )}
                <MicIcon recording={voice.isRecording} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = getMessageText(message);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-zinc-100 text-zinc-900"
            : "bg-zinc-800/60 text-zinc-200"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function MicIcon({ recording }: { recording: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={recording ? "white" : "#a1a1aa"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
