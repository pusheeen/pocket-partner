import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userSessions = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      persona: sessions.persona,
      createdAt: sessions.createdAt,
      summary: sessions.summary,
      isPublic: sessions.isPublic,
      shareId: sessions.shareId,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt))
    .limit(50);

  return Response.json(userSessions);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { persona = "supportive" } = await req.json();

  const session = {
    id: randomUUID(),
    userId,
    persona,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(sessions).values(session);
  return Response.json(session);
}
