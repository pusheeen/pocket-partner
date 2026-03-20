"use client";

import { useState, useRef, useCallback } from "react";

type RealtimeState =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "speaking";

export function useRealtimeVoice() {
  const [state, setState] = useState<RealtimeState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const disconnect = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    dcRef.current = null;
    pcRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }
    setState("idle");
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setState("connecting");

    try {
      // 1. Get ephemeral token from our server
      const tokenRes = await fetch("/api/realtime/session", { method: "POST" });
      if (!tokenRes.ok) throw new Error("Failed to create session");
      const { client_secret } = await tokenRes.json();
      const ephemeralKey = client_secret?.value;
      if (!ephemeralKey) throw new Error("No ephemeral key returned");

      // 2. Create peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 3. Set up remote audio playback
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // 4. Add local mic track
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // 5. Create data channel for events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          if (event.type === "response.audio.started") {
            setState("speaking");
          }

          if (event.type === "response.audio.done") {
            setState("listening");
          }

          if (event.type === "input_audio_buffer.speech_started") {
            setState("listening");
          }

          // Capture transcripts
          if (
            event.type ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            const text = event.transcript?.trim();
            if (text) {
              setTranscripts((prev) => [...prev, { role: "user", text }]);
            }
          }

          if (event.type === "response.audio_transcript.done") {
            const text = event.transcript?.trim();
            if (text) {
              setTranscripts((prev) => [...prev, { role: "assistant", text }]);
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      dc.onopen = () => {
        setState("listening");
      };

      dc.onclose = () => {
        disconnect();
      };

      // 6. Create and set local offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 7. Send offer to OpenAI Realtime API
      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      if (!sdpRes.ok) throw new Error("Failed to establish WebRTC connection");

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setState("connected");
      // Will transition to "listening" when data channel opens
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      disconnect();
    }
  }, [disconnect]);

  return {
    state,
    error,
    transcripts,
    connect,
    disconnect,
    isConnected: state !== "idle" && state !== "connecting",
    isListening: state === "listening",
    isSpeaking: state === "speaking",
    isConnecting: state === "connecting",
  };
}
