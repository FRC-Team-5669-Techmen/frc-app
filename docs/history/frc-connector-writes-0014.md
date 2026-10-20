---
title: "Connector writes: every direct table write moved into a database function, set a member's name, merge accounts, deleted rows in previews (ledger 0014)"
date: 2026-10-20
branches: [main]
commits: []
migrations: ["0019_connector_writes.sql", "0019_connector_writes_rls_test.sql", "0020_member_admin.sql", "0020_member_admin_rls_test.sql", "0021_connector_deleted_rows.sql", "0021_connector_deleted_rows_rls_test.sql"]
subsystems: ["Connector", "Roster and access", "Check-in", "Testing"]
---

## Progress

Kept current so a restarted session can resume. Each milestone is a local commit.

- [x] M0 ledger 0014 written; numbers read: ledger 0014 free, migrations 0019 and 0020 free (highest 0018)
- [x] M1 src/writeVia.js and its test
- [x] M2 0019_connector_writes.sql (67 functions)
- [x] M3 every page converted; no direct write left under src/
- [x] M4 registry: exclusions removed, coverage guard, create_event and its undo
- [x] M5 0019 test (differential, live-safe) 72/72 in the harness; mutants-0019 14/14 caught
- [x] M5b (added mid-session by the coordinator) 0021: deleted rows reach previews and audit rows; a role removal carries its undo; test 8/8, mutants-0021 3/3
- [x] M6 0020 set name and merge, test 8/8, merge-0020.mjs 903/903 with three mutants caught
- [x] M7 docs
- [ ] M8 full gate, rebase, push

## What was built

**Part A: no page writes a table.** The 84 direct writes in 26 files under `src/` (listed by file and line in `docs/history/frc-connector-0013.md`) are now 67 SECURITY INVOKER functions in `supabase/migrations/0019_connector_writes.sql`, one per thing a person does: a save that deleted then inserted is one function (the job form, a survey submission, a survey copy, a series edit), which also makes it all or nothing. Every page calls its function through `writeVia(supabase, 'fn', args, fallback)` (`src/writeVia.js`); the fallback is the page's old direct write described as data (steps with table, op, values, filters, select, and `keepGoing` / `ignoreError` where the page's own sequence kept going or never read an error), run only while the function answers PGRST202 or 42883. A function seen missing is remembered for the page load, so the check-in fast path pays the failed call once per load. The five attendance writes share `src/attendanceRecord.js` (`attendance_record`). Call sites converted: 71 `writeVia` calls plus the shared attendance helper used at 5 sites.

**The guard.** `tools/connector/inventory.mjs` now finds a `.from(<anything>)` chain ending in a write, any `.insert(` / `.upsert(`, and a builder kept in a variable and written through later; `tests/connector-coverage.test.js` requires there be none under `src/` or `api/` outside `src/writeVia.js` and the fixture engine, whatever `exclusions.yaml` says. Its positive control plants all five shapes in a copy of the tree (and the same text in the two exempt files) and requires exactly the planted ones found. A second check parses every `writeVia` call and requires its function to exist in the SQL chain with those argument names (a typo would answer PGRST202, fall back for ever and never reach Claude); mutation-checked by misspelling one argument in `src/JobsPage.jsx` (red), restored from a copy (green). The 84 exclusions are gone.

**Words for Claude.** A `-- Does:` line directly above a `create function` is now the generated entry's description (`docsByName` in `tools/connector/sqlchain.mjs`, used by `tools/connector/build.mjs`); every 0019 function has one.

