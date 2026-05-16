# Test Plan — supermarket-weekly-list

**Status:** proposal, not yet implemented
**Author:** generated 2026-05-16 during a code health review
**Scope:** unit + API-handler tests written with Vitest. End-to-end browser tests are mentioned but kept out of scope.

---

## 1. Why this document exists

After fixing the Next.js CVEs (16.2.1 → 16.2.6, commit `03672dc`), I noticed how thin the test suite is and that you have no automated guard against silent regressions in critical code paths. This document captures concrete tests to add, grouped by priority, with the **specific bug each one would catch**.

The goal is not "more tests" — it's protection against regressions that would actually hurt:
- Data loss (autosave bug deletes the wrong list)
- Authentication weaknesses (token signing breaks, password check leaks timing)
- Email spam (rate limit broken, double-sends, blank emails)
- Cross-user contamination (a user nukes someone else's shared list)
- UI flows you care about breaking after a refactor

Every test below is justified by either (a) a known fragile code path in the current source or (b) a feature explicitly required by `website-spec.md`.

---

## 2. Current state

> **Update (2026-05-16):** Tier 1 has been fully implemented. The numbers below now reflect the state **after** Tier 1 landed. See Section 13 (Implementation log) for details.

| | Original (when doc was written) | Now |
|---|---|---|
| Test files | 1 — `app/lib/shopping.test.ts` | **5** |
| Tests | 10 | **38** |
| Source lines (rough) | ~2,400 across `app/` | ~2,400 |
| Source lines tested | ~125 (helpers in `shopping.ts`) | ~700 (helpers + auth + rate-limit + data layer + OOS route) |
| Coverage estimate | ~5 % | **~30 %** |
| Test runner | Vitest 3.2.4 | Vitest 3.2.4 |

### Still untested (gaps after Tier 1)

- API routes other than OOS email: `auth/login`, `auth/register`, `auth/logout`, `auth/me`, `auth/reset-password`, `state`, `backup`, `digital-twin`, `health` — addressed by **Tier 2**
- Email module (`app/lib/server/email.ts`) — dry-run safeguard, Resend payload — addressed by **Tier 2 tests 2.7-2.8**
- Middleware (`middleware.ts`) — security headers + CSP — addressed by **Tier 3 test 3.9**
- The entire UI (`app/page.tsx`, 1,087 lines) — addressed by **Tier 3 tests 3.1-3.5**

### Already addressed by Tier 1

- ✅ Auth library (`app/lib/server/auth.ts`) — token signing/verification, password hashing
- ✅ Rate limiter (`app/lib/server/rate-limit.ts`) — shared by login + register + email
- ✅ Data layer (`app/lib/server/data.ts`) — list ownership, item-limit enforcement
- ✅ Out-of-stock email route (`app/api/email/out-of-stock/route.ts`) — rate limit, status filter, HTML escape

---

## 3. Tests that already exist

The current suite is in `app/lib/shopping.test.ts`. All 10 tests are pure-function unit tests for helpers in `app/lib/shopping.ts` — they run in ~5 ms total and use no mocks or external services. They form the foundation the larger plan in Sections 5-7 builds on.

### Existing test inventory

| # | Test name | Function under test | What it verifies |
|---|---|---|---|
| E.1 | `normalizes names for duplicate detection` | `normalizeItemName` | `"  Milk "` → `"milk"` — trims whitespace and lowercases |
| E.2 | `detects duplicates ignoring case and spaces` | `hasDuplicateItem` | "Milk" already in the list → `true` for input `" milk  "` |
| E.3 | `returns search suggestions by prefix` | `getSearchSuggestions` | Typing "mi" returns `["milk", "mint"]` from the quick-items pool |
| E.4 | `returns 4-weeks repeated items sorted by streak` | `getRepeatedItemSuggestions` | Filters to entries with `weeksInRow >= 4` and sorts by streak length (descending) |
| E.5 | `formats date in European format` | `formatEuropeanDate` | `"2026-04-09"` → `"09/04/2026"`; empty string passes through unchanged |
| E.6 | `parses european date into iso` | `parseEuropeanDate` | `"09/04/2026"` → `"2026-04-09"`; rejects `"9/4/2026"` (no zero-pad) and `"32/01/2026"` (day out of range) |
| E.7 | `toggles In Cart status` | `toggleInCartStatus` | `pending → bought`, `bought → pending`, `out_of_stock → bought` |
| E.8 | `toggles Out of Stock status` | `toggleOutOfStockStatus` | `pending → out_of_stock`, `out_of_stock → pending`, `bought → out_of_stock` |
| E.9 | `applyCloseWeekHistory increments only items on list; leaves others unchanged` | `applyCloseWeekHistory` | Items on the closed list get `weeksInRow + 1`; off-list items keep their existing streak (the fix from web spec #7) |
| E.10 | `applyCloseWeekHistory adds new keys for first-time items` | `applyCloseWeekHistory` | A previously-unseen item appears as `{ weeksInRow: 1, totalTimes: 1 }` |

### What these tests buy you today

- **Duplicate detection works** — adding "milk" twice gets caught even with mixed casing or extra spaces (E.1, E.2)
- **Autocomplete returns sensible results** — prefix matching is correct (E.3)
- **The "repeated 4 weeks in a row" highlight feature** is contract-tested (E.4)
- **Date round-trip** between display format (DD/MM/YYYY) and storage format (YYYY-MM-DD) won't silently break (E.5, E.6)
- **Status toggle helpers behave correctly** — clicking Cart on an OOS item still moves it to Cart, clicking OOS on a Cart item moves it to OOS, etc. (E.7, E.8)
- **The streak-preservation fix from web spec #7 is locked in** — closing a week no longer resets streaks for items that weren't on the active list (E.9)
- **First-time items get tracked correctly** in history (E.10)

### What these tests do NOT cover (the gaps the plan below addresses)

- Anything involving cookies, sessions, or authentication — covered by Tier 1 tests 1.1–1.4
- Any rate-limiting behavior — covered by Tier 1 tests 1.5–1.6
- Any database operations or list ownership — covered by Tier 1 tests 1.7–1.8
- The out-of-stock email feature — covered by Tier 1 tests 1.9–1.12
- All 11 API routes — covered by Tier 2
- The 1,087-line `app/page.tsx` UI — covered by Tier 3
- Middleware security headers — covered by Tier 3 test 3.9
- Edge cases in `parseEuropeanDate` — test 3.8 notes that `"30/02/2026"` currently passes but shouldn't
- Edge cases in `applyCloseWeekHistory` with un-normalized inputs — test 3.6
- Edge cases in `getSearchSuggestions` deduplication — test 3.7

---

## 4. The plan, in three tiers

| Tier | Theme | Status | New tests | New deps |
|---|---|---|---:|---|
| **1** | Critical: protect core paths | ✅ **DONE** (2026-05-16) | 12 planned → 28 actually shipped | none |
| **2** | Important: API contracts | pending | 8 | none |
| **3** | Nice to have: UI + middleware + edge cases | pending | 10 | `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react` |
| (optional) | E2E with Playwright | pending | 2 | `@playwright/test`, `playwright` |

Total proposed: **30 tests** (~22 reachable with zero new dependencies). **28 of those are now in the repo** (Tier 1, including bonus tests).

---

## 5. Tier 1 — Critical ✅ DONE (2026-05-16)

> **Implemented.** All 12 planned tests are now in the repo, plus 16 bonus assertions discovered while writing them — 28 tests total across 4 new test files. See Section 13 for the file map. Run `npm test` to execute them.

The tests in this tier protect the highest-stakes code in the app. If something in here breaks silently, the consequences range from "users locked out" to "data loss" to "auth bypass."

### ✅ 1.1 `verifyToken` rejects tampered signature
**File:** `app/lib/server/auth.test.ts` (new) targeting `app/lib/server/auth.ts`
**Why:** The session cookie is a `payload.signature` pair. The function uses `crypto.timingSafeEqual` (`auth.ts:42`). If anyone refactors this to `===` or accidentally drops the comparison, attackers could forge tokens. This test calls `verifyToken("<valid-payload>.<bad-signature>")` and asserts it returns `null`.

### ✅ 1.2 `verifyToken` rejects expired tokens
**File:** `app/lib/server/auth.test.ts`
**Why:** The token's `exp` field is checked on `auth.ts:50`. A test that mints a token with `exp` in the past and asserts `verifyToken` returns `null` locks in the "expired = no session" guarantee. Cheap, high-signal.

### ✅ 1.3 `verifyPassword` returns true for correct password, false for wrong one
**File:** `app/lib/server/auth.test.ts`
**Why:** The scrypt-based hashing in `hashPassword` + `verifyPassword` is what makes the entire login flow safe. A round-trip test (hash a password, then verify both right and wrong inputs) ensures the algorithm wasn't swapped for `===` or a broken hash function during a refactor.

### ✅ 1.4 `verifyPassword` uses timing-safe comparison
**File:** `app/lib/server/auth.test.ts`
**Why:** `auth.ts:83` calls `crypto.timingSafeEqual`. We can't easily test timing, but we *can* test that two equal-length Buffers from the same scrypt computation pass and unequal-length inputs throw (which is what `timingSafeEqual` does). The test fails immediately if someone replaces the comparison with `===`.

### ✅ 1.5 `checkRateLimit` blocks after N attempts in window
**File:** `app/lib/server/rate-limit.test.ts` (new) targeting `app/lib/server/rate-limit.ts`
**Why:** The same in-memory limiter guards login, register, and email — all three routes share this single function. A test that calls `checkRateLimit("k", 3, 60_000)` four times and asserts the fourth returns `allowed: false` is the contract guarantee. Breaks immediately if the off-by-one in `rate-limit.ts:21` changes.

### ✅ 1.6 `checkRateLimit` resets after window expires
**File:** `app/lib/server/rate-limit.test.ts`
**Why:** With `vi.useFakeTimers()`, advance time past the window and assert the next call returns `allowed: true`. Catches the "locked out forever" bug if the windowing logic on `rate-limit.ts:16` breaks.

### ✅ 1.7 `saveUserState` keeps lists shared with the user but not owned by them
**File:** `app/lib/server/data.test.ts` (new) targeting `app/lib/server/data.ts`
**Why:** **This is the single highest-risk test in the suite.** `data.ts:347` computes `toDeleteIds = [...ownedIds].filter(id => !submittedOwnedIds.has(id))`. The `.eq("owner_id", userId)` on line 351 is what stops a user from deleting someone else's list. If that filter is ever removed or weakened, syncing a list with N items would silently delete every list the user has access to but doesn't own. The test sets up two users, simulates `saveUserState` for one, and asserts the other user's lists still exist.

### ✅ 1.8 `saveUserState` enforces `maxListsPerUser` and `maxItemsPerList`
**File:** `app/lib/server/data.test.ts`
**Why:** Defines `DB_LIMITS = { maxListsPerUser: 100, maxItemsPerList: 500 }` on `data.ts:39`. A buggy client (or a malicious POST) could otherwise insert hundreds of thousands of items and blow up the free-tier Supabase quota. Two tests: one with 101 lists (expects throw), one with a list of 501 items (expects throw).

### ✅ 1.9 OOS email returns 200 + `{empty: true}` when no items are out-of-stock
**File:** `app/api/email/out-of-stock/route.test.ts` (new)
**Why:** `route.ts:110` short-circuits with this exact response when the filtered list is empty. The spec says "no email if nothing is out of stock." A test that posts a list of `bought` items and asserts `empty: true` locks the behavior in — the alternative is an empty email arriving in your inbox.

### ✅ 1.10 OOS email returns 429 when user recently sent within rate-limit window
**File:** `app/api/email/out-of-stock/route.test.ts`
**Why:** `userRecentlySent()` on `route.ts:43` queries the `oos_email_sends` table for any row within the last 60 minutes. If the query is ever broken (wrong column name, wrong operator), the rate limit silently disappears and you can spam yourself. The test mocks the Supabase client to return a row, then asserts the response is `{ status: 429, error: "rate_limit" }`.

### ✅ 1.11 OOS email filters items to only `status === "out_of_stock"`
**File:** `app/api/email/out-of-stock/route.test.ts`
**Why:** `route.ts:103` does `.filter(item => item && item.status === "out_of_stock")`. A regression here could email *every* item including pending ones — and the spec is explicit that only OOS items should be in the email. Posts a mixed list, asserts only the OOS items appear in the rendered text/html.

### ✅ 1.12 OOS email HTML escapes special characters in item names
**File:** `app/api/email/out-of-stock/route.test.ts`
**Why:** `escapeHtml()` is defined on `route.ts:21`. A test that posts an item with name `<script>alert(1)</script>` and asserts the response HTML contains `&lt;script&gt;` (and **not** the raw tag) prevents reflected XSS in your own inbox — surprisingly easy to break if someone replaces the escape with template literals.

---

## 6. Tier 2 — Important

API contract tests. These run the route handlers directly with mocked auth + Supabase, then assert status codes and response shapes.

### 2.1 `POST /api/auth/login` returns 401 for bad creds, 200 + Set-Cookie for good
**File:** `app/api/auth/login/route.test.ts`
**Why:** The login contract — the most-exercised path in the app. Would have caught any silent breakage from the recent Next.js bump if there had been one.

### 2.2 `POST /api/auth/login` returns 400 (not 500) for empty body / malformed JSON
**File:** `app/api/auth/login/route.test.ts`
**Why:** I flagged this in the health check: the route currently returns 500 because `request.json()` throws on empty input (`login/route.ts:15`). Browsers never hit it, but it's a robustness gap. Writing the test forces the fix (wrap the parse in try/catch and return 400).

### 2.3 `POST /api/auth/register` returns 403 once user limit (5) is reached
**File:** `app/api/auth/register/route.test.ts`
**Why:** Hard-coded limit on `register/route.ts:42`. If the limit is ever increased without thought (or removed), Vercel's free tier could fill up unexpectedly. Test mocks `countUsers()` to return 5 and asserts 403.

### 2.4 `POST /api/auth/register` returns 409 on duplicate username
**File:** `app/api/auth/register/route.test.ts`
**Why:** Same as above but for the duplicate path on `register/route.ts:37`. Ensures unique-username UX stays intact.

### 2.5 `GET /api/state` returns 401 with no cookie, 200 with valid session
**File:** `app/api/state/route.test.ts`
**Why:** Exercises the full auth chain: cookie → token verify → user lookup → state response. If any link breaks, the home page won't load. Test mocks `getCurrentUser` to return `null` (asserts 401), then to return a user (asserts 200 + body shape).

### 2.6 `PUT /api/state` rejects payload with >100 lists with HTTP 400
**File:** `app/api/state/route.test.ts`
**Why:** Defensive guard on `state/route.ts:55`. Companion to test 1.8 but verified end-to-end through the route, not just the data layer.

### 2.7 `sendMail` in dry-run mode does NOT call `fetch`
**File:** `app/lib/server/email.test.ts` (new)
**Why:** Critical safety net for local dev. `EMAIL_DRY_RUN=true` is what stops your local machine from sending real emails when you `npm run dev`. Test uses `vi.spyOn(global, "fetch")`, calls `sendMail` with dry-run env, and asserts fetch was never called. Catches the day someone deletes the dry-run check.

### 2.8 `sendMail` throws clear errors when `EMAIL_FROM` or `EMAIL_TO` missing
**File:** `app/lib/server/email.test.ts`
**Why:** `email.ts:35-40` throws by design when config is missing. Test confirms both throws happen with the exact error messages — surfaces misconfigured deploys as loud failures, not silent no-ops.

---

## 7. Tier 3 — Nice to have

Needs UI testing dependencies (one-time setup, ~15 min). Skip until you change `page.tsx` significantly again.

### 3.1 Pressing Enter in the "Add Item" input adds the item
**File:** `app/page.test.tsx` (new)
**Why:** Web spec #7 item 3. Catches the form-submit-on-Enter regression we just fixed.

### 3.2 Close-Week confirmation message appears and disappears after 10 s
**File:** `app/page.test.tsx`
**Why:** Web spec #7 item 1. Uses `vi.useFakeTimers()` to fast-forward 10 seconds and assert the message disappears. The `setTimeout` in this flow is fragile under React 19 strict-mode double-invocation; a test pins the contract.

### 3.3 OOS email button is disabled while `isSendingOosEmail` is true
**File:** `app/page.test.tsx`
**Why:** Prevents double-clicks from triggering two backend sends. Test renders the page, sets `isSendingOosEmail`, asserts `disabled`.

### 3.4 OOS email shows a friendly message when no out-of-stock items exist
**File:** `app/page.test.tsx`
**Why:** UX guarantee in the spec — the user should see "Nothing to email" instead of nothing happening.

### 3.5 Clicking the Cart toggle in the UI flips `pending ↔ bought` (not OOS)
**File:** `app/page.test.tsx`
**Why:** The toggle helpers `toggleInCartStatus` / `toggleOutOfStockStatus` are unit-tested, but the wiring between the buttons and these helpers in `page.tsx` is not. A simple click test verifies the wiring.

### 3.6 `applyCloseWeekHistory` handles case-mixed and whitespace-padded names
**File:** `app/lib/shopping.test.ts` (extend existing)
**Why:** Existing tests use already-normalized inputs. A test that passes `["  Milk ", "MILK"]` and asserts they collapse to a single bumped entry would catch a normalization regression.

### 3.7 `getSearchSuggestions` deduplicates between quickItems and currentItems
**File:** `app/lib/shopping.test.ts`
**Why:** `shopping.ts:47` uses `Array.from(new Set(all))`. If that ever gets removed, the same item appears twice in autocomplete. One small test.

### 3.8 `parseEuropeanDate` rejects calendar-impossible dates (Feb 30, etc.)
**File:** `app/lib/shopping.test.ts`
**Why:** Current test on `shopping.test.ts:56` only checks day range 1-31. `parseEuropeanDate("30/02/2026")` currently succeeds and returns `"2026-02-30"`, which is wrong. The test (which would initially fail) forces a real calendar check.

### 3.9 Middleware sets all 5 security headers including the exact CSP
**File:** `middleware.test.ts` (new)
**Why:** `middleware.ts:6-13` sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and Content-Security-Policy. Past commit `f74e950` shows the CSP has been edited before to fix dead UI. A test pins the exact header values so a future "tweak" doesn't silently weaken security.

### 3.10 `/api/health` reports `supabaseConfigured: true` when env is set
**File:** `app/api/health/route.test.ts` (new)
**Why:** Cheap sanity check used during deploy verification. The Vercel deploy script calls `/api/health` to confirm the new build is live and DB-wired. A test ensures the JSON shape never changes accidentally.

---

## 8. Out of scope but worth considering

### E2E.1 Full happy-path browser test
**Tool:** Playwright (Chromium only)
**What:** Register → login → add 3 items → toggle one OOS → click email button → close week → check history was incremented. One test that exercises every layer end-to-end in a real browser.

### E2E.2 Mobile viewport snapshot
**Tool:** Playwright
**What:** Render the list at 375 × 667 (iPhone SE) and take a screenshot. Compared against a baseline image, this would automatically catch the kind of layout regression that just shipped (the mobile-polish commit `bc5a79e`) without you having to manually check on your phone.

These are powerful but add ~50 MB of browser binaries and ~30 min of setup. Worth doing only once you're touching this app weekly or want to ship faster with less manual QA.

---

## 9. Setup required

### For Tiers 1 & 2 (no new dependencies)

These tests use only Vitest's built-in `vi.mock()` to stub Supabase, `next/headers` (cookies), and `next/server`. One new helper file:

- `app/lib/server/__mocks__/supabase.ts` — small in-memory fake of the Supabase admin client that returns canned rows. Used by every data-layer + route test.

Expected one-time effort: **30-45 minutes**.

### For Tier 3 (UI tests)

Run once:

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react
```

Then update `vitest.config.ts` to use the `jsdom` environment and the React plugin. Expected one-time effort: **15 minutes**.

### For E2E (optional)

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Plus a `playwright.config.ts` and a `tests/e2e/` folder.

---

## 10. Suggested rollout order

1. ✅ **PR 1 — Tier 1.** Done (2026-05-16). Brought the repo from 10 → 38 tests; locked down the highest-risk code paths. Took ~30 minutes of focused work.
2. **PR 2 — Tier 2.** Next up. Adds API contract coverage. Includes fixing the `400 vs 500` empty-body bug as a side effect of test 2.2. Est. 1-2 hours.
3. **PR 3 — Tier 3 (optional).** Only if you change `page.tsx` significantly again. Est. 2 hours including UI test setup.
4. **PR 4 — E2E (optional).** Only if you start shipping more frequently and want a deploy-blocker test. Est. 1-2 hours.

After Tier 1+2, coverage estimate will jump to roughly **35-45 %** of meaningful code paths (raw line coverage will look lower because `page.tsx` is huge and intentionally untested at that stage).

---

## 11. Tests I deliberately did NOT include

- **Test `getSupabaseAdmin()` directly** — it's a thin singleton wrapper. Low value.
- **Test `formatEuropeanDate("")` returns `""`** — already covered.
- **Snapshot tests of full rendered HTML** — they break on every CSS tweak and you end up regenerating snapshots blindly. False sense of security.
- **Test the Drag & Drop reordering** — useful but very fragile; better verified manually.
- **Test `DigitalTwinChat`** — it's an experimental feature you're not actively using.
- **100 % branch coverage** — chasing a number, not a goal.

---

## 12. Open questions for you

1. ~~**Which tier do you want to start with?**~~ Tier 1 — done.
2. **Should I include the test for the `400 vs 500` empty-body bug (2.2) and also fix the underlying handler in the same PR?** That's the cleanest pattern: failing test → fix → passing test. Still open for Tier 2.
3. **Do you want Playwright E2E now or later?** My vote: later. Still open.

When you're ready for Tier 2, point at it (or specific test numbers) and I'll implement them.

---

## 13. Implementation log

### 2026-05-16 — Tier 1 shipped

**Result:** 10 → 38 tests, all green. ESLint clean, `tsc --noEmit` clean, production build unaffected.

**Files added**

| File | Tests | Covers |
|---|---:|---|
| `app/lib/server/auth.test.ts` | 9 | Tests 1.1-1.4 plus bonus cases (positive token verify, malformed inputs, unique salts) |
| `app/lib/server/rate-limit.test.ts` | 6 | Tests 1.5-1.6 plus retry-after shrinkage, per-key isolation, `getClientIp` parsing |
| `app/lib/server/data.test.ts` | 4 | Tests 1.7-1.8 plus no-op delete when nothing dropped, per-list 500-item limit |
| `app/api/email/out-of-stock/route.test.ts` | 9 | Tests 1.9-1.12 plus 401 unauth, DB record on success, no-record on send failure, 400 on missing listId, list-title HTML escape |
| `app/lib/server/__test__/supabase-mock.ts` | (helper) | Chainable, recording Supabase admin stub. Reused by data + OOS tests |

**Files modified**

| File | Change |
|---|---|
| `app/lib/server/auth.ts` | Exported `createToken` and `verifyToken` (with `// Exported for tests; not part of the public route surface.` comment). Logic unchanged. |
| `vitest.config.ts` | New file. Wires the `@/*` path alias so tests can mirror app-style imports. |

**Why 28 tests instead of 12**

While writing the planned tests I added 16 bonus assertions where the marginal cost was near zero and the marginal value was real (positive-path token verify, salt uniqueness, retry-after shrinkage, per-key isolation, etc.). The plan in Sections 5-7 lists the originally-scoped tests; the actual files include those plus the bonuses.

**No new dependencies.** Used only Vitest's built-in `vi.mock` + `vi.hoisted` + fake timers.

**Test infrastructure design choice.** The Supabase mock in `app/lib/server/__test__/supabase-mock.ts` is a chainable PromiseLike that records every method call. Tests assert on the recorded call chain rather than on mocked data state — that's how test 1.7 catches the specific regression where the `.eq("owner_id", userId)` guard would be removed from `data.ts:351`.

**Critical test highlight.** Test 1.7 verifies that when a user removes a list from their state, the resulting DELETE on `shopping_lists` includes both `.in("id", [<dropped>])` and `.eq("owner_id", userId)`. Without that constraint, the same DELETE would also remove lists *shared with* the user but owned by someone else. This is the single highest-stakes guarantee in the suite.
