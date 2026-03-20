"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useVoice } from "@/lib/use-voice";
import { useRealtimeVoice } from "@/lib/use-realtime-voice";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { personas, type PersonaId } from "@/lib/personas";

export default function Home() {
  const [persona, setPersona] = useState<PersonaId>("supportive");
  const [premium, setPremium] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const personaRef = useRef<PersonaId>(persona);
  personaRef.current = persona;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ persona: personaRef.current }),
      }),
    []
  );

  const { messages, sendMessage, status } = useChat({ transport });
  const voice = useVoice();
  const realtime = useRealtimeVoice();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [textInput, setTextInput] = useState("");
  const isStreaming = status === "streaming" || status === "submitted";
  const currentPersona = personas[persona];

  const hasMessages = premium
    ? realtime.transcripts.length > 0
    : messages.length > 0;

  // Are we in an active voice session?
  const isLive = premium ? realtime.isConnected : voice.liveMode;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, realtime.transcripts]);

  // Auto-speak + auto-resume in standard live mode
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (premium || status !== "ready") return;
    const lastMsg = messages[messages.length - 1];
    if (
      lastMsg?.role === "assistant" &&
      lastMsg.id !== lastSpokenRef.current
    ) {
      const text = getMessageText(lastMsg);
      if (text) {
        lastSpokenRef.current = lastMsg.id;
        if (voice.liveMode) {
          voice.speak(text, {
            voice: currentPersona.voice,
            onDone: () => voice.resumeListening(),
          });
        } else {
          voice.speak(text, { voice: currentPersona.voice });
        }
      }
    }
  }, [premium, status, messages, voice, currentPersona.voice]);

  // One button to start/stop everything
  const handleMainAction = useCallback(() => {
    if (isLive) {
      // Stop
      if (premium) {
        realtime.disconnect();
      } else {
        voice.endLiveMode();
      }
    } else {
      // Start
      if (premium) {
        realtime.connect();
      } else {
        voice.startLiveMode((text) => {
          sendMessage({ text });
        });
      }
    }
  }, [isLive, premium, realtime, voice, sendMessage]);

  const handleTextSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!textInput.trim() || isStreaming) return;
    sendMessage({ text: textInput.trim() });
    setTextInput("");
  };

  return (
    <div className="flex flex-col h-dvh bg-zinc-950 text-zinc-100">
      {/* Minimal header */}
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">💡</span>
          <span className="font-semibold text-sm tracking-tight text-zinc-300">
            Pocket Partner
          </span>
          {isLive && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              live
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
        >
          <SettingsIcon />
        </button>
      </header>

      {/* Settings drawer */}
      {showSettings && (
        <div className="px-4 pb-4 border-b border-zinc-800/50 space-y-3">
          <div>
            <p className="text-xs text-zinc-500 mb-2">Advisor style</p>
            <div className="flex gap-2">
              {(Object.keys(personas) as PersonaId[]).map((id) => {
                const p = personas[id];
                return (
                  <button
                    key={id}
                    onClick={() => setPersona(id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all ${
                      persona === id
                        ? "bg-zinc-800 ring-1 ring-zinc-600 text-zinc-100"
                        : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <span>{p.emoji}</span>
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-2">Voice quality</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isLive) handleMainAction();
                  setPremium(false);
                }}
                className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                  !premium
                    ? "bg-zinc-800 ring-1 ring-zinc-600 text-zinc-100"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => {
                  if (isLive) handleMainAction();
                  setPremium(true);
                }}
                className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                  premium
                    ? "bg-amber-500/20 ring-1 ring-amber-500/30 text-amber-400"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Premium (~$0.30/min)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {!hasMessages && !isLive && (
          <div className="flex flex-col items-center justify-center h-full gap-8 text-center">
            <div>
              <h2 className="text-lg font-semibold text-zinc-300 mb-1">
                What are you working on?
              </h2>
              <p className="text-zinc-600 text-sm">
                Tap the mic and tell me about your idea.
              </p>
            </div>
          </div>
        )}

        {!hasMessages && isLive && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <span className="text-sm text-zinc-400">
                I&apos;m listening — go ahead
              </span>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto space-y-4">
          {premium
            ? realtime.transcripts.map((t, i) => (
                <Bubble key={i} isUser={t.role === "user"} text={t.text} />
              ))
            : messages.map((msg) => (
                <Bubble
                  key={msg.id}
                  isUser={msg.role === "user"}
                  text={getMessageText(msg)}
                />
              ))}

          {!premium &&
            isStreaming &&
            messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-1.5 px-4 py-3">
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            )}
        </div>
      </div>

      {/* Status bar */}
      {(voice.state !== "idle" || (premium && realtime.isConnected)) && (
        <div className="text-center py-1.5">
          {voice.isRecording && (
            <span className="text-xs text-red-400 animate-pulse">
              ● Listening...
            </span>
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
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Tap to interrupt
            </button>
          )}
          {premium && realtime.isListening && (
            <span className="text-xs text-amber-400 animate-pulse">
              ● Listening...
            </span>
          )}
          {premium && realtime.isSpeaking && (
            <span className="text-xs text-zinc-500">Speaking...</span>
          )}
        </div>
      )}

      {voice.error && (
        <div className="text-center py-1 text-xs text-red-400">
          {voice.error}
        </div>
      )}

      {/* Bottom bar: big mic + text input */}
      <div className="border-t border-zinc-800/50 px-4 py-3 pb-safe">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {/* Text input (always visible, secondary) */}
          <form onSubmit={handleTextSubmit} className="flex-1 flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={isLive ? "Listening..." : "Or type here..."}
              disabled={isStreaming || isLive}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-40 transition-colors"
            />
            {textInput.trim() && !isLive && (
              <button
                type="submit"
                disabled={isStreaming}
                className="bg-zinc-100 text-zinc-900 rounded-full px-4 py-2.5 text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
              >
                Send
              </button>
            )}
          </form>

          {/* THE button — one tap to start/stop voice */}
          <button
            onClick={handleMainAction}
            disabled={
              realtime.isConnecting || voice.isTranscribing || isStreaming
            }
            className={`relative flex items-center justify-center w-14 h-14 rounded-full transition-all disabled:opacity-50 shrink-0 ${
              isLive
                ? "bg-red-500 shadow-lg shadow-red-500/25 scale-105"
                : "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
            }`}
          >
            {isLive && (
              <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
            )}
            {isLive ? <StopIcon /> : <MicIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ isUser, text }: { isUser: boolean; text: string }) {
  if (!text) return null;
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

function MicIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
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

function StopIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="white"
      stroke="none"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}
