# Gap and deficiencies (Phase 2)

Phase 2 now includes:
- Register/login/logout with backend user accounts (case-sensitive usernames)
- Session cookie authentication
- Server-side persistent storage in Supabase Postgres
- Cross-device data access when using the same deployed backend
- Existing MVP features (categories, quantities, notes, duplicate warning, repeated-item suggestions, status colors, EU date display)
- DB guardrails for free tier (limits + 12 month retention)

## Unnecessary Ability

1. List sharing between different users
- Removed from UI and backend API based on your decision to use one shared family account.

## Not fully implemented yet

1. Advanced repeated-item logic
- Current logic tracks streaks only when clicking "Close Week + Track Repeats". It does not infer calendar weeks automatically.

2. Advanced duplicate handling
- MVP warns for exact normalized name duplicates. It does not detect close variants (for example "Milk 3%" vs "Milk").

3. Advanced UX polish
- Big buttons and mobile-friendly structure are implemented, but one-hand operation and in-store flow can be improved with user feedback.
