---
title: "Member standing: absences, the weekly and monthly checks, probation and removal, records and notices (0015)"
date: 2026-10-19
branches: [main]
commits: []
migrations: ["0015_member_standing.sql", "0015_member_standing_rls_test.sql"]
subsystems: ["Standing", "Check-in", "Parent dashboard", "Testing"]
---

Round 2 of building every app feature the member handbook describes (ledger
0010). **0015 has not been applied to the live project and `notice-mail` is
not deployed.** The design is in `docs/subsystems/standing.md`.

## Decisions taken here, each from the handbook text

- Removal is automatic only as far as a PROPOSAL: Section 11 says probation
  starts automatically and that Mr. Pina confirms every removal each month,
  so the member is taken off the roster at his confirmation and not before.
- Nothing is judged before the Monday after the paste. Meeting check-ins exist
  only since 0014; judging earlier weeks would put every member on probation.
- A week is fully excused when it is a break week or every meeting in it was
  excused. A late is not a miss for the on-probation rule; three lates count
  as one absence in the monthly share.
- The next school day for an emergency request is the next weekday; school
  holidays are not known to the app.
- A competition counts as a mandatory event for absence requests, as Section
  4 says every competition day is mandatory.

## Proof

- `0015_member_standing_rls_test.sql`: 26/26 on the SQL harness with 0004,
  0014 and 0015, including the evaluation chain (two short weeks: hours
  probation, then a removal proposal) and idempotency. `mutants-0015.mjs`
  18/18 caught.
- `tools/e2e/features/standing.mjs` 69/69 at 375 and 1440, both migration
  states; `tests/standing.test.js` holds the hours rule's cap and exclusions
  to the client's.

## Not built

- Discord notices and the Discord role on removal: no member's Discord
  account is linked in the app.
- School holidays in the emergency deadline.
