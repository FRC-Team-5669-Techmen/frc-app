# 17 Should students see what changed (a short update log), the status of their own reports, or both?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 73)
- Status: open
- Default if nobody decides: **neither exists, and nothing is built.** A session
  asked to work here builds a static update log (a JSON file rendered at
  `/updates`, linked from the avatar menu) with a standing rule that every
  student-facing change appends one dated, student-readable line. No
  per-reporter status view, because that needs an RLS change.
- Decided: --

## What is actually true right now

- A reporter cannot read their own report: the feedback select policy is
  admin-only (`supabase/feedback.sql`).
- The widget says "Sent. Thank you." and gives no reference.
- Status moves are visible only to admins.
- idea-app keeps a student-readable update log under a standing rule and shows
  it in class.

## The options

**A. An update log only (S to M).** Closes the loop for everyone at once.

**B. Each reporter sees the status of their own reports (M plus RLS).** Needs a
select-own policy on `feedback` that must not expose screenshots of other
members' data.

**C. Both.**

**D. Neither.** Students re-report, or stop reporting.
