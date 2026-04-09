import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/server/auth";
import { shareListWithUsername } from "@/app/lib/server/data";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { username?: string };
    const targetUsername = body.username || "";
    if (!targetUsername) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }

    await shareListWithUsername(user.id, id, targetUsername);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to share list.";
    if (message === "List not found." || message === "User not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "Only owner can share this list.") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "You already own this list.") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
