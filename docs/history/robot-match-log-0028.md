---
title: "Robot match log: import, views, connector"
date: 2026-10-28
branches: [main]
commits: []
migrations: ["0038_robot_match_log.sql"]
subsystems: ["Robot match log", "Match simulator", "Battery log", "Driver leaderboard", "Connector", "Landing page and nav"]
---

Goal: every match Team 5669's robot plays, practice or real, becomes one
record in the app that joins what the robot measured with what people saw,
readable by Claude, before Beach Blitz (Oct 30 to Nov 1).

## The audit

- **Match Sim** (`MatchSimPage.jsx`, `matchSim.js`, `sim_save_match` in
  0028): people's fields only (crew, battery, routine, alliance, FUEL counts,
  TOWER, voltages, brownout, notes). It writes an `auto_runs` row and a
  `battery_runs` row (practice match) when a routine or battery is set, and no
  drive session. `/robot` counted `sim_matches` only.
- **Linked rows:** `battery_log_run` (0026) and `driver_log_session` (0029)
  are the write paths; `driverScore.js` counts every non-voided drive session's
  minutes by kind.
- **Connector:** a new `.rpc` or `writeVia` call gets a generated entry on
  `npm run connector:build`; named tools are hand entries in
  `tools/connector/registry/tools.yaml` with runners in
  `api/_lib/connector/tools.js`.
- **The Blue Alliance:** `scouting-import` already stores `official_results`
  (alliance score, `score_breakdown`, by match key and alliance) on team
  records, so 0038 reads team 5669's.
- **Migrations:** `migrate.yml` applies new numbered files on push (0036 and
  0037 were applied that way the same day).
- **The robot repo** has the schema and the sample file but no
  `match-data/matches/` folder yet: the first real files arrive when the
  driver station laptop runs Sync Match Data.

## What was built

- **One table, not an extension of `sim_matches`:** `robot_matches`, with a
  trigger and a backfill so every Match Sim save is also a row, and an import
  that merges a file into the one Match Sim row it matches (5 minutes, same
  alliance). The Match Sim page and its rows are untouched.
- Import (GitHub pull and dropped files, preview with name confirmation and
  routine creation), log with filters, detail, trends, compare, the Robot hub
  tile, the Match Sim link, the `robot.matches` capability, five connector
  tools and a `robot_match` resolver. Details:
  `docs/subsystems/robot-matches.md`.
- Also touched beyond the prompt's list, because a test requires it:
  `src/permissions.js` and `tests/permissions.test.js` (the capability
  mirror), `src/featureGuide.js` and `src/dev/fixture/routes.js` (every route
  listed), `tools/e2e/features.mjs` and its README (the spec runs in the
  gate), `tools/connector/registry/functions.yaml` (the functions' words),
  `api/_lib/connector/resolve.js`, `supabase/migrations/README.md`, and one
  What's new entry in `src/updates.js`.

## Proof

- `0038_robot_match_log_rls_test.sql`: 21/21 on the SQL harness.
  `tools/sql-harness/mutants-0038.mjs`: 9/9 permissive mutants caught.
- `tests/robot-matches.test.js` 24, `tests/robot-matches-connector.test.js` 10.
- `tools/e2e/features/robot-match.mjs`: 92/92 at 375 and 1440.
- Not verified here: the live database, live RLS and the real GitHub folder
  (stubbed in the E2E; it does not exist yet). `verify:browser` boots only the
  `/_ds` specimen with no sign-in, so no route spec was added for these pages.

## Decisions owed to Mr. Pina

- **Decision 52:** should match performance count toward the Driver Score?
  Default no; trends only.
- Who gets `robot.matches` (drive-team leads). Staff can import today.
