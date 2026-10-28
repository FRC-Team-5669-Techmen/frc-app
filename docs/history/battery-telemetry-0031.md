---
title: "Battery telemetry: robot-measured power on the match log and the battery board"
date: 2026-10-28
branches: [main]
commits: []
migrations: ["0041_battery_telemetry.sql"]
subsystems: ["Battery log", "Robot match log", "Connector", "Fixture mode"]
---

Goal (Mr. Pina, 2026-10-28): the robot (FRC-Team-5669-Techmen/2026-5669-Official,
`subsystems/PowerMonitor.java`, `power/BatteryEstimator.java`) now measures every
match whether a brownout was the battery or the robot, and keeps a history per
battery in `match-data/battery-history.csv`. The battery board must make worn
batteries and robot wiring problems obvious at a glance. Ledger 0031, solo, one
push to main.

## What was already there, and what the prompt claimed

Checked against the tree before building. True: 0038 (`robot_matches`,
`robot_match_import`, `battery_log_run` once per file), the connector tool
`import_robot_matches_from_github`, the battery board (`/batteries`,
`src/batteries.js`, Beak threshold 20 mOhm, rested 12.5 V). The migration
directory's highest was 0040 (0039 was reserved by ledger 0030 and never
used), so this took **0041**. Confirmed in the robot repo (clone of main,
`540c7f4`): the `power` object and its fields, the CSV header, the load test
writing `kind=load_test` with the idle voltage as `rest_v` and the load-test
message as `verdict`, and the verdict items (`CHARGE:`, `HIGH RESISTANCE`,
`ROBOT DRAW:`, `BROWNOUT`). The robot's working copy is ahead of its pushed
main: it already writes `pdhMinVolts`, `rioMinVolts`, `branchDropAtMin`,
`stickyFaults`, `sameBatteryAsLastMatch` and a `BRANCH:` verdict item. All of
those are read when present and ignored when absent.

## The one distinction kept everywhere

Robot-measured resistance includes the main wiring (SB50, 120 A breaker, PDH
lugs, leads) and reads 5 to 10 mOhm above a Battery Beak. It lives in its own
column (`robot_resistance_mohm` on both tables), never in `resistance_mohm`,
with its own thresholds in `src/batteries.js` `ROBOT_R`: OK under 22, watch 22
to 28, pull over 28 or over the fleet median + 5. Rested volts (`REST_V`): OK
12.7+, watch 12.5 to 12.7, pull under 12.5. The fleet line (`fleetLine`):
median of each in-service battery's latest robot R; a battery at 1.3x the
median or over median + 5 "stands out" (that battery); a median over 28 is the
robot wiring (inspect the main breaker, SB50 contacts, PDH terminals). It needs
3 batteries with readings before it compares. Check gains one reason (robot R
over 28 in the latest reading); the three existing rules are unchanged.

## Built

- **0041**: `robot_matches.power` (jsonb, whole) and typed `rest_volts_before`,
  `robot_resistance_mohm`, `min_volts`, `amps_at_min`, `peak_amps`,
  `dips_below_7v`, `verdict`; `battery_runs.robot_resistance_mohm`,
  `min_volts`, `verdict`. `_rm_extract_power` (0038's `_rm_extract` re-defined
  to call it); `_rm_power_backfill()` run once by the migration and callable
  again by the test; `robot_match_import` re-defined with the same signature:
  the battery run takes volts before = `power.restVoltsBefore` when present and
  carries robot R, min V and the verdict, and a Match Sim run it merges into is
  filled where blank. `battery_import_load_tests(rows)` (staff or
  `robot.matches`): `load_test` rows only, battery by label (B7 = B07,
  `_rm_battery_key`), deduped on battery + time to the second, retired, older
  than 60 days, no reading and unknown battery skipped with the reason. No
  grant or policy changes on the tables; no member columns, so
  `_merge_member_rules` is untouched. Re-paste 0041 after any re-paste of 0038.
- **Battery board**: fleet line under the tally; each card shows rest V and
  robot mOhm with their level color, a robot-R trend (last 8, lines at 22 and
  28), verdict tags and a Stands out tag; the sheet keeps robot and Beak apart
  and lists the verdict in words; "Robot mOhm vs Beak mOhm" explains the rule.
  Writers get **Pit load tests**: check GitHub, see new / already / skipped,
  import in one tap. CSV gains robot R, lowest V and the verdict.
- **Match detail**: a Power section (verdict, rested V, robot R, lowest V with
  roboRIO V, amps at lowest and what drew them, branch drop, peak amps,
  amp-hours, dips under 7 V, brownout snapshots, sticky faults). It reads
  `m.power ?? m.raw.power`, so it works before 0041 is applied.
- **Connector**: `list_batteries` adds robot R, level, trend, stands out,
  latest verdict and a `fleet` block; `get_robot_match` adds `power`;
  `import_robot_matches_from_github` lists the new load tests with the match
  files and imports them with `load_tests: true` through
  `battery_import_load_tests` (confirm level, hand entry in `functions.yaml`).
  Registry regenerated with `npm run connector:build`.
- **Fixture**: `features/robotmatchpower.js` (0041; sorts after
  `robotmatches.js` so its `robot_match_import` wrapper answers while 0041 is
  on), power on the seeded practice 1 (healthy, B01) and practice 2 (the
  brownout, normal R, 251 A), robot readings on the battery runs, and B07 high
  on two load tests while the rest read normal.

## Measured, 2026-10-28

- SQL harness: `node tools/sql-harness/run.mjs --tests supabase/migrations/0038_robot_match_log_rls_test.sql,supabase/migrations/0041_battery_telemetry_rls_test.sql,supabase/migrations/0026_battery_log_rls_test.sql`
  60/60 (0041 19/19, 0038 21/21 with 0038's import re-defined, 0026 20/20);
  every migration applied twice.
- Mutation, permissive direction, with the runner's own `--mutate` flag (the
  command is the record; `mutants-0041.mjs` was not written because
  `tools/sql-harness/` was outside this bundle's surface): the writer check
  removed from `battery_import_load_tests` turns checks 9, 10, 13 red; the
  dedupe removed turns 12 and 15 red; the import's battery run taking the start
  voltage instead of the rested one turns 3 red; the retired guard removed makes
  the test raise. 4/4 caught. Example:
  `node tools/sql-harness/run.mjs --tests supabase/migrations/0041_battery_telemetry_rls_test.sql --mutate "0041:coalesce(m.rest_volts_before, m.battery_start), m.battery_end=>m.battery_start, m.battery_end"`.
- Unit: `tests/battery-telemetry.test.js` (21) and
  `tests/battery-telemetry-connector.test.js` (7).
- Browser, fixture mode: `node tools/e2e/features.mjs --only batteries,robot-match`
  214/214 at 375 and 1440 (batteries 83, robot-match 131), including the
  before-0041 states.

## Not verified

The live database: not reachable from this container. Whether
`migrate.yml` applied 0041 on the push is a question for the live catalog
(`robot_matches.power`, `battery_import_load_tests` in `pg_proc`). Real robot
files with a `power` section: none are on GitHub yet; the shapes come from the
robot's source. `docs/subsystems/batteries.md` and `robot-matches.md` were not
updated (outside this bundle's surface); this file is the record.
