# 26 Should a numbered migration re-pin profiles.geofence_exempt, the Offseason 2026 and Biocore 2027 season rows, and the three order-dependent frozen objects, so a fresh install matches live? And what is Biocore 2027's end date?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, items 53, 54 and 55) and the overnight session's fixture work
- Status: open
- Default if nobody decides: **nothing is written, and none of the three
  order-dependent frozen files is ever re-run on live.** Before any re-pin
  migration, Mr. Pina runs three read-only checks:
  `select column_name from information_schema.columns where table_name = 'profiles' and column_name = 'geofence_exempt';`,
  `select name, start_date, end_date from seasons order by start_date;` and
  `select pg_get_constraintdef(oid) from pg_constraint where conname = 'events_kind_check';`.
- Decided: --

## What is actually true right now

- `profiles.geofence_exempt` is read by both check-in pages and the roster, and
  no SQL file in the repo creates it. The check-in pages ignore an error on
  that read, so a missing column would silently geofence an exempt student.
- No repo SQL creates Offseason 2026 (ends 2027-01-06) or Biocore 2027 (starts
  2027-01-07); `supabase/seasons.sql` seeds only 2025. The only SQL for them,
  inside `hours_types_build_plan.md`, fails against the frozen table (no unique
  key on `name`, and `end_date` is NOT NULL).
- Biocore 2027's end date is recorded nowhere in the repo. If its row is
  missing live, the member application gate does not fire on 2027-01-07.
- Re-running three frozen files would silently undo later work:
  `categories_reduce_event_kind.sql` re-pins the event-kind check without
  `training`; `study_sessions.sql` re-creates `app_settings` without
  `updated_at`; `domain_roster_gate.sql` re-creates `claim_profile` without its
  whitelist branch and `admin_get_members` without `nickname`. Measured on the
  harness in documented order.

## The options

**A. One idempotent migration (S, once the end date is known).** `add column
if not exists geofence_exempt boolean not null default false`; season inserts
guarded by `where not exists`; each order-dependent object re-created in its
final shape; plus a "never re-run" header on the three files and an event-kind
case in `tests/vocabulary-drift.test.js`. A no-op on live where everything
already exists.

**B. Leave it.** Fresh installs and the test harness keep diverging from live,
and nothing records the rows the season logic depends on.
