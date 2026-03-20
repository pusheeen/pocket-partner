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
      const tokenRes = await fetch("/api/realtime/session", { method: "POST" });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Session failed: ${errText}`);
      }
      const sessionData = await tokenRes.json();
      const ephemeralKey = sessionData.client_secret?.value;
      if (!ephemeralKey) throw new Error("No ephemeral key returned");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Remote audio playback
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // Local mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Data channel for events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          switch (event.type) {
            case "session.created":
            case "session.updated":
              setState("listening");
              break;

            case "input_audio_buffer.speech_started":
              setState("listening");
              break;

            case "input_audio_buffer.speech_stopped":
              // VAD detected speech end — server will auto-commit and respond
              break;

            case "response.audio.started":
              setState("speaking");
              break;

            case "response.audio.done":
              setState("listening");
              break;

            case "conversation.item.input_audio_transcription.completed":
              if (event.transcript?.trim()) {
                setTranscripts((prev) => [
                  ...prev,
                  { role: "user", text: event.transcript.trim() },
                ]);
              }
              break;

            case "response.audio_transcript.done":
              if (event.transcript?.trim()) {
                setTranscripts((prev) => [
                  ...prev,
                  { role: "assistant", text: event.transcript.trim() },
                ]);
              }
              break;

            case "error":
              console.error("Realtime API error:", event.error);
              setError(event.error?.message ?? "Realtime error");
              break;
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

      dc.onerror = (e) => {
        console.error("Data channel error:", e);
        setError("Connection error");
        disconnect();
      };

      // Monitor connection state
      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          setError("Connection lost");
          disconnect();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

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

      if (!sdpRes.ok) {
        const errText = await sdpRes.text();
        throw new Error(`WebRTC handshake failed: ${errText}`);
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      console.error("Realtime connect error:", msg);
      setError(msg);
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
