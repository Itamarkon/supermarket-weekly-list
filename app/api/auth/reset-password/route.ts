import { NextResponse } from "next/server";
import { hashPassword } from "@/app/lib/server/auth";
import { updateUserPasswordByUsername } from "@/app/lib/server/data";
import { checkRateLimit, getClientIp } from "@/app/lib/server/rate-limit";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; newPassword?: string };
    const username = body.username || "";
    const newPassword = body.newPassword || "";
    const ip = getClientIp(request);

    const rl = checkRateLimit(`reset:${ip}:${username}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${rl.retryAfterSeconds} seconds.` },
        { status: 429 }
      );
    }

    if (username.length < 3 || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Username must be at least 3 chars and new password at least 6 chars." },
        { status: 400 }
      );
    }

    const { passwordHash, passwordSalt } = await hashPassword(newPassword);
    const updated = await updateUserPasswordByUsername(username, passwordHash, passwordSalt);
    if (!updated) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password reset failed.";
    console.error("Password reset failed:", message);
    return NextResponse.json({ error: "Password reset failed." }, { status: 500 });
  }
}