**create_event** is a real tool: title, kind (held equal to the schedule page's `KINDS` by a test), start, end, location, notes, with times read as Los Angeles wall-clock time (`$la.x` in a tool map, `laWallToIso`, checked across both 2026 clock changes; the skipped spring hour is refused; an end before the start writes nothing). Level undo; the reverse is `schedule_delete_event` with the new id.

**Part B** (`0020_member_admin.sql`): `admin_set_member_name` (hand entry `set_member_name`, level undo, the reverse sets the previous values the function answers) and `admin_merge_member` (hand entry `merge_accounts`, confirm; the preview is the merge rolled back, listing counts per table). Both admin only (`is_admin()`), SECURITY DEFINER, and write `member_admin_log`. The merge's rules are in `docs/subsystems/roster-and-access.md`.

**Deleted rows (0021, added mid-session).** On the live app a role removal through `set_team_role` previewed and audited `"rows": []`. Every log table (now every public table but the connector's own, 97 in the harness) gets an AFTER DELETE trigger that, only inside `connector_call`, copies the deleted row to a transaction-only temp table; `_connector_rows_written` answers them marked `"deleted": true`, cascades included. `admin_set_member_role` removal now carries its undo (give the role back when it was held); an undo `when` can be a list, and reads "true"/"false" text as booleans.

## Decisions taken unattended (each the most conservative reading)

- **SECURITY INVOKER for all 67.** No direct write depended on a definer path, so none is definer. RETURNING appears only where the page read the row back (a RETURNING needs the read policy too). Columns the page filled with the signed-in id are `auth.uid()`; phone-clock timestamps are `now()`. Both are what the policies already required.
- **Typed arguments where the page's keys are fixed; a JSON object where they vary** (`trips_save_event`, `trips_save_day`, `admin_save_standing_settings`: a key left out is left alone, unknown keys refused with 42703), and for the 35-field member application.
- **The legacy feedback path** (`feedback_set_legacy_status`) runs only before 0002, so it always falls back; it is converted anyway so no direct write remains.
- **Two RSVP functions**, `event_set_response` (Home, keeps the item) and `event_rsvp` (Schedule, sets it), because the two pages' upserts differ in which columns they send.
- **A survey submission is now all or nothing** through the function. Before, a failed answer insert left a submitted response and a "may not have saved" note; the old path still does that until 0019 is pasted.
- **The roster's admin edits leave no trail of their own** (only `connector_audit`, through Claude). The name and merge functions write a new `member_admin_log` (no foreign key, so it outlives a hard delete) rather than borrowing `attendance_audit`.
- **Merge: staff roles and capabilities do not move**; student and parent do. A grant is its own decision. Credentials are deleted, audit logs kept. The connector's own account cannot be merged away; neither can your own.
- **Merge: the kept account's row wins every unique-key collision**, and the duplicate's row is deleted with what hangs off it by cascade (a survey response's answers, a hub invite's responses and seats). Counted in the answer as `kept_into`.
- **Merge: the duplicate's profile** stays (inactive, unapproved, bio noting the merge, calendar token replaced, other fields cleared, full name kept so the roster can show it); the kept profile takes only fields it lacked; a snapshot of both goes in the trail. Its `approved_emails` row is removed so the Gmail sign-in does not approve again.
- **Merge: an event's "added by" change** would push "Schedule updated" to every phone (the statement trigger), so `trg_events_update` is disabled for that one update, inside the transaction, only when such rows exist.
- **Merge refuses while the catalog holds a member column it does not know** (runtime guard), besides the tests that fail on one.
- **0021 is a third migration** rather than a change to 0018 (frozen once pasted).
- **No page for name and merge.** The prompt asked for the functions and hand entries; the roster page is unchanged.

## Claims in the prompt the tree contradicted

- "the connector's registry generator turns [the header comment] into the tool's description": it did not read comments at all; the `-- Does:` convention was added.
- "Expected 0019": 0019 was free, and the work took 0019, 0020 and 0021.

## Measured, 2026-10-20

- vitest: 54 files, 853 tests (the last full run; see the gate below for the pushed tree).
- SQL harness, every test file: 501/501 across 22 files (0019 72/72, 0020 8/8, 0021 8/8, every earlier test unchanged).
- `tools/sql-harness/mutants-0019.mjs` 14/14 caught; `mutants-0021.mjs` 3/3; `merge-0020.mjs` 903/903 (a row in each of 106 moved columns for both accounts, mentor and student refused with nothing changed, three mutants each caught); `tools/connector/harness/proof.mjs` 1175/1175 (15 hand samples, 153 write entries x 3 callers refused); `check-parse.mjs` 340/340 signatures; `mutants-0018.mjs` 12/12 when run alone (after `proof.mjs` in the same server its check 17 reads a registry row proof.mjs left registered, an ordering effect between the two scripts, not a defect).

## Not verified, and why

- **Nothing touched the live Supabase project.** Whether 0019, 0020 and 0021 apply cleanly there, and whether live RLS matches the frozen files, is unverified; the 0019 test is written to answer the first on paste.
- **The PGRST202 fallback against real PostgREST** was not exercised; fixture mode answers PGRST202 for unknown functions the same way, and the E2Es ran through it.
- **Driver documents after a merge**: the row moves to the kept account and stays readable by it, but the stored file sits under the duplicate's folder, so deleting it later removes the row and leaves the file (the storage delete policy reads the folder). Not fixed.
- **Live timing**: before the paste, each tag tap makes two extra failed calls (profile and attendance) before falling back. After the paste the call count is the same as before.
