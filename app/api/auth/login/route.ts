import { NextResponse } from "next/server";
import { getUserByUsername } from "@/app/lib/server/data";
import { setSessionCookie, verifyPassword } from "@/app/lib/server/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username || "";
    const password = body.password || "";

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
