import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/server/auth";
import { DB_LIMITS, getVisibleStateForUser, saveUserState } from "@/app/lib/server/data";
import { isSupabaseConfigured } from "@/app/lib/server/supabase";

type HistoryShape = Record<string, { weeksInRow: number; totalTimes: number }>;

type ClientList = {
  id: string;
  title: string;
  plannedDate: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    notes: string;
    category: string;
    status: "pending" | "bought" | "out_of_stock";
  }>;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Database is not configured for this deployment (missing Supabase env vars)." },
      { status: 503 }
    );
  }

  const state = await getVisibleStateForUser(user.id);
  return NextResponse.json({ lists: state.lists, history: state.history });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Database is not configured for this deployment (missing Supabase env vars)." },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as { lists?: ClientList[]; history?: HistoryShape };
    const inputLists = body.lists || [];
    const inputHistory = body.history || {};

    if (inputLists.length > DB_LIMITS.maxListsPerUser) {
      return NextResponse.json(
        { error: `List limit exceeded (${DB_LIMITS.maxListsPerUser}).` },
        { status: 400 }
      );
    }

    await saveUserState(user.id, inputLists, inputHistory);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save state.";
    const status = message.includes("limit exceeded") ? 400 : 500;
    return NextResponse.json(
      { error: status === 400 ? message : "Failed to save state." },
      { status }
    );
  }
}
