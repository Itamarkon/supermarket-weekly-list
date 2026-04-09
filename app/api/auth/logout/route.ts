import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/app/lib/server/auth";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
