import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const publicPaths = [
  "/login",
  "/api/auth",
  "/api/webhook",
  "/api/chat",
  "/api/transcribe",
  "/api/tts",
  "/api/realtime",
  "/share",
];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check auth
  const session = await auth();
  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
