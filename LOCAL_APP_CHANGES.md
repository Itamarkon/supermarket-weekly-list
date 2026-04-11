# Local app — what changed (plain summary)

This file lists changes made to the supermarket weekly list web app in simple language. Anyone can read it to understand what is different from a basic version.

---

## Login and account

- If the login or “who am I” API returns a bad response or non-JSON, the page stays usable instead of breaking or going blank.
- After you log in successfully, the app loads your lists first, then switches to the main screen. That way you do not get stuck on “Loading your data…” with no explanation.
- Loading lists from the server is wrapped in safety logic. If something fails, you still get a default empty list so the screen can move on.
- Username and password are read from the actual form fields when you submit. That helps when the browser or a password manager fills the fields but React did not see every keystroke.
- Login and register requests send cookies the usual way for this site so the session can stick.

## Deployment and server configuration

- The app can report whether Supabase and session settings look configured, using a small **`/api/health`** page (it does not expose secret values).
- If Supabase is not configured for a deployment, login, register, saving lists, backup, and password reset answer with a clear “not configured” style message instead of a vague error.
- Session signing no longer fails as soon as the server file loads when `SESSION_SECRET` is missing on **Vercel Preview**. Production still expects a proper secret when issuing sessions outside preview. This stopped preview URLs from dying completely when only production had secrets set.

## Security headers (middleware)

- The strict content security policy was updated so **inline scripts that Next.js needs** are allowed. Before that, the page could look fine but **buttons and forms did nothing** because the browser blocked those scripts.

## Saving your lists (autosave)

- The app avoids sending the **same** list data to the server over and over when nothing changed.
- Autosave waits a bit longer after a change before sending, so the browser tab does not feel like it is constantly “working” or refreshing.
- When you log out, the “last saved snapshot” memory is cleared so the next session behaves cleanly.

## Forms and buttons

- The main **Login / Create account** button and the **Add Item** button are normal buttons, not classic “submit” buttons, so the browser is less likely to reload the whole page by accident.
- The **Add Item** button shows **“Please wait…”** briefly while an add runs, so you get clear feedback.
- **Export Backup** uses the same hand-shaped mouse pointer as **Import Backup** so it is obvious both are clickable.

## Backup messages

- The short message after a successful **export** disappears automatically after about **10 seconds**, similar to the duplicate-item message.

## Planned date

- The planned shopping date is edited as **DD/MM/YYYY** in a text field, instead of the browser’s built-in date picker (which often follows US or system locale).

## In the store: In Cart / Out of Stock

- **In Cart** toggles: first click marks the row **green** (in cart), second click returns to **normal**, third click **green** again, and so on.
- **Out of Stock** toggles: first click marks the row **red**, second click **normal**, third **red** again, and so on.
- Row colors match the current state so you can see at a glance what you marked.

## Project spec file (outside this folder)

- In the parent **Projects** folder, **`website-spec.md.txt`** had one line corrected so the planned date format reads **DD/MM/YYYY** instead of a typo.

---

## Cloud version (same code as local)

The **cloud** site is this same Next.js app deployed (for example on **Vercel**). No separate “cloud codebase” exists in this repo.

**What you need in the cloud dashboard**

- Set the environment variables listed in **`.env.example`** for **Production** and **Preview** (or use “All environments” once).
- After changing variables, **redeploy** so the new values apply.
- Open **`/api/health`** on your production URL to confirm `supabaseConfigured` and `sessionSecretSet` are true.

**Files that matter for the cloud build**

- **`app/`** — pages and API routes.
- **`middleware.ts`** — security headers and the content policy that allows Next.js to run in the browser.
- **`package.json`** / **`package-lock.json`** — dependencies the cloud install step uses.
- **`.env.example`** — checklist of variable names only (never put real secrets in Git).

---

*If you use Git, you can also see exact code edits with `git log` and `git diff`.*
