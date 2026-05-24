import { NextResponse } from "next/server";
import { getUserByUsername } from "@/app/lib/server/data";
import { setSessionCookie, verifyPassword } from "@/app/lib/server/auth";
import { checkRateLimit, getClientIp } from "@/app/lib/server/rate-limit";
import { isSupabaseConfigured } from "@/app/lib/server/supabase";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Database is not configured for this deployment (missing Supabase env vars)." },
      { status: 503 }
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const username = body.username || "";
    const password = body.password || "";
    const ip = getClientIp(request);

    const rl = checkRateLimit(`login:${ip}:${username}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${rl.retryAfterSeconds} seconds.` },
        { status: 429 }
      );
    }

    const user = await getUserByUsername(username);
    if (!user) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const isValid = await verifyPassword(user, password);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    await setSessionCookie(user.id);
    return NextResponse.json({ username: user.username });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to login.";
    if (message.startsWith("Database error:") || message.includes("fetch failed")) {
      console.error("Login failed (database unavailable):", message);
      return NextResponse.json(
        {
          error:
            "Database is temporarily unavailable. If this persists, check that your Supabase project is active (not paused).",
        },
        { status: 503 }
      );
    }
    console.error("Login failed:", message);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
