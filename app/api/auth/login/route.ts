import { NextResponse } from "next/server";
import { getUserByUsername } from "@/app/lib/server/data";
import { setSessionCookie, verifyPassword } from "@/app/lib/server/auth";
import { checkRateLimit, getClientIp } from "@/app/lib/server/rate-limit";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
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
    console.error("Login failed:", message);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
