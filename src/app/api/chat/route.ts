import { streamText, convertToModelMessages } from "ai";
import { officeHoursSystemPrompt } from "@/lib/frameworks/office-hours";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: "openai/gpt-5.4",
    system: officeHoursSystemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
