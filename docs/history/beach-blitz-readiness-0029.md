---
title: "Beach Blitz readiness: role board rule check, my shift on Home, weak-signal fallback, scouting retries"
date: 2026-10-28
branches: [main]
commits: []
migrations: ["0036_role_board_my_shifts.sql", "0037_scouting_observation_options.sql"]
subsystems: ["Event rosters", "Scouting", "Landing page and nav", "Connector", "PWA and login"]
---

Goal: the app is ready for Beach Blitz 2026 (TBA `2026cabl`, 42 teams, 4-team
alliances), from an audit of the live data, the code and how elite teams run
events.

## What changed

- **Role board rule check** (`src/roleRules.js`, `tests/role-rules.test.js`):
  Mr. Pina's rotation rules (2026-10-26) as one pure function, read by the
  role board page (staff panel "Rotation rules") and the connector's
  `role_board` read (`rule_issues`). One place at a time (field, stands, pit,
  roaming; pit roles share a person), no role outside the drive team more than
  two slots in a row on a day, everyone outside the drive team scouts (or
  leads scouting) at least once a day. Assigned only; it never blocks.
  Deliberately compares roles within one slot only: Friday's long Load-in
  slot overlaps the practice slots by design, and comparing by time overlap
  flagged every load-in helper.
- **My shift now or next on Home** (`src/roleBoard.js` `nextShift`,
  `src/doThisNow.js`, `src/HomePage.jsx`, migration 0036): "Now: Pit crew"
  (urgent) or "Next: Scout" (to-do) linking the role board, for events
  starting within two days. 0036 keeps an event in `role_board_open_events`
  while the caller holds an assigned slot (0031 dropped it once the board
  filled) and adds `next_shift_at`. Proof: `tools/sql-harness/check-0036.mjs`,
  9/9 with 0036 and 7/9 without it (the two 0036 claims fail).
- **Can't reach the team server** (`src/App.jsx` `ServerUnreachable`): a
  cold start whose claim fails with nothing held (weak venue signal, so
  `navigator.onLine` is true and the offline boot never runs) no longer shows
  the access request form. It offers Try again, and Open offline scouting when
  this device prepared offline scouting for the same member (decision 40,
  option B).
- **Scouting on weak signal** (`src/ScoutingPage.jsx`): every 60 seconds,
  waiting saves (local, or failed and retryable) are sent again; each keeps its
  operation id, so a retry the server already has is a no-op.
- **One spelling per qualification match** (`canonicalMatchKey` in
  `src/scouting/provenance.js`, used by `RecordForm.jsx`): "Q12", "q12" and
  "12" save as "qm12"; practice, playoff and full event keys are kept.
- **TBA key fills itself** in Manage event from the teams already imported
  (`importedMapKey`, the pit map's own rule), so re-running the import for the
  match schedule needs no typing.

- **Observation options** (migration 0037, `src/scouting/options.js`,
  `ObservationOptions.jsx`, `SuggestOption.jsx`): Mr. Pina asked that scouting
  cover passing, where a robot passes from, whether passing works, defense and
  phase shifts without hard-coding every question. The scouting lead (staff,
  `scouting.manage`, or the scouting lead of any event not yet over) turns
  options on, edits, reorders, retires and declines them; any scout suggests
  one, from the Scout tab or from inside an observation (carrying the team,
  match and note). On options show under "More to watch" on every observation,
  grouped by phase, with the built-in controls; answers live in
  `payload.custom`, absent when skipped, checked by
  `scouting_private.validate_custom` (validate re-defined from 0030 with
  exactly that addition). Team cards and both spreadsheets carry them. A type
  never changes once used and a used choice is never removed, so saved answers
  stay valid; retired options still validate for corrections. Proof:
  `0037_scouting_observation_options_rls_test.sql` 22/22 on the harness (with
  0022 72/72, 0027 17/17, 0030 27/27 and 0035 24/24 on top),
  `tests/scouting-options.test.js` and `tests/scouting-options-dom.test.js`.
  None were seeded on live: the lead chooses.

## Live findings (2026-10-28, via the connector, not code)

TBA, Nexus pits and the Nexus pit map all answer for `2026cabl` (pit D4);
Statbotics was down. Teams were not yet imported into the scouting event and
the qualification schedule was not yet posted. Batteries: 12 in the log, none
measured or charged. Autos: none logged. Drivers: none ranked.

## Not verified

The weak-signal screen was not driven in a browser (no fixture persona makes
claim_profile fail on a cold start); the build and the check-in and feature
E2Es cover that the shell still boots.
