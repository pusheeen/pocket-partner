import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;

  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.shareId, shareId))
    .limit(1);

  if (!session[0] || !session[0].isPublic) {
    notFound();
  }

  const { title, summary, persona, createdAt, messages } = session[0];
  const msgs = (messages as Array<{
    role: string;
    parts?: Array<{ type: string; text?: string }>;
  }>) ?? [];

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/50 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs text-zinc-500 mb-1">
            Pocket Partner · {persona} mode ·{" "}
            {createdAt ? new Date(createdAt).toLocaleDateString() : ""}
          </p>
          <h1 className="text-lg font-semibold">{title ?? "Office Hours"}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {summary && (
          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-400 mb-2">
              Session Summary
            </h2>
            <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {summary}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">Conversation</h2>
          {msgs.map((msg, i) => {
            const text = msg.parts
              ?.filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("") ?? "";
            if (!text) return null;
            const isUser = msg.role === "user";
            return (
              <div
                key={i}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? "bg-zinc-100 text-zinc-900"
                      : "bg-zinc-800/60 text-zinc-200"
                  }`}
                >
                  {text}
                </div>
              </div>
            );
          })}
        </div>

        <footer className="text-center py-8 text-xs text-zinc-600">
          <p>
            Built with{" "}
            <a
              href="https://pocketpartner.live"
              className="text-zinc-400 hover:text-zinc-200"
            >
              Pocket Partner
            </a>{" "}
            — voice-powered startup thinking
          </p>
        </footer>
      </main>
    </div>
  );
}
