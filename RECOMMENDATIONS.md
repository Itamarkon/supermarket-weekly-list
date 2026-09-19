# Recommendations — Status and Next Steps

**Last updated:** 24 May 2026  
**Project:** Supermarket Weekly List  
**Location:** `C:\Itamar\Projects\supermarket-weekly-list`

This document has two parts:

- **Part A (sections 0–0.12):** How the website should work — your product requirements from `website-spec.md` and follow-up additions.
- **Part B (sections 1–8):** Technical recommendations from the security review, test plan, and follow-up work.

Each technical item is marked **Done**, **Partial**, or **Pending**.

---

## 0. Website product specification (your requirements)

These are the features and behaviors you asked for when building the supermarket weekly list app. Most are **Done**; gaps are noted.

### 0.1 Purpose and audience

- A **family supermarket shopping list** used on phone and laptop while planning and while in the store.
- **Hebrew category names** — the app is built around Israeli supermarket aisles.
- **One shared family account model** — each person can have their own login, but list sharing between users was removed by your decision.
- **Cloud-first** — data lives in Supabase Postgres, deployed on Vercel, accessible from any browser without opening your laptop on Wi-Fi.

### 0.2 Login and accounts

- **Register, login, logout** with real backend accounts (not demo-only).
- **Usernames are case-sensitive** — `Itamar` and `itamar` are different.
- **Password minimum 6 characters**; username minimum 3 characters.
- **No demo credentials shown** on the login screen.
- **Session cookie** — stay logged in for up to 12 hours (configurable).
- **Forgot password** — reset by entering username and a new password (family-trust model, not email token).
- **Enter key** submits login, register, and add-item forms.
- **Status:** Done

### 0.3 Shopping categories (8 columns)

Items are grouped into these fixed Hebrew categories, shown as columns on desktop and stacked cards on mobile:

1. פירות וירקות (Fruits and vegetables)
2. חטיפים ומתוקים (Snacks and sweets)
3. אפייה (Baking)
4. שימורים/קשים (Canned / dry goods)
5. הגיינה וטואלטיקה (Hygiene and toiletries)
6. ניקיון (Cleaning)
7. חלבי ובשרי (Dairy and meat)
8. קפואים (Frozen)

- When adding an item, you pick a category from a dropdown.
- **Move between categories:** drag an item to another column on desktop; on mobile use the drag handle (⋮⋮) or the per-item category dropdown.
- Dropping on a category highlights it so the target is clear.
- **Status:** Done

### 0.4 Shopping lists

- **Multiple lists** per user — switch between them with tabs.
- **Planned shopping date** — one field labeled “Planned Date (DD/MM/YYYY)” in European format only (no duplicate US-format display).
- **List title** — automatically named `Shopping DD/MM/YYYY` based on the planned date.
- **Create new list** — adds a fresh dated list.
- **Delete current list** — if other lists exist, deletes the active one; if it is the only list, resets to a new empty dated list (never leaves you stuck with no list).
- **Autosave** — changes save to the cloud after a short delay; identical data is not re-sent repeatedly.
- **Status:** Done

### 0.5 Adding and editing items

- **Add item** with: product name, category, quantity (minimum 1), optional notes.
- **Quick-add chips** — common Hebrew items (חלב, ביצים, יוגורט, לחם, בננות, עגבניות, אורז, מים) for one-tap add.
- **Search suggestions** — typing a prefix (e.g. “mi”) shows matching items from quick list and current list.
- **Change quantity after add** — each item row has minus, number input, and plus buttons.
- **Delete item** — per-row delete button.
- **Duplicate warning** — if the same name already exists (ignoring case and extra spaces), show a warning like “X is already in your list.” Message clears automatically after about 10 seconds.
- **Status:** Done

### 0.6 In Cart / Out of Stock / Pending (in-store marking)

Each item has one of three statuses:

- **Pending (normal)** — default; neutral row color.
- **In Cart (bought)** — green row and green “In Cart” button; means you put it in the physical cart.
- **Out of Stock** — red row and red “Out of Stock” button; means the store did not have it.

**Toggle behavior (as you requested):**

