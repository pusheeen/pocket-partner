import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();

  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  if (!session[0]) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Allow owner or public sessions
  if (session[0].userId !== userId && !session[0].isPublic) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json(session[0]);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.messages !== undefined) updates.messages = body.messages;
  if (body.title !== undefined) updates.title = body.title;
  if (body.summary !== undefined) updates.summary = body.summary;
  if (body.isPublic !== undefined) {
    updates.isPublic = body.isPublic;
    if (body.isPublic && !body.shareId) {
      updates.shareId = randomUUID().slice(0, 8);
    }
  }

  await db
    .update(sessions)
    .set(updates)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));

  return Response.json({ ok: true });
}
