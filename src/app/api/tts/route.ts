export async function POST(req: Request) {
  const { text } = await req.json();

  if (!text) {
    return Response.json({ error: "No text provided" }, { status: 400 });
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text.slice(0, 4096),
      voice: "nova",
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("TTS API error:", error);
    return Response.json(
      { error: "Speech synthesis failed" },
      { status: response.status }
    );
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
    },
  });
}