- **In Cart:** first click → green; second click → back to normal; third → green again, and so on.
- **Out of Stock:** first click → red; second click → normal; third → red again, and so on.
- Clicking In Cart on an Out-of-Stock item moves it to In Cart (and vice versa for Out of Stock from bought).
- Row background and border colors reflect the current state at a glance.
- Mobile uses shorter button labels (“✓ Cart”, “✗ Out”); desktop shows full text.
- **Status:** Done

### 0.7 Close Week and repeated-item tracking

- **“Close Week + Track Repeats”** button — when clicked, increments streak counters only for items **currently on the active list**; items not on the list keep their existing streak (important fix from your spec).
- **Repeated-item suggestions** — items bought **4 weeks in a row** appear as green suggestion chips (“Bought 4 weeks in a row”) for quick re-add.
- Streaks do **not** advance automatically by calendar week — only when you click Close Week.
- **Status:** Done for manual tracking; automatic calendar-week inference is **Pending** (see section 4.4).

### 0.8 Out-of-stock email (manual send)

You asked for a manual “email out-of-stock summary” feature. Specification and current behavior:

- **Button:** “Email out-of-stock list” (with mail icon on mobile), visible to all logged-in users.
- **Scope:** one active list at a time — only items marked Out of Stock on that list.
- **If nothing is out of stock:** no email is sent; UI shows “Nothing out of stock”.
- **If items are out of stock:** server sends email via Resend.
- **Recipients:** configured in environment variables (your spec named two family Gmail addresses).
- **Subject:** `Out of stock — [date]` (date in Israel timezone).
- **Body:** bulleted lines with quantity and product name (plain text and HTML).
- **Rate limit:** maximum one email per user per hour; second attempt within the hour shows a rate-limit message.
- **Feedback:** inline message “Sent”, “Nothing out of stock”, or “Could not send; try later”; message disappears after about 10 seconds.
- **No audit log** required per your spec.
- **Status:** Done

### 0.9 Backup and restore

- **Export Backup** — downloads all your lists and history as JSON.
- **Import Backup** — uploads JSON and restores data.
- Success message on export clears after about 10 seconds.
- **Status:** Done

### 0.10 Mobile and in-store UX

- **Mobile-first layout** — big buttons, readable text, works in the supermarket on phone.
- **Action buttons stack full-width** on small screens (Close Week, Delete List, Email out-of-stock).
- **Planned date row** separated from action buttons so nothing is cramped.
- **Category move on touch** — drag handle plus dropdown fallback (HTML drag-and-drop alone is unreliable on phones).
- **Add Item** shows “Please wait…” while saving.
- **One-hand / in-store polish** — basic structure done; further improvements based on real shopping feedback are **Pending** (see section 4.2).
- **Status:** Mostly Done

### 0.11 Cloud, database limits, and performance

- **Hosting:** Vercel (free tier).
- **Database:** Supabase Postgres (free tier).
- **Guardrails** to keep storage small and performance good on mobile:
  - Maximum 100 lists per user
  - Maximum 500 items per list
  - Maximum 80 characters per item name
  - Maximum 200 characters per notes field
  - History capped at 500 item entries
  - Lists older than 12 months are deleted automatically
- **Health check** at `/api/health` — confirms Supabase and session config without exposing secrets.
- **Status:** Done

### 0.12 Features you explicitly removed or deferred

**Removed by your decision:**

- List sharing between different user accounts — use one family account instead.

**Not fully implemented yet (from your spec and gap analysis):**

- **Advanced duplicate detection** — only exact normalized names match today; close variants like “Milk 3%” vs “Milk” are not detected.
- **Automatic calendar-week repeat tracking** — streaks only update on Close Week click.
- **Advanced in-store UX** — one-hand operation and flow polish still open for user feedback.
- **Real-time sync between two open browsers** — data persists on save, but there are no live websockets; refresh to see another device’s changes.

---

## 1. Security hardening

### 1.1 Hide internal error details from API responses
- **Priority:** High  
- **Status:** Partial  
- **What was recommended:** Return generic messages to the browser; log detailed errors on the server only.  
- **What was done:** Most routes return user-friendly messages. Unexpected failures still may include error text in some handlers.  
- **Still to do:** Audit all API routes and replace any remaining internal error text with a fixed generic message.

### 1.2 Rate-limiting on login and register
- **Priority:** Medium  
- **Status:** Done  
- **What was done:** Per-IP and per-username limits on login, register, and password reset. Too many attempts return HTTP 429 with a retry-after hint. Covered by automated tests.

