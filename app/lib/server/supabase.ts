import { createClient } from "@supabase/supabase-js";

type Database = {
  public: {
    Tables: {
      shopping_users: {
        Row: {
          id: string;
          username: string;
          password_hash: string;
          password_salt: string;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          password_hash: string;
          password_salt: string;
          created_at: string;
        };
        Update: Partial<{
          username: string;
          password_hash: string;
          password_salt: string;
          created_at: string;
        }>;
      };
      shopping_lists: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          planned_date: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          owner_id: string;
          title: string;
          planned_date: string;
          updated_at: string;
        };
        Update: Partial<{
          owner_id: string;
          title: string;
          planned_date: string;
          updated_at: string;
        }>;
      };
      shopping_list_items: {
        Row: {
          id: string;
          list_id: string;
          name: string;
          quantity: number;
          notes: string;
          category: string;
          status: "pending" | "bought" | "out_of_stock";
          created_at: string;
        };
        Insert: {
          id: string;
          list_id: string;
          name: string;
          quantity: number;
          notes: string;
          category: string;
          status: "pending" | "bought" | "out_of_stock";
          created_at: string;
        };
        Update: Partial<{
          name: string;
          quantity: number;
          notes: string;
          category: string;
          status: "pending" | "bought" | "out_of_stock";
          created_at: string;
        }>;
      };
      shopping_list_shares: {
        Row: {
          list_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          list_id: string;
          user_id: string;
          created_at: string;
        };
        Update: Partial<{
          created_at: string;
        }>;
      };
      shopping_user_item_history: {
        Row: {
          user_id: string;
          item_name_norm: string;
          weeks_in_row: number;
          total_times: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          item_name_norm: string;
          weeks_in_row: number;
          total_times: number;
          updated_at: string;
        };
        Update: Partial<{
          weeks_in_row: number;
          total_times: number;
          updated_at: string;
        }>;
      };
    };
  };
};

let cachedClient: ReturnType<typeof createClient<Database>> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/** Lightweight connectivity probe — returns false when the project is paused, deleted, or unreachable. */
export async function pingSupabase(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase env vars are not configured." };
  }
  try {
    const supabaseAdmin = getSupabaseAdmin() as {
      from: (table: string) => {
        select: (
          columns: string,
          options: { count: "exact"; head: true }
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await supabaseAdmin
      .from("shopping_users")
      .select("id", { count: "exact", head: true });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function getSupabaseAdmin() {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }

  cachedClient = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
}
