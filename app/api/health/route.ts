import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/app/lib/server/supabase";

export async function GET() {
  return NextResponse.json({
    ok: true,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV,
    supabaseConfigured: isSupabaseConfigured(),
    sessionSecretSet: Boolean(process.env.SESSION_SECRET?.trim()),
  });
}
