import { generateText } from "ai";
import { officeHoursSystemPrompt } from "@/lib/frameworks/office-hours";
import { sendMessage, sendVoice, getFileUrl } from "@/lib/telegram";

export async function POST(req: Request) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_BOT_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = await req.json();
  const message = update.message;
  if (!message) {
    return Response.json({ ok: true });
  }

  const chatId: number = message.chat.id;

  try {
    if (message.voice) {
      await handleVoice(chatId, message.voice.file_id);
    } else if (message.text) {
      await handleText(chatId, message.text);
    }
  } catch (err) {
    console.error("Telegram webhook error:", err);
    await sendMessage(chatId, "Sorry, something went wrong. Try again in a moment.");
  }

  return Response.json({ ok: true });
}

async function handleText(chatId: number, text: string) {
  const reply = await getAIResponse(text);
  await sendMessage(chatId, reply);
}

async function handleVoice(chatId: number, fileId: string) {
  const fileUrl = await getFileUrl(fileId);
  const audioRes = await fetch(fileUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to download voice file: ${audioRes.status}`);
  }
  const audioBlob = await audioRes.blob();

  const whisperForm = new FormData();
  whisperForm.append("file", audioBlob, "voice.ogg");
  whisperForm.append("model", "whisper-1");

  const transcribeRes = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: whisperForm,
    }
  );

  if (!transcribeRes.ok) {
    throw new Error(`Transcription failed: ${await transcribeRes.text()}`);
  }

  const { text: transcript } = await transcribeRes.json();
  const reply = await getAIResponse(transcript);

  const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: reply.slice(0, 4096),
      voice: "nova",
      response_format: "opus",
    }),
  });

  if (!ttsRes.ok) {
    throw new Error(`TTS failed: ${await ttsRes.text()}`);
  }

  const audioBuffer = await ttsRes.arrayBuffer();
  await sendVoice(chatId, audioBuffer);
}

async function getAIResponse(userMessage: string): Promise<string> {
  const { text } = await generateText({
    model: "openai/gpt-5.4",
    system: officeHoursSystemPrompt,
    prompt: userMessage,
  });
  return text;
}