### 1.3 Session invalidation after password change
- **Priority:** Medium  
- **Status:** Pending  
- **What was recommended:** Revoke old sessions when a password changes or on “logout everywhere.”  
- **Current behavior:** Sessions are stateless HMAC cookies. Old sessions stay valid until they expire (default 12 hours).  
- **Still to do:** Add a token version field per user, or a server-side session store, so password changes invalidate older cookies.

### 1.4 Password reset flow
- **Priority:** Medium  
- **Status:** Partial  
- **What was recommended:** Secure reset via email token with short expiration.  
- **What was done:** A reset-password API exists (username + new password, rate-limited). The UI has a “Forgot password?” path that calls it. This is suitable for a trusted family app, not a public email-based reset.  
- **Still to do (optional):** Email-based reset with one-time tokens if the app is opened to untrusted users.

### 1.5 Fail fast when SESSION_SECRET is missing in production
- **Priority:** Low  
- **Status:** Done  
- **What was done:** Production refuses to issue new sessions without `SESSION_SECRET`. Vercel Preview may use a dev fallback so preview URLs still work. Health check reports whether the secret is set.

### 1.6 Stronger Supabase type safety
- **Priority:** Low  
- **Status:** Pending  
- **What was recommended:** Replace `any` in the data layer with generated Supabase database types.  
- **Still to do:** Generate types from the schema and migrate the data layer gradually.

### 1.7 Keep Next.js and dependencies patched
- **Priority:** High  
- **Status:** Done (ongoing)  
- **What was done:** Upgraded Next.js from 16.2.1 to 16.2.6 to address known CVEs. Production audit was clean at time of review.  
- **Still to do:** Re-run `npm audit` periodically; upgrade when new advisories appear.

---

## 2. Reliability and operations

### 2.1 Health check for deployment diagnostics
- **Priority:** High  
- **Status:** Done  
- **What was done:** `/api/health` reports whether Supabase env vars are set, whether the database is reachable, and whether the session secret is configured. Overall `ok` is false when the database is down.

### 2.2 Clear error when Supabase is paused or unreachable
- **Priority:** High  
- **Status:** Done  
- **What was done:** Login returns HTTP 503 with a clear “database unavailable” message instead of a misleading “invalid username or password.” Database lookup errors are no longer treated as “user not found.”  
- **Lesson learned:** Supabase free tier pauses inactive projects. Unpause in the Supabase dashboard; wake-up takes about one to two minutes.

### 2.3 Prevent Supabase auto-pause
- **Priority:** Medium  
- **Status:** Pending (operational)  
- **Recommendation:** Use the app at least once a week, or upgrade the Supabase plan, so the project does not pause again.

### 2.4 Validate bad JSON on API routes
- **Priority:** Medium  
- **Status:** Done  
- **What was done:** Login, register, and state save now return HTTP 400 for malformed JSON instead of HTTP 500. Covered by tests.

### 2.5 Block broken deploys with tests in CI
- **Priority:** Medium  
- **Status:** Pending  
- **Recommendation:** Run `vitest run` before build (for example in a `prebuild` script or Vercel build step) so failing tests cannot reach production.

---

## 3. Automated testing

### 3.1 Expand test coverage beyond shopping helpers
- **Priority:** High  
- **Status:** Done (Tiers 1 and 2)  
- **What was done:** Test count grew from 10 to 72 tests across 9 files. Critical paths are covered: auth, rate limits, data ownership, login/register/state routes, email sending, out-of-stock email route.

### 3.2 Protect against cross-user data deletion
- **Priority:** Critical  
- **Status:** Done  
- **What was done:** Test verifies that deleting a list is scoped to the owner’s user ID, so one user cannot delete another user’s lists.

### 3.3 Tier 3 — UI and middleware tests
- **Priority:** Nice to have  
- **Status:** Pending  
- **What was recommended:** Tests for main page flows (login, add item, duplicate warning, close week) and middleware security headers. Requires React Testing Library and jsdom.

### 3.4 End-to-end browser tests (Playwright)
- **Priority:** Optional  
- **Status:** Pending  
- **What was recommended:** One or two smoke tests against a running dev server for full login-to-save flow.

### 3.5 Routes still without dedicated tests
- **Priority:** Low  
- **Status:** Pending  
- **Routes:** logout, me, reset-password, backup, digital-twin, health. These are mostly thin wrappers; health and reset-password are the most useful to add next.

