---
title: "Beach Blitz readiness: ledger 0016 landed, battery log (0026), scouting match fields, readable export, navigation overhaul (ledger 0017)"
date: 2026-10-23
branches: [main]
commits: ["53bf889", "bda0cc2", "65c6e32", "PENDING_C"]
migrations: ["0026_battery_log.sql", "0026_battery_log_rls_test.sql", "0027_scouting_match_fields.sql", "0027_scouting_match_fields_rls_test.sql"]
subsystems: ["Battery log", "Connector", "Scouting", "Landing and nav", "Event family hub", "Feedback", "Profile", "Scheduling"]
---

One solo session (ledger 0017, Opus 5.5, high), one week before Beach Blitz 2026. Each part was pushed to main as it finished. 

## Part A: ledger 0016 landed

The scheduled session behind ledger 0016 built two commits and could not push. Its format-patch applied cleanly to 9aa3935 with `git am`, authorship kept: 53bf889 (family link recovery, 0023) and bda0cc2 (feedback inbox 0024, absence rules 0025, icons, dictation, the feature-guide tour, decision 49). The gate on that exact tree, every summary line read: build passed; `npm test` 75 files, 1077/1077; `ds:audit` ok (315 files); `discord:calendar:test` 19/19; `history:verify` OK; `test:checkin` 51/51; `test:features` 1881/1881; `connector:check` current. Nothing needed fixing. Pushed bda0cc2 to main.

## Part B1: the battery log (65c6e32)

**Found.** No battery record of any kind in the app.

**Built.** Migration `0026_battery_log.sql`: `batteries` and `battery_runs`, RLS on, select only for approved active students and staff (`_battery_member_ok`, the scouting eligibility shape, so a parent-only account reads nothing and a parent who is also staff reads as staff), no client write grant, five SECURITY DEFINER functions each checking its caller: `battery_log_run` and `battery_set_charge` (students and staff), `battery_edit_run` (the author for 24 hours, staff always), `battery_save` and `battery_add_set` (staff; a numbered set B01 to B12 in one call, existing labels skipped). A match, practice match or drive practice marks a charged or in-robot battery as needs charge (a bench test does not); that is a proposed default. Nothing is deleted; a dead battery is retired. `_merge_member_rules` re-pasted with the five battery member columns. Page `/batteries`: worst-first board, one-tap charge state, Check from `CHECK_THRESHOLDS` in `src/batteries.js` (brownout in the last 3 runs, resting voltage before a match under 12.5 V, resistance over 20 milliohms; marked proposed defaults), Match-ready filter, history sheet, a phone-first run form (battery and kind remembered, decimal keypads), CSV. Connector: `list_batteries` (read), `log_battery_run` (confirm), `set_battery_charge` (undo), labels resolved against what his account can read.

**Proof.** `0026_battery_log_rls_test.sql` 20/20 on the harness, re-runnable (applied twice). `mutants-0026.mjs` 9/9; its first run missed the parent-only exclusion because no test account held both student and parent, so check 20 was added. Connector proof 1259/1259 (20 hand samples, 3 battery). `tests/batteries.test.js`, `tests/connector-batteries.test.js`; `tools/e2e/features/batteries.mjs` 48/48, which also found two real defects fixed before landing (the history sheet stayed open under the run form, so two modals stacked; "All" hid retired batteries, renamed "In service" with its own Retired filter). Gate on 65c6e32: build passed; `npm test` 77 files, 1098/1098; `ds:audit` ok; discord 19/19; history OK; checkin 51/51; features 1929/1929.

## Part B2: scouting match fields, and B3: readable export (PENDING_C)

**Found.** The observation asked three yes/no capability questions (`CAPABILITIES` in `src/scouting/model.js`), and 0022's `scouting_private.validate` allowed exactly the keys `answers, notes, source, video_url, assignment_id, request_delivery, source_scope, source_event` on an observation, the three capability keys inside `answers`. The tester's feedback was accurate. The export was the `techmen-scouting-v2` JSON archive only.

