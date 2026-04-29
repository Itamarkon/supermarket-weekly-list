-- Enable Row-Level Security on every application table.
--
-- Why this is safe for our app:
--   * The only Supabase client in the codebase (app/lib/server/supabase.ts)
--     is a server-side client that uses the SERVICE ROLE key.
--   * The service_role role has the Postgres `bypassrls` attribute, so RLS
--     does not apply to it. The app continues to work with no changes.
--   * No browser/anon Supabase client exists. anon and authenticated roles
--     therefore have NO access — which is exactly what closes the
--     "Anyone with your project URL can read/edit/delete..." warning.
--
-- If we ever introduce a browser-side Supabase client (e.g. with
-- NEXT_PUBLIC_SUPABASE_ANON_KEY), we will add appropriate policies here.
--
-- Idempotent: safe to run multiple times.

alter table public.shopping_users              enable row level security;
alter table public.shopping_lists              enable row level security;
alter table public.shopping_list_items         enable row level security;
alter table public.shopping_list_shares        enable row level security;
alter table public.shopping_user_item_history  enable row level security;
alter table public.oos_email_sends             enable row level security;

-- Verification helper:
--   select schemaname, tablename, rowsecurity
--   from pg_tables
--   where schemaname = 'public'
--     and tablename in (
--       'shopping_users','shopping_lists','shopping_list_items',
--       'shopping_list_shares','shopping_user_item_history','oos_email_sends'
--     );
-- All rows should show rowsecurity = true.