---

## 4. User experience and mobile

### 4.1 Mobile-friendly action buttons
- **Priority:** Medium  
- **Status:** Done  
- **What was done:** Date row separated from action buttons. On small screens, action buttons stack full-width. Out-of-stock email button includes a mail icon for clarity.

### 4.2 One-hand / in-store flow polish
- **Priority:** Low  
- **Status:** Pending  
- **What was recommended:** Further UX improvements based on real shopping feedback (from Gap and deficiencies doc).

### 4.3 Advanced duplicate detection
- **Priority:** Low  
- **Status:** Pending  
- **Current behavior:** Warns on exact normalized name match only (case and spaces ignored).  
- **Still to do:** Detect close variants (for example “Milk 3%” vs “Milk”) if needed.

### 4.4 Automatic calendar-week repeat tracking
- **Priority:** Low  
- **Status:** Pending  
- **Current behavior:** Repeat streaks update only when “Close Week + Track Repeats” is clicked.  
- **Still to do:** Infer calendar weeks automatically if that matches how the family uses the list.

---

## 5. Documentation and housekeeping

### 5.1 Keep recommendation docs up to date
- **Priority:** Low  
- **Status:** Done (this file)  
- **Note:** The older `test_results_recomandation.md` (April 2026) is outdated — several items there are now implemented. **Section 0 of this file** captures your website product requirements (categories, in-cart/out-of-stock, email, etc.). Use this file as the current source of truth.

### 5.2 Remove or relocate sensitive local files
- **Priority:** Medium  
- **Status:** Pending  
- **Issue:** `out_of_stock.md` is untracked and contains an old rotated API key.  
- **Recommendation:** Delete it or move secrets out; keep only the feature spec in git if needed.

### 5.3 Project location
- **Priority:** Operational  
- **Status:** Done  
- **Recommendation:** Keep the active repo at `C:\Itamar\Projects\supermarket-weekly-list`. Do not store projects inside the Cursor install folder (previous path was lost after a Cursor update).

### 5.4 Original spec file
- **Priority:** Low  
- **Status:** Lost (partially recovered in Section 0)  
- **Note:** `website-spec.md.txt` from the old Projects folder no longer exists. Your product requirements are now summarized in **Section 0** of this file; remaining gaps are in `Gap and deficiencies.md`.

---

## 6. Cloud and secrets (reference)

- **GitHub:** Source code — `https://github.com/Itamarkon/supermarket-weekly-list`  
- **Vercel:** Live site — `https://supermarket-weekly-list.vercel.app`  
- **Supabase:** Database — project ref `ycbrlhlszuvdntiqqmjd`  
- **Local secrets:** `.env.local` (never commit)  
- **Production secrets:** Vercel environment variables (Production and Preview)  
- **Verify after deploy:** Open `/api/health` and confirm `supabaseReachable: true` and `sessionSecretSet: true`

---

## 7. Suggested priority order (what to do next)

1. **Operational:** Use the app weekly or upgrade Supabase so the database does not pause again.  
2. **Security:** Finish sanitizing API error responses (item 1.1).  
3. **CI:** Add test run to the build pipeline (item 2.5).  
4. **Security (optional):** Session revocation on password change (item 1.3) if multiple devices share accounts.  
5. **Testing (optional):** Tier 3 UI tests or Playwright smoke tests.  
6. **Housekeeping:** Remove `out_of_stock.md` or strip secrets from it (item 5.2).  
7. **Nice to have:** Supabase generated types (item 1.6), advanced duplicate detection, automatic week tracking.

---

## 8. Related documents

- **Section 0 (above)** — Website product specification: categories, statuses, email, lists, mobile UX  
- `test_results_recomandation.md` — Original April 2026 security review (partially superseded)  
- `TEST_PLAN.md` — Detailed test inventory and Tier 1–3 plan  
- `Gap and deficiencies.md` — Feature gaps and Phase 2 scope  
- `LOCAL_APP_CHANGES.md` — Plain-language summary of app changes  
- `CLOUD_SETUP.md` — Supabase and Vercel setup steps  
- `out_of_stock.md` — Original email feature notes (local only; contains old API key — do not commit)  
- `README.md` — Project overview and run instructions
