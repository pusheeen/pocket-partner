import { streamText, convertToModelMessages } from "ai";
import { officeHoursSystemPrompt } from "@/lib/frameworks/office-hours";
import { retrieveContext } from "@/lib/rag";
import { personas, type PersonaId } from "@/lib/personas";
import { getFounderContext } from "@/lib/memory";

export async function POST(req: Request) {
  const { messages, persona: personaId, userId } = await req.json();
  const persona =
    personas[(personaId as PersonaId) ?? "supportive"] ?? personas.supportive;

  const lastUserMessage = [...messages]
    .reverse()
    .find((m: { role: string }) => m.role === "user");

  const userText =
    lastUserMessage?.parts
      ?.filter((p: { type: string }) => p.type === "text")
      ?.map((p: { text: string }) => p.text)
      ?.join("") ?? "";

  // Parallel: RAG retrieval + founder memory
  const [ragContext, founderContext] = await Promise.all([
    retrieveContext(userText).catch(() => ""),
    userId ? getFounderContext(userId).catch(() => "") : Promise.resolve(""),
  ]);

  let systemPrompt = `${persona.preamble}\n\n---\n\n${officeHoursSystemPrompt}`;

  if (founderContext) {
    systemPrompt += founderContext;
  }

  if (ragContext) {
    systemPrompt += `\n\n---\n\nYou have access to insights from Lenny Rachitsky's podcast and newsletter. When relevant, naturally reference these insights in conversation — e.g., "Lenny's guest Stewart Butterfield talked about this exact pattern..." Don't force references; only use them when they genuinely add value.\n${ragContext}`;
  }

  const result = streamText({
    model: "openai/gpt-5.4",
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    headers: { "x-tts-voice": persona.voice },
  });
}
