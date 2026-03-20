import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateText } from "ai";
import { updateFounderProfile } from "@/lib/memory";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authSession = await auth();
  const userId = authSession?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const session = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);

  if (!session[0]) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const messages = session[0].messages as Array<{
    role: string;
    parts?: Array<{ type: string; text?: string }>;
    content?: string;
  }>;

  const transcript = messages
    .map((m) => {
      const text =
        m.parts
          ?.filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("") ?? m.content ?? "";
      return `${m.role === "user" ? "Founder" : "Advisor"}: ${text}`;
    })
    .join("\n\n");

  const { text: summary } = await generateText({
    model: "openai/gpt-5.4",
    system: `You are summarizing a startup advisor session. Produce a concise summary with:
1. **Key Topic** — what the session was about (1 line)
2. **Key Decisions** — what was decided or concluded (bullet points)
3. **Action Items** — concrete next steps for the founder (bullet points)
4. **Notable Quotes** — 1-2 standout things the founder said (quoted)
5. **Session Title** — a short 3-6 word title for this session

Format as clean markdown. Be concise.`,
    prompt: `Summarize this office hours session:\n\n${transcript}`,
  });

  // Extract title from summary
  const titleMatch = summary.match(/Session Title[:\s]*(.+)/i);
  const title = titleMatch?.[1]?.replace(/[*#]/g, "").trim() ?? "Office Hours";

  await db
    .update(sessions)
    .set({ summary, title, updatedAt: new Date() })
    .where(eq(sessions.id, id));

  // Update founder profile with this session's summary
  await updateFounderProfile(userId, summary);

  return Response.json({ summary, title });
}
