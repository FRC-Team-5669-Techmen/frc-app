---
title: "Event rosters: roles and eligibility, event-day attendance, conflicts, the family sign-up rule, the carpool lock (0016)"
date: 2026-10-19
branches: [main]
commits: []
migrations: ["0016_event_rosters.sql", "0016_event_rosters_rls_test.sql"]
subsystems: ["Event rosters", "Event family hub", "Standing", "Testing"]
---

Round 3 of building every app feature the member handbook describes (ledger
0011). **0016 has not been applied to the live project.** The design is in
`docs/subsystems/rosters.md`.

## Decisions taken here

- Eligibility is checked at assignment AND daily before the event, as the
  handbook says it is checked when the event starts; a role found ineligible
  is reported to the admins, never silently dropped.
- A missed competition day without an approved absence opens meetings
  probation (Section 4: missing a day "puts you on probation"; the kind is
  not named, and meetings is the attendance standard).
- The carpool lock is a trigger, so every path into seats and cars (family,
  staff, the hub functions) obeys it without editing the hub functions.
- The hub block is guarded: 0016 pastes cleanly whether or not the hub is
  applied.

## Proof

- 0016 test 17/17 with the hub migrations applied, every other SQL test on
  the harness still green (370 of 371 before renaming the lock function out of
  the hub naming check, then 253/253 across the hub set);
  `mutants-0016.mjs` 14/14 caught; `tools/e2e/features/rosters.mjs` 27/27.
