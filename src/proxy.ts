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
  "/_next",
  "/favicon.ico",
];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } catch {
    return NextResponse.next();
  }

  return NextResponse.next();
}
