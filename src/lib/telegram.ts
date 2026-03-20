const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN!;
const API_BASE = () => `https://api.telegram.org/bot${BOT_TOKEN()}`;

export async function sendMessage(chatId: number, text: string) {
  const res = await fetch(`${API_BASE()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error("sendMessage failed:", await res.text());
  }
}

export async function sendVoice(chatId: number, audioBuffer: ArrayBuffer) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("voice", new Blob([audioBuffer], { type: "audio/ogg" }), "voice.ogg");

  const res = await fetch(`${API_BASE()}/sendVoice`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    console.error("sendVoice failed:", await res.text());
  }
}

export async function getFileUrl(fileId: string): Promise<string> {
  const res = await fetch(`${API_BASE()}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) {
    throw new Error(`getFile failed: ${await res.text()}`);
  }
  const data = await res.json();
  const filePath = data.result.file_path;
  return `https://api.telegram.org/file/bot${BOT_TOKEN()}/${filePath}`;
}
