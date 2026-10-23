---
title: "Connector: every member attendance in one read, and a bulk status change (0032, ledger 0024)"
date: 2026-10-23
branches: [local/conn]
commits: []
migrations: ["0032_connector_team_reads.sql", "0032_connector_team_reads_rls_test.sql"]
subsystems: ["Connector", "Roster", "Hours and attendance", "Testing"]
---

One solo session, ledger entry 0024, run as a subagent in a local worktree
(branch local/conn, based on c6b19f5) that the coordinator lands. Mr. Pina
asked the connector for the members to take off the roster (about 61
students, many who never came) and it could not answer: the only attendance
read was `member_hours`, one member at a time.

## What shipped

- **0032** adds `team_attendance_summary(p_since date default null)`, staff
  only, SECURITY DEFINER, one row per profile plus one per approved email that
  never made an account: names, email (the `auth.users` join
  `admin_get_members` uses), roles, status, approved, joined, signed-in hours
  all time and since the date, check-ins, first and last check-in, verified
  logged hours, this season application, trip invites and family answers, and
  `auth.users.last_sign_in_at`. Hours are `public._member_hours` (0015)
  called as is, so the closed-session, 12-hour cap, FLL and void rules are the
  existing SQL copy of the pairing rule; nothing new pairs check-ins. Check-ins
  are a count of IN events, not sessions, for the same reason.
- **0032** adds `admin_set_member_status_bulk(p_members uuid[], p_status, p_reason)`,
  admin only: each member through `admin_set_member_status` (0019, the roster
  page path), one `member_admin_log` row per member actually changed (the
  action check gains `set_status`), answering changed, unchanged and not found.
  Refuses the caller own account, a status outside active, inactive, alumni,
  a blank reason and more than 200 members.
- Connector tools `team_attendance` (read; role, status, min and max hours, no
  check-in since a date, since, include all, sort, limit) and
  `set_member_status` (confirm, no reverse; every name resolved first by the
  new `resolveMembers`, so one unknown or ambiguous name writes nothing for
  anyone; the preview carries every name).

## Measured (2026-10-23, this container)

- `0032_connector_team_reads_rls_test.sql`: 19/19, first run. Both gating
  directions: admin and mentor read, student, parent-only and signed out
  refused; admin changes, mentor and student refused with nothing changed.
- `mutants-0032.mjs`: 13/13 caught (each gate widened, an anon grant, the
  since window, the verified filter, the parent-only mark, the accountless
  rows, the own-account, status and reason refusals, the already-so skip).
- `proof.mjs` with the bulk write as a hand sample: 1364/1364.
- `tests/connector-team-attendance.test.js`: 8 tests in the 103 connector tests.

## Not verified

Nothing here touched the live project. Whether 0032 is applied is answered
only by querying it (`to_regprocedure('public.team_attendance_summary(date)')`).
The harness `auth.users` stub gained `last_sign_in_at`; the real table has it,
but that was not checked against the live catalog from here. The season
application column takes the season spanning today (else the latest started),
which is how `src/seasons.js` reads it; a test that an application in another
season does not count was not written (the fixture needs a full application
row), and no mutant covers that clause.
