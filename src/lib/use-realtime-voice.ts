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
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    dcRef.current = null;
    pcRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
      audioElRef.current = null;
    }
    setState("idle");
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setState("connecting");

    try {
      // 1. Get ephemeral token
      const tokenRes = await fetch("/api/realtime/session", { method: "POST" });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Session failed: ${errText}`);
      }
      const sessionData = await tokenRes.json();
      const ephemeralKey = sessionData.client_secret?.value;
      if (!ephemeralKey) throw new Error("No ephemeral key returned");

      // 2. Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      // 3. Audio element — MUST be in DOM for autoplay to work
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "");
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        console.log("[Realtime] Got remote audio track");
        audioEl.srcObject = e.streams[0];
        audioEl.play().catch((err) =>
          console.warn("[Realtime] Audio play failed:", err)
        );
      };

      // 4. Add local mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log("[Realtime] Added local audio track:", track.label);
      });

      // 5. Data channel
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          console.log("[Realtime] Event:", event.type);

          switch (event.type) {
            case "session.created":
            case "session.updated":
              console.log("[Realtime] Session ready, VAD active");
              setState("listening");
              break;

            case "input_audio_buffer.speech_started":
              console.log("[Realtime] Speech detected");
              setState("listening");
              break;

            case "input_audio_buffer.speech_stopped":
              console.log("[Realtime] Speech stopped, waiting for response...");
              break;

            case "response.created":
              console.log("[Realtime] Response generating...");
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
              console.error("[Realtime] API error:", event.error);
              setError(event.error?.message ?? "Realtime error");
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      dc.onopen = () => {
        console.log("[Realtime] Data channel open");
        setState("listening");
      };

      dc.onclose = () => {
        console.log("[Realtime] Data channel closed");
        disconnect();
      };

      dc.onerror = (e) => {
        console.error("[Realtime] Data channel error:", e);
        setError("Connection error");
        disconnect();
      };

      pc.onconnectionstatechange = () => {
        console.log("[Realtime] Connection state:", pc.connectionState);
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          setError("Connection lost");
          disconnect();
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[Realtime] ICE state:", pc.iceConnectionState);
      };

      // 6. SDP exchange
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
      console.log("[Realtime] WebRTC connected, waiting for session...");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      console.error("[Realtime] Connect error:", msg);
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
