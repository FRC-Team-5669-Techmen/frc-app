---
title: "Scouting: redundant pairs, super scouts, match-number shifts and practice with no event (0030, ledger 0022)"
date: 2026-10-23
branches: [local/scoutops]
commits: []
migrations: ["0030_scouting_shifts_super.sql", "0030_scouting_shifts_super_rls_test.sql"]
subsystems: ["Scouting", "Fixture mode", "Connector"]
---

Built on 9a82206 in a local worktree for the coordinator to land on main; nothing was pushed or fetched. The brief asked for how elite FRC teams scout: one scout per robot or redundant pairs, super scouts on each alliance, shifts written as match numbers, and practice that works before any event exists, because members were told to practice the same afternoon.

Pairs needed no SQL: 0022's assignment index was already unique per assignee. The planner gained a coverage mode (one per robot, two per robot at 12 or more scouts, or auto) and `pairs.js` reconciles each team/match watched by two or more scouts: counts and ratings averaged, flagged beyond 10 FUEL or 1 rating point or on differing decisive answers. For two scouts that average is the median the team summary already used, so the figures cannot disagree; the spreadsheet download adds a pairs CSV.

Super scouts are an observation role rather than a new record kind, to avoid altering the live table's kind constraint and re-defining `scouting_save`; author-only correction and the uniqueness index carry over unchanged. The cost is that every quantitative reader must drop them, so the exclusion lives once in `model.js currentObservations` (plus coverage and the planner), with a permissive mutation of that filter turning `tests/scouting-shifts.test.js` red. A super assignment is one row per alliance carrying its alliance and teams.

The shared current match is a small table reached only through two security-definer functions, so a +1 is an atomic server bump rather than a versioned record that two leads could conflict on. Before 0030 is pasted the panel says so; super saves are refused by the old validate.

During the work a DOM test (`previews a pasted schedule`) began failing because the remount clicked Preview before the eligible roster arrived; the extra current-match request moved the timing. The test now waits for the roster as a lead would. One scouting E2E run reported a single 1440 console error ("object is not iterable") that did not reproduce on the next run; its source was not found.

Gate on the committed tree (2026-10-23, about 11:35 to 12:15 PT): `npm run build` passed; `npm test` 83 files, 1168 tests passed; `npm run ds:audit` ok (79 components, 315 files); `npm run discord:calendar:test` 19/19; `npm run history:verify` lossless; `npm run test:checkin` 51/51; `npm run test:features` 2000/2000 (scouting 234/234). `node tools/sql-harness/run.mjs`: 708/709, 0030's test 27/27; the one failure is `0028_role_interest_board_rls_test.sql` #3 (`invalid input syntax for type uuid: "beach_blitz_2026"`), which fails identically with 0030 left out, so it predates this work. `mutants-0030.mjs`: 13/13 caught.

Not verified: the live database (0030 not applied anywhere but the disposable harness), real phones, a real event running late, and two leads bumping at the same moment against hosted PostgREST.
