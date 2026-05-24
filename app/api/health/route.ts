import { NextResponse } from "next/server";
import { isSupabaseConfigured, pingSupabase } from "@/app/lib/server/supabase";

export async function GET() {
  const supabaseConfigured = isSupabaseConfigured();
  const ping = supabaseConfigured ? await pingSupabase() : { ok: false as const, error: "not configured" };

  return NextResponse.json({
    ok: ping.ok,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV,
    supabaseConfigured,
    supabaseReachable: ping.ok,
    supabaseError: ping.ok ? null : ping.error,
    sessionSecretSet: Boolean(process.env.SESSION_SECRET?.trim()),
  });
}
