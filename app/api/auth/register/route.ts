import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { hashPassword, setSessionCookie } from "@/app/lib/server/auth";
import { createUser, getUserByUsername } from "@/app/lib/server/data";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username || "";
    const password = body.password || "";

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
