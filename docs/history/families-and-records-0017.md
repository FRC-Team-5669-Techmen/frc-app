---
title: "Families and records: the family link, emergency information, driver documents, the checklist, training, boards, handbook versions, letter progress (0017)"
date: 2026-10-19
branches: [main]
commits: []
migrations: ["0017_families_and_records.sql", "0017_families_and_records_rls_test.sql"]
subsystems: ["Families and records", "Standing", "Check-in", "Handbook", "Parent dashboard", "Testing"]
---

Round 4, the last of building every app feature the member handbook
describes (ledger 0012). **0017 has not been applied to the live project.**
The design is in `docs/subsystems/families-and-records.md`.

## Decisions taken here

- The family link reuses `parent_token`: one private credential per family,
  already emailed by the parent response flow, replaced on request.
- Parents sign the handbook from the family link (`parent_acknowledgments`),
  which closes the "parents sign on paper" gap; a paper signature is still
  ticked by a mentor.
- A staff view of a driver document is enforced, not trusted: the storage
  read policy requires a logged view in the last two minutes.
- The checklist and training deadlines only PROPOSE removal; Mr. Pina
  confirms, as for every removal.
- The student does not read their own emergency information (Section 9:
  only staff mentors see it); the parent who keeps it current does.

## Proof

- 0017 test 19/19; every SQL test on the harness green with 0001 to 0017;
  `mutants-0017.mjs` 19/19 caught (two mutants first MISSED: the delete check
  was masked by the read policy in the test's subquery and the deadline check
  by the training path; both checks were tightened).
- `tools/e2e/features/families.mjs` 59/59 at 375 and 1440, both migration
  states.

## Not built

- Discord notices and removing the Discord role on removal (no Discord
  account is linked to a member).
- An offline copy of the emergency sheet beyond printing it.
- Suspending a station certification: certifications are awarded and
  suspended only in IDEA Classroom.
