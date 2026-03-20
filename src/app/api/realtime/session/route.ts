import { officeHoursSystemPrompt } from "@/lib/frameworks/office-hours";

export async function POST() {
  const response = await fetch(
    "https://api.openai.com/v1/realtime/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice: "nova",
        instructions: officeHoursSystemPrompt,
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Realtime session error:", error);
    return Response.json(
      { error: "Failed to create realtime session" },
      { status: response.status }
    );
  }

  const data = await response.json();
  return Response.json(data);
}
