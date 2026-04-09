import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { hashPassword, setSessionCookie } from "@/app/lib/server/auth";
import { countUsers, createUser, getUserByUsername } from "@/app/lib/server/data";
import { checkRateLimit, getClientIp } from "@/app/lib/server/rate-limit";
import { isSupabaseConfigured } from "@/app/lib/server/supabase";

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Database is not configured for this deployment (missing Supabase env vars)." },
        { status: 503 }
      );
    }
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username || "";
    const password = body.password || "";
    const ip = getClientIp(request);

    const rl = checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${rl.retryAfterSeconds} seconds.` },
        { status: 429 }
      );
    }

    if (username.length < 3 || password.length < 6) {
      return NextResponse.json(
        { error: "Username must be at least 3 chars and password at least 6 chars." },
        { status: 400 }
      );
    }

    const existing = await getUserByUsername(username);
    if (existing) {
      return NextResponse.json({ error: "Username already exists." }, { status: 409 });
    }

    const usersCount = await countUsers();
    if (usersCount >= 5) {
      return NextResponse.json(
        { error: "User limit reached (5). Contact site owner to add more users." },
        { status: 403 }
      );
    }

    const { passwordHash, passwordSalt } = await hashPassword(password);
    const userId = crypto.randomUUID();
    await createUser({
      id: userId,
      username,
      passwordHash,
      passwordSalt,
      createdAt: new Date().toISOString(),
    });
    await setSessionCookie(userId);

    return NextResponse.json({ username });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register user.";
    console.error("Register failed:", message);
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