**Built.** Migration `0027_scouting_match_fields.sql` re-defines `validate` with one change (the `match` key on an observation, checked by `validate_match`) and adds `scouting_match_fields()`. A field is absent until recorded; JSON null is refused; 0 is an observed zero. `src/scouting/match.js` holds the one field list and the summaries (confirmed, current-event observations, newest per author per match, one value per match). The form gained REBUILT fields above the capabilities with +1, +5 and -1 steppers and "Saw zero"; the team card and three-team comparison show medians and rates with their match counts; the pick list filters on median FUEL, best TOWER level, trouble rate, driver skill and defense, where an unrecorded value never passes. Training gained a ninth mission and drill on counting; the practice match lab grades match fields beside the capabilities (a recorded 0 where nothing was seen is wrong). Before 0027 is pasted, the form keeps the capability questions and says the match fields start with 0027. B3: "Download spreadsheet" writes two CSVs beside the JSON backup (one row per observation; one row per team), empty cell for not recorded.

**Proof.** `0027_scouting_match_fields_rls_test.sql` 17/17 and 0022's test 72/72 on top of it; `mutants-0027.mjs` 7/7 (one candidate mutant, removing the object check, was dropped as equivalent: an array still fails in `jsonb_each` with the same code; the first run also exposed a harness bug, `$'` in a `String.replace` replacement, fixed in 0026's and 0027's runners). `tests/scouting-match.test.js` (hand values, and the field list held equal to the SQL), `tests/scouting-spreadsheet.test.js`, `docs/scouting/check-oracles.mjs` A6, `tests/scouting-training.test.js`. The scouting e2e spec gained the steppers, the saved payload, the team medians from a seeded oracle, the pick-list filter both ways, both CSV downloads read back, and the pre-0027 fallback; it found that `teamRows` was shadowed in `ScoutingPage.jsx`, so the team CSV threw, fixed before landing.

## Part C: the navigation overhaul (PENDING_C)

**Found.** Measured by `tools/e2e/nav-audit.mjs` (decision 49 BEFORE): account menus of 13 (student), 23 (mentor), 26 (admin) and 7 (parent) items; Sign-outs ninth for a mentor; the phone menu taller than the screen.

**Built.** Top bar Home, Schedule, Scouting, Robot, Hours (one row on a phone); Robot hub; Team admin `/manage` with grouped, filterable tiles, live counts and waiting-first; the account menu at five items (six for a student sign-out approver); Driver documents, the weekly survey and parents' emergency information on My profile; Trips and Event rosters on the Schedule; "Do this now" on Home. Every route kept its address. The feature guide and tour follow the new layout. AFTER numbers and screenshots are in decision 49 (decided) and `docs/decisions/49-nav-after/`.

**Proof.** `tests/nav-admin.test.js` (catalog to routes, counts both ways, the menu at most six), `tests/do-this-now.test.js`, `tests/feature-guide.test.js`; the signout, standing, announce, feedback and event-hub specs moved their nav checks to Team admin and the Schedule, each still asserting both directions.

## Migrations, and the order to paste them

In the Supabase SQL editor, in this order, each followed by its `_rls_test.sql` (one transaction, rolled back): `0023_family_link_recovery.sql`, `0024_feedback_inbox.sql`, `0025_absence_handbook.sql` (ledger 0016, landed in Part A), `0026_battery_log.sql`, `0027_scouting_match_fields.sql`. 0026 re-defines `_merge_member_rules` (after 0024's); 0027 re-defines 0022's `scouting_private.validate`. Until each is pasted its page reads "not set up yet" (batteries) or keeps the old form (scouting); nothing fails.

## Not verified, and why

- **Nothing about the live database.** No migration was applied and no live catalog was queried: SQL here reaches the database only by hand. Every SQL result above is the throwaway PostgreSQL 16 harness.
- **Real phones.** Every browser check is the container's Chromium at 375 (touch emulated) and 1440 on fixture mode. The "under 20 seconds" battery log and the one-handed steppers were built for it (big targets, decimal keypads, remembered battery and kind, one Save) but not timed on a real phone in a real pit.
- **The thresholds and the auto needs-charge rule** are proposed defaults, not team policy.
- **The connector's battery tools** are proved by the harness and the in-memory runner, not called from Claude against production.
- **Fixture mode** cannot see write-side RLS, triggers or the real PostgREST; the SQL boundaries are proved by the `_rls_test.sql` files and mutants only.
