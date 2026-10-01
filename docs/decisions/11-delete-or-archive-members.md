# 11 Should a member who has attendance history ever be hard-deleted, given that the audit trail references them?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 57)
- Status: open
- Default if nobody decides: **unchanged.** The roster's Delete runs
  `admin_delete_member`, which fails with a raw foreign-key error for any member
  whose attendance was ever corrected, and succeeds for the rest. A session
  asked to build this builds option A.
- Decided: --

## What is actually true right now

- `admin_delete_member` (`supabase/admin_member_management.sql`) nulls 15 actor
  columns, then deletes the profile. Eight foreign keys are neither nulled nor
  cascaded, among them `attendance_audit.member_id` and `.actor_id`,
  `hour_adjustments.created_by`, `hour_goals.updated_by` and four
  `reviewed_by` columns.
- Measured on the harness: deleting a student whose attendance staff had
  corrected, or the mentor who corrected it, raised an `attendance_audit`
  foreign-key error. A member with no audit rows deleted cleanly.
- About 24 tables cascade from `profiles`. The confirm dialog names 6 kinds of
  data and gives no counts.
- The fixture mode's emulation of the RPC succeeds where the database refuses.
- Every staff correction writes an audit row, so more members become
  undeletable over time.

## The options

**A. Archive by default (M).** Hard delete only never-approved or pending
accounts; everyone else is archived (blocked plus alumni, decision 07), so
audit rows survive. The dialog lists per-table counts from a preview RPC.

**B. Make delete work by nulling or cascading the eight keys (S to M).**
Destroys who-did-what in the audit trail, and silently changes survey
aggregates and the feedback inbox.

**C. Do nothing.** Delete fails with a raw error for most real members, and the
only way out is the SQL editor.
