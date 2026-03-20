export async function POST(req: Request) {
  const formData = await req.formData();
  const audio = formData.get("audio") as Blob;

  if (!audio) {
    return Response.json({ error: "No audio provided" }, { status: 400 });
  }

  const whisperForm = new FormData();
  whisperForm.append("file", audio, "audio.webm");
  whisperForm.append("model", "whisper-1");

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: whisperForm,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Whisper API error:", error);
    return Response.json(
      { error: "Transcription failed" },
      { status: response.status }
    );
  }

  const data = await response.json();
  return Response.json({ text: data.text });
}
