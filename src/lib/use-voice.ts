"use client";

import { useState, useRef, useCallback } from "react";

type VoiceState = "idle" | "recording" | "transcribing" | "speaking";

export function useVoice() {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setState("idle");
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    stopSpeaking();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setState("recording");
    } catch {
      setError("Microphone access denied");
      setState("idle");
    }
  }, [stopSpeaking]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state !== "recording") return null;

    return new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());

        if (blob.size < 1000) {
          setState("idle");
          resolve(null);
          return;
        }

        setState("transcribing");
        try {
          const formData = new FormData();
          formData.append("audio", blob);
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          setState("idle");
          resolve(data.text);
        } catch {
          setError("Transcription failed");
          setState("idle");
          resolve(null);
        }
      };
      mediaRecorder.stop();
    });
  }, []);

  const speak = useCallback(
    async (text: string) => {
      stopSpeaking();
      setState("speaking");

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) throw new Error("TTS failed");

        const audioBlob = await res.blob();
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setState("idle");
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setState("idle");
        };

        await audio.play();
      } catch {
        setState("idle");
      }
    },
    [stopSpeaking]
  );

  return {
    state,
    error,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    isRecording: state === "recording",
    isTranscribing: state === "transcribing",
    isSpeaking: state === "speaking",
  };
}
