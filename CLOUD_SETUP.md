# Cloud Setup (Supabase + Vercel)

## 1) Create Supabase project (free)
- Open Supabase dashboard, create new free project.
- Open SQL editor and run `supabase/schema.sql`.

## 2) Configure environment variables
Set these in Vercel Project Settings -> Environment Variables:

- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` = service role key (server only, never expose to client)
- `SESSION_SECRET` = long random string

For local testing, place the same values in `.env.local`.

## 3) Deploy
- Push code to your git repository.
- Import repo into Vercel and deploy.
- Use Vercel URL from any phone/PC browser.

## 4) Cost and size controls included
- Max 100 lists per user
- Max 500 items per list
- Max item name 80 chars
- Max notes 200 chars
- History capped to 500 items
- Data retention: lists older than 12 months are deleted (with items/shares)
