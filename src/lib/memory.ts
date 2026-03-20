import { db } from "./db";
import { founderProfiles, sessions } from "./db/schema";
import { eq, desc } from "drizzle-orm";

export async function getFounderContext(userId: string): Promise<string> {
  try {
    const profile = await db
      .select()
      .from(founderProfiles)
      .where(eq(founderProfiles.userId, userId))
      .limit(1);

    const recentSessions = await db
      .select({ summary: sessions.summary, createdAt: sessions.createdAt })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(3);

    if (!profile[0] && recentSessions.length === 0) return "";

    let context = "\n\n--- FOUNDER CONTEXT (from prior sessions) ---\n";

    if (profile[0]) {
      if (profile[0].context)
        context += `\nAbout this founder: ${profile[0].context}`;
      if (profile[0].goals) context += `\nTheir current goals: ${profile[0].goals}`;
      context += `\nThis is session #${profile[0].sessionCount + 1} with this founder.`;
    }

    if (recentSessions.length > 0) {
      context += "\n\nRecent session summaries:";
      for (const s of recentSessions) {
        if (s.summary) {
          context += `\n- (${s.createdAt?.toLocaleDateString()}): ${s.summary}`;
        }
      }
    }

    context +=
      "\n\nUse this context naturally — reference their prior sessions when relevant. E.g., 'Last time you mentioned X — how did that go?'";

    return context;
  } catch {
    return "";
  }
}

export async function updateFounderProfile(
  userId: string,
  sessionSummary: string
) {
  try {
    const existing = await db
      .select()
      .from(founderProfiles)
      .where(eq(founderProfiles.userId, userId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(founderProfiles)
        .set({
          lastSessionSummary: sessionSummary,
          updatedAt: new Date(),
        })
        .where(eq(founderProfiles.userId, userId));
    } else {
      await db.insert(founderProfiles).values({
        userId,
        lastSessionSummary: sessionSummary,
      });
    }
  } catch {
    // Non-blocking
  }
}
