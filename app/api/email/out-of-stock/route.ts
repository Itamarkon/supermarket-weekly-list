/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/server/auth";
import { sendMail } from "@/app/lib/server/email";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/app/lib/server/supabase";

type InputItem = {
  name?: string;
  quantity?: number;
  status?: string;
};

type InputBody = {
  listId?: string;
  listTitle?: string;
  items?: InputItem[];
};

const RATE_LIMIT_MINUTES = 60;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function todayInIsrael(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  return `${year}-${month}-${day}`;
}

async function userRecentlySent(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }
  const supabaseAdmin = getSupabaseAdmin() as any;
  const cutoff = new Date(Date.now() - RATE_LIMIT_MINUTES * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("oos_email_sends")
    .select("id")
    .eq("user_id", userId)
    .gte("sent_at", cutoff)
    .limit(1);
  if (error) {
    console.error("[oos-email] rate-limit check failed:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function recordSend(userId: string, listId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }
  const supabaseAdmin = getSupabaseAdmin() as any;
  const { error } = await supabaseAdmin.from("oos_email_sends").insert({
    user_id: userId,
    list_id: listId,
    sent_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[oos-email] failed to record send:", error.message);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: InputBody;
  try {
    body = (await request.json()) as InputBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const listId = (body.listId || "").trim();
  const listTitle = (body.listTitle || "").trim() || "Shopping list";
  const rawItems = Array.isArray(body.items) ? body.items : [];

  if (!listId) {
    return NextResponse.json({ error: "listId is required" }, { status: 400 });
  }

  if (await userRecentlySent(user.id)) {
    return NextResponse.json({ error: "rate_limit", message: "Rate Limit > 1" }, { status: 429 });
  }

  const outOfStock = rawItems
    .filter((item) => item && item.status === "out_of_stock")
    .map((item) => ({
      name: (item.name || "").toString().slice(0, 120),
      quantity: Math.max(1, Number(item.quantity) || 1),
    }))
    .filter((item) => item.name.length > 0);

  if (outOfStock.length === 0) {
    return NextResponse.json({ ok: true, empty: true });
  }

  const dateStr = todayInIsrael();
  const subject = `Out of stock — ${dateStr}`;

  const textLines = [
    `List: ${listTitle}`,
    `Date: ${dateStr}`,
    "",
    "Out of stock items:",
    ...outOfStock.map((item) => `- ${item.quantity}x ${item.name}`),
  ];
  const text = textLines.join("\n");

  const htmlItems = outOfStock
    .map((item) => `<li>${escapeHtml(String(item.quantity))}x ${escapeHtml(item.name)}</li>`)
    .join("");
  const html = [
    `<!doctype html>`,
    `<html dir="rtl" lang="he"><body style="font-family: Arial, sans-serif;">`,
    `<p><strong>List:</strong> ${escapeHtml(listTitle)}<br/>`,
    `<strong>Date:</strong> ${escapeHtml(dateStr)}</p>`,
    `<p><strong>Out of stock items:</strong></p>`,
    `<ul>${htmlItems}</ul>`,
    `</body></html>`,
  ].join("");

  try {
    await sendMail({ subject, text, html });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[oos-email] send failed:", detail);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }

  await recordSend(user.id, listId);
  return NextResponse.json({ ok: true, sent: outOfStock.length });
}
