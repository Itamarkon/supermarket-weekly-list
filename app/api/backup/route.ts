import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/server/auth";
import { getVisibleStateForUser, saveUserState } from "@/app/lib/server/data";

type HistoryShape = Record<string, { weeksInRow: number; totalTimes: number }>;
type BackupShape = {
  version: 1;
  exportedAt: string;
  lists: Array<{
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
  }>;
  history: HistoryShape;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getVisibleStateForUser(user.id);
  const backup: BackupShape = {
    version: 1,
    exportedAt: new Date().toISOString(),
    lists: state.lists.map((list) => ({
      id: list.id,
      title: list.title,
      plannedDate: list.plannedDate,
      items: list.items,
    })),
    history: state.history,
  };

  return NextResponse.json(backup, {
    headers: {
      "Content-Disposition": `attachment; filename="shopping-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as BackupShape;
    const lists = Array.isArray(body.lists) ? body.lists : [];
    const history = body.history || {};
    await saveUserState(user.id, lists, history);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backup import failed.";
    console.error("Backup import failed:", message);
    return NextResponse.json({ error: "Backup import failed." }, { status: 500 });
  }
}
