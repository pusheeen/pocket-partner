"use client";

import { useState, useRef, useCallback } from "react";

type VoiceState = "idle" | "recording" | "transcribing" | "speaking";

// Split text into speakable chunks at sentence boundaries
function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  // Split on sentence-ending punctuation followed by space or end
  const parts = text.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g);
  if (!parts) return [text];

  let current = "";
  for (const part of parts) {
    current += part;
    // Speak chunks of ~60-150 chars (roughly one sentence)
    if (current.length >= 60) {
      chunks.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function useVoice() {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onAutoStopRef = useRef<((text: string) => void) | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const speakAbortRef = useRef(false);

  const stopSpeaking = useCallback(() => {
    speakAbortRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (state === "speaking") setState("idle");
  }, [state]);

  const cleanupVAD = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (vadFrameRef.current) cancelAnimationFrame(vadFrameRef.current);
    silenceTimerRef.current = null;
    vadFrameRef.current = null;
    analyserRef.current = null;
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const transcribeBlob = useCallback(
    async (blob: Blob): Promise<string | null> => {
      if (blob.size < 1000) return null;
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
        return data.text;
      } catch {
        setError("Transcription failed");
        return null;
      }
    },
    []
  );

  const startVAD = useCallback(
    (stream: MediaStream, onSilence: () => void) => {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const SILENCE_THRESHOLD = 15;
      const SILENCE_DURATION = 1500;
      let lastSoundTime = Date.now();

      const check = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg =
          dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length;

        if (avg > SILENCE_THRESHOLD) {
          lastSoundTime = Date.now();
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (
          Date.now() - lastSoundTime > 300 &&
          !silenceTimerRef.current
        ) {
          silenceTimerRef.current = setTimeout(() => {
            onSilence();
            audioCtx.close();
          }, SILENCE_DURATION - 300);
        }

        vadFrameRef.current = requestAnimationFrame(check);
      };
      vadFrameRef.current = requestAnimationFrame(check);
    },
    []
  );

  const startRecording = useCallback(
    async (options?: { autoStop?: boolean }) => {
      setError(null);
      stopSpeaking();
      cleanupVAD();

      try {
        let stream = streamRef.current;
        if (!stream || !stream.active) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
        }

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

        if (options?.autoStop) {
          startVAD(stream, async () => {
            cleanupVAD();
            const text = await stopRecordingInternal(false);
            if (text && onAutoStopRef.current) {
              onAutoStopRef.current(text);
            } else if (!text && liveMode) {
              startRecording({ autoStop: true });
            }
          });
        }
      } catch {
        setError("Microphone access denied");
        setState("idle");
      }
    },
    [stopSpeaking, cleanupVAD, startVAD, liveMode]
  );

  const stopRecordingInternal = useCallback(
    async (releaseStream: boolean): Promise<string | null> => {
      cleanupVAD();
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state !== "recording") return null;

      return new Promise((resolve) => {
        mediaRecorder.onstop = async () => {
          if (releaseStream) cleanupStream();
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const text = await transcribeBlob(blob);
          setState("idle");
          resolve(text);
        };
        mediaRecorder.stop();
      });
    },
    [cleanupVAD, cleanupStream, transcribeBlob]
  );

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return stopRecordingInternal(true);
  }, [stopRecordingInternal]);

  // Chunked TTS — splits text into sentences, fetches and plays each one
  // sequentially. First sentence starts playing while later ones are still
  // being generated, cutting perceived latency significantly.
  const speak = useCallback(
    async (text: string, options?: { onDone?: () => void }) => {
      stopSpeaking();
      speakAbortRef.current = false;
      setState("speaking");

      const chunks = splitIntoChunks(text);

      // Pre-fetch first chunk immediately, start fetching second in parallel
      const fetchChunk = (t: string) =>
        fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: t }),
        }).then((r) => (r.ok ? r.blob() : null));

      try {
        // Start fetching the first two chunks in parallel
        const pending: Promise<Blob | null>[] = chunks
          .slice(0, 2)
          .map(fetchChunk);
        let nextFetchIdx = 2;

        for (let i = 0; i < chunks.length; i++) {
          if (speakAbortRef.current) break;

          // Wait for this chunk's audio
          const audioBlob = await pending[i];
          if (!audioBlob || speakAbortRef.current) break;

          // Start fetching the next chunk while this one plays
          if (nextFetchIdx < chunks.length) {
            pending[nextFetchIdx] = fetchChunk(chunks[nextFetchIdx]);
            nextFetchIdx++;
          }

          // Play this chunk
          const url = URL.createObjectURL(audioBlob);
          const audio = new Audio(url);
          audioRef.current = audio;

          await new Promise<void>((resolve) => {
            audio.onended = () => {
              URL.revokeObjectURL(url);
              resolve();
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              resolve();
            };
            audio.play().catch(() => resolve());
          });
        }
      } catch {
        // TTS failed entirely
      }

      audioRef.current = null;
      if (!speakAbortRef.current) {
        setState("idle");
        options?.onDone?.();
      }
    },
    [stopSpeaking]
  );

  const endLiveMode = useCallback(() => {
    cleanupVAD();
    cleanupStream();
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") mr.stop();
    setLiveMode(false);
    setState("idle");
    onAutoStopRef.current = null;
  }, [cleanupVAD, cleanupStream]);

  const startLiveMode = useCallback(
    (onMessage: (text: string) => void) => {
      onAutoStopRef.current = onMessage;
      setLiveMode(true);
      startRecording({ autoStop: true });
    },
    [startRecording]
  );

  const resumeListening = useCallback(() => {
    if (liveMode) {
      startRecording({ autoStop: true });
    }
  }, [liveMode, startRecording]);

  return {
    state,
    error,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    liveMode,
    startLiveMode,
    endLiveMode,
    resumeListening,
    isRecording: state === "recording",
    isTranscribing: state === "transcribing",
    isSpeaking: state === "speaking",
  };
}
