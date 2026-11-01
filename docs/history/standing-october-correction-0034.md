---
title: "Standing: the October probation correction"
date: 2026-11-01
branches: [main]
commits: []
migrations: ["0044_standing_october_correction.sql", "0045_standing_october_correction_mail.sql"]
subsystems: ["Member standing"]
---

What happened (2026-11-01, 5:10 AM): the daily `standing_evaluate` judged
October for the first time. October held one counted meeting after
`standing_settings.starts_on`, and `_member_meetings` (0025) counted a member
present only from a `meeting_checkins` scan or a mentor's manual IN inside
that meeting. No member had either, so all 27 judged students scored 0 of 1,
all 27 got meetings probation, and `notice-mail` sent 54 mails (each student
and every parent address) between 5:20 and about 5:35 AM. Families replied
that they would talk to their son or daughter.

## What 0044 changed

- A member whose session is already open when a meeting starts (newest
  attendance event at or before the start is an IN under 12 hours old,
  `_session_open_at`) counts present. The old rule needed a second tap during
  the meeting's first 15 minutes, which members already signed in never make.
- A meeting where no attendance was taken at all (no check-in scan, no IN
  during it, nobody signed in at its start, `_meeting_recorded`) is left out
  of every count. A blank record no longer reads as everyone absent.
- `standing_evaluate` is now a wrapper around the 0015 run (renamed
  `_standing_evaluate_run`, closed to clients). It runs it in a subtransaction
  and rolls the whole run back when it would open probation or propose
  removal for more than `standing_settings.hold_over_pct` percent of judged
  members (default 25, never fewer than 3). Nothing reaches a member or a
  family; every admin gets one `standing_hold` notice, at most one per 20
  hours. Null turns the hold off.
- The correction, once: the 27 meetings probations dismissed with no
  per-member notice, the October `standing_months` rows and the in-app
  "Meetings probation started" notices removed, any unsent copy of that mail
  marked withdrawn, `starts_on` moved to 2026-11-02 so the first judged week
  is Nov 2 to 8 (judged Nov 9).

## Evidence

- `node tools/sql-harness/run.mjs --tests supabase/migrations/0044_standing_october_correction_rls_test.sql,supabase/migrations/0025_absence_handbook_rls_test.sql,supabase/migrations/0015_member_standing_rls_test.sql`:
  11/11, 13/13, 26/26 (2026-11-01).
- `mutants-0044.mjs`: 8/8 caught (2026-11-01).

## Not verified here

- The live rows. The cloud container cannot reach the production database;
  the Migrate run applying 0044 and the live `/standing/team` page are the
  check.
- The correction mail (0045): one per address that got the probation mail,
  queued in `notice_outbox` and sent by `notice-mail` from the same address.
  Mr. Pina approved the text on 2026-11-01 ("Nothing changes for him" became
  "Nothing changes", since some students are girls). Whether it was sent is
  read from his mailbox, not from this file.
