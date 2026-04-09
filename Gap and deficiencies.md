# Gap and deficiencies (Phase 2)

Phase 2 now includes:
- Register/login/logout with backend user accounts (case-sensitive usernames)
- Session cookie authentication
- Server-side persistent storage in Supabase Postgres
- Cross-device data access when using the same deployed backend
- Sharing a list with another registered user by username
- Existing MVP features (categories, quantities, notes, duplicate warning, repeated-item suggestions, status colors, EU date display)
- DB guardrails for free tier (limits + 12 month retention)

## Not fully implemented yet

1. Advanced sharing workflow
- Sharing is by exact username only. There are no invitation links, pending requests, permissions (view-only/editor), or "remove member" UI yet.

2. Real-time collaboration
- Shared changes are persisted quickly, but updates are not live-streamed in real time between users without refresh/reload cycles.

3. Advanced repeated-item logic
- Current logic tracks streaks only when clicking "Close Week + Track Repeats". It does not infer calendar weeks automatically.

4. Advanced duplicate handling
- MVP warns for exact normalized name duplicates. It does not detect close variants (for example "Milk 3%" vs "Milk").

5. Advanced UX polish
- Big buttons and mobile-friendly structure are implemented, but one-hand operation and in-store flow can be improved with user feedback.
