# 16 How should a new feedback report reach Mr. Pina: a count on Readiness, a weekly staff Discord message, or an email digest?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 62)
- Status: open
- Default if nobody decides: **unchanged: the only signal is the count beside
  Feedback in the admin avatar menu.** It counts New reports and, before
  migration 0002, Open ones. A session asked to work here builds a New count on
  Readiness (with the Readiness rebuild, audit item 49) plus a weekly message to
  a staff-only Discord channel that names counts and routes, never reporters or
  message text.
- Decided: --

## What is actually true right now

- `src/FeedbackPage.jsx` says it plainly: nothing on that page notifies anyone.
- The admin badge is refreshed on navigation. `readiness_summary` has no
  feedback count.
- The six reports this repo's first round closed (`docs/feedback/2026-10-01/`)
  were filed between 2026-09-03 and 2026-09-23 and picked up on 2026-10-01: the
  oldest had waited 28 days, and four were Mr. Pina's own.
- A Discord send path now exists (`discord-announce`, migration 0003), admin
  only and not yet deployed (decision 35).

## The options

**A. A Readiness count only (S).** Seen when someone looks.

**B. A weekly staff-channel Discord message, with A (M).** Needs a staff-only
channel and the announce path live.

**C. An email digest (M).** The Gmail secrets already exist for the approval
email.

**D. Do nothing.** A student who reports something waits weeks with no sign it
was seen.
