import { streamText, convertToModelMessages } from "ai";
import { officeHoursSystemPrompt } from "@/lib/frameworks/office-hours";
import { retrieveContext } from "@/lib/rag";

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Get the last user message for RAG retrieval
  const lastUserMessage = [...messages]
    .reverse()
    .find((m: { role: string }) => m.role === "user");

  const userText = lastUserMessage?.parts
    ?.filter((p: { type: string }) => p.type === "text")
    ?.map((p: { text: string }) => p.text)
    ?.join("") ?? "";

  // Retrieve relevant Lenny's content
  let ragContext = "";
  try {
    ragContext = await retrieveContext(userText);
  } catch {
    // RAG failure is non-blocking
  }

  const systemPrompt = ragContext
    ? `${officeHoursSystemPrompt}\n\n---\n\nYou have access to insights from Lenny Rachitsky's podcast and newsletter. When relevant, naturally reference these insights in conversation — e.g., "Lenny's guest Stewart Butterfield talked about this exact pattern..." Don't force references; only use them when they genuinely add value to the conversation.\n${ragContext}`
    : officeHoursSystemPrompt;

  const result = streamText({
    model: "openai/gpt-5.4",
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
