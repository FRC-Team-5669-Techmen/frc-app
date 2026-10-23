# `tools/sql-harness/` -- the SQL, run for real

A throwaway PostgreSQL 16 with Supabase stand-ins, every frozen SQL file, the
numbered migrations and fictional members, against which the `_rls_test.sql`
files run and are counted. It is committed so its numbers can be re-run
(CLAUDE.md: "A measurement that cannot be repeated is a claim about the past";
the 2026-10-01 bundle built one exactly like it and left it out).

```bash
node tools/sql-harness/run.mjs                                   # everything, every test
node tools/sql-harness/run.mjs --migrations 0005,0006 \
  --tests supabase/migrations/0005_event_family_hub_rls_test.sql # one migration's test
node tools/sql-harness/run.mjs --migrations 0005 --tests none \
  --node tools/sql-harness/race-0005.mjs                         # the two-session seat race
node tools/sql-harness/run.mjs --migrations 0005 --tests none \
  --node tools/sql-harness/mutants-0005.mjs                      # 30 mutants against the 0005 test
node tools/sql-harness/run.mjs --migrations 0005,0006,0007,0008 --tests none \
  --node tools/sql-harness/mutants-0008.mjs                      # 37 mutants against the 0008 test
node tools/sql-harness/run.mjs --migrations 0001-0026 --tests none \
  --node tools/sql-harness/migrate-e2e.mjs                       # the Migrate tool, end to end
node tools/sql-harness/run.mjs --keep                            # leave it up and print how to psql in
```

Each run builds a fresh cluster in a temp directory, applies everything, runs
what was asked, prints one line per test file (`N PASS, M FAIL, K SKIP`) and a
final `sql harness: N/T checks passed across F test file(s)`, then deletes the
cluster. It writes nothing inside the repository. About 40 seconds.

## Files

| file | what it is |
| --- | --- |
| `run.mjs` | the runner (its header documents every flag) |
| `stubs.sql` | what a Supabase project has before any file here runs: the `anon` / `authenticated` / `service_role` roles, `auth.users` and `auth.uid()` / `email()` / `role()` / `jwt()` reading the same GUCs PostgREST sets, the bootstrap `ALTER DEFAULT PRIVILEGES` that grants every new public table to `anon` and `authenticated` (reproduced on purpose: it is the trap behind "a missing policy fails at 0 rows"), `storage.*`, pgcrypto in schema `extensions`, stub `pg_net` / `pg_cron`, and the starter `profiles` / `attendance_events` tables |
| `seed.sql` | fictional members with the fixture personas' ids (`src/dev/fixture/personas.js`), a season spanning today and current-season applications |
| `race-0005.mjs` | two real sessions racing for the last seat of a car (0005). Run it with `--migrations 0005` only: its event has the one-child rule off, which 0008 refuses |
| `mutants-0005.mjs` | widens each 0005 boundary in turn and requires the test to turn red |
| `mutants-0008.mjs` | the same for 0008 (removals, drive flags, guardians, pair seating, grants) |
| `mutants-0012.mjs` | widens each 0012 boundary in turn (the status, expiry or email clause of the holding check, the admin check, the catalog check, the claim gate, the old member_skills gate put back, write grants, the carry-over mapping an ambiguous job or overriding an admin) and requires the test to turn red. `node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0012.mjs`; 19/19 caught on 2026-10-16 |
| `mutants-0013.mjs` | widens each 0013 boundary in turn (read to everyone, the guardian clause dropped, the insert check to true, the role clause dropped, update and delete handed back, the server time stamp removed, the one-signature key dropped, anon read, the read policy broken shut) and requires the test to turn red. `node tools/sql-harness/run.mjs --migrations 0013 --tests none --node tools/sql-harness/mutants-0013.mjs`; 9/9 caught on 2026-10-19 |
| `mutants-0014.mjs` | widens each 0014 boundary in turn (the self-OUT guard, the FLL switch bypass left on or always on, the switch accepting an FLL session, anyone approving, the late window, any event kind as a meeting, the read policies, direct writes, anon read) and requires the test to turn red. `node tools/sql-harness/run.mjs --migrations 0004,0014 --tests none --node tools/sql-harness/mutants-0014.mjs`; 12/12 caught on 2026-10-19 |
| `mutants-0015.mjs` | widens each 0015 boundary in turn (who sees a record, the 24-hour and mandatory-event rules, unanswered-counts-as-excused, the 14-day break week, staff-only logging and voiding, admin-only removal, confirmation and evaluation, the third-safety threshold, removal proposals, incident, outbox and notice access, the FLL cap). `node tools/sql-harness/run.mjs --migrations 0004,0014,0015 --tests none --node tools/sql-harness/mutants-0015.mjs`; 18/18 caught on 2026-10-19 |
| `mutants-0016.mjs` | widens each 0016 boundary in turn (each eligibility clause, staff-only assigning and marking, probation on a missed day, the draft roster and conflict reads, the carpool lock, freeze and cascade exception, the 48-hour sign-up rule, anon). `node tools/sql-harness/run.mjs --migrations 0004,0005,0006,0007,0008,0009,0010,0011,0014,0015,0016 --tests none --node tools/sql-harness/mutants-0016.mjs`; 14/14 caught on 2026-10-19 |
| `mutants-0017.mjs` | widens each 0017 boundary in turn (who reads and saves emergency information, the two-contact rule, checklist steps, the shop gate, the driver-document folder, view log, delete and storage read, the no-photo list, status reports, publishing and its 7 days, the deadline proposal, the family link). `node tools/sql-harness/run.mjs --migrations 0001,0004,0005,0006,0007,0008,0009,0010,0011,0013,0014,0015,0016,0017 --tests none --node tools/sql-harness/mutants-0017.mjs`; 19/19 caught on 2026-10-19 |
| `mutants-0023.mjs` | rewrites one clause of 0023 at a time (staff check to true, any email accepted, the family token scope widened, the hourly dedupe dropped, anon handed Send link, the over-event refusal dropped), re-pastes the file, requires the named checks red, restores from the text it read at start and requires green. `node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0023.mjs`; 6/6 caught on 2026-10-22 |
| `mutants-0024.mjs` | the same for 0024 (answering and reading answers open to any member, `my_feedback` widened, a client read grant on `feedback_replies`, every sign-out decision notifying, the daily access-request dedupe dropped); 6/6 caught on 2026-10-22 |
| `mutants-0025.mjs` | the same for 0025 (a medical visit as an emergency, break weeks ignored for the next school day, the unanswered-at-the-meeting rule dropped, any IN counted as a mentor check-in, the staff check on deciding); 5/5 caught on 2026-10-22 |
| `mutants-0031.mjs` | widens each 0031 boundary in turn (a student setting status or adding others, withdraw taking an assigned row, backups or asks counted as filled, the sync deleting roster rows, the needed-role check on staff add, a client write grant, an ambiguous name taking the first match, and the eligibility block put back). `node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0031.mjs`; 10/10 caught on 2026-10-23 |
| `sim-0031.mjs` | 28 student sessions and a mentor filling the role board in at the same instant (asks, repeats, take backs, staff marks mid-flight), then overfill and backups, then 0031 re-pasted twice over a Beach Blitz event with the live id. `node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/sim-0031.mjs`; 13/13 on 2026-10-23 |
| `mutants-0029.mjs` | widens each 0029 boundary in turn (the parent-only exclusion, a student logging for others, staff-only edit and rate, the void window and owner, both read policies, the note-free scores gate, the rating target check, the student 60-day window, a client write grant). `node tools/sql-harness/run.mjs --migrations 0029 --tests none --node tools/sql-harness/mutants-0029.mjs`; 12/12 caught on 2026-10-23 |
| `mutants-0026.mjs` | widens each 0026 boundary in turn (read policy, the parent-only exclusion, any role, staff check on adding and on retiring, the 24-hour window, another author's run, a client write grant, a retired battery taking a run). `node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0026.mjs`; 9/9 caught on 2026-10-23 |
| `mutants-0027.mjs` | widens each 0027 rule in turn (null skipped, a text or fractional count, the count range, the rating range, the choice lists, an unknown key, a pit report carrying match fields); 7/7 caught on 2026-10-23. Replacements are passed to `String.replace` as a function, because a `$'` in a regex replacement otherwise inserts the rest of the file |
| `mutants-0032.mjs` | widens each 0032 boundary in turn (the staff gate on the team read, parents let in, an anon grant, the since window, pending logged hours counted, the parent-only mark, the accountless rows, the admin gate opened and widened to mentors, the own-account, status and reason refusals, the already-so skip). `node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0032.mjs`; 13/13 caught on 2026-10-23 |
| `migrate-e2e.mjs` | `tools/apply-migration.mjs` end to end (ledger 0021): with 0001 to 0026 pasted and unrecorded (the live state on 2026-10-23), a dry run writes nothing and names 0027 and 0028; a real run creates `supabase_migrations.schema_migrations`, records the 26 baseline rows and applies 0027 and 0028 for real; a second run applies nothing; a raising file rolls back, is not recorded and stops the run (with a positive control that the fixed file and a self-managed `begin ... commit` file apply); `anon` and `authenticated` cannot reach the record schema; the connection password never appears in output. `node tools/sql-harness/run.mjs --migrations 0001-0026 --tests none --node tools/sql-harness/migrate-e2e.mjs`; 31/31 on 2026-10-23 |
| `check-0011.mjs` | 0011 has no `_rls_test.sql` (no grant or policy changes), so this proves it instead: the Beach Blitz note, a re-paste keeping a mentor edit, the note through `_hub_event_json` and `hub_join_info` (as anon) and null once cleared, `drove` per family per day in `_hub_export`, and the unchanged grants both ways. `node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/check-0011.mjs`; 15/15, and 3/15 (the grant checks) with 0011 left out |

## What it is not

Not PostgREST (no HTTP, no schema cache, no `PGRST` codes), not the real auth
service, not real `pg_net` or `pg_cron`, and not Supabase's exact grants on
its own schemas. A result here is evidence about the SQL, never about the live
project: whether a migration has been applied there is only ever answered by
querying the live project.

## Measured, 2026-10-04

- The seven existing `_rls_test.sql` files pass here unchanged: the three
  frozen raise-style tests and 0001 to 0004 at 27, 24, 24 and 33 rows -- the
  same counts the 2026-10-01 bundle reported from its uncommitted harness,
  which is the evidence this one is faithful.
- The frozen files are applied in a FIXPOINT (alphabetical, retrying what
  failed because something it needs comes later), because the repo's git
  history is shallow and the live paste order is not recoverable. Three
  frozen objects depend on that order (decision 26).
- `seed.sql` gives the lowest-id student, Sam (`c1`), NO current-season
  application. `supabase/member_applications_rls_test.sql` picks the
  lowest-id non-staff member as its "member A" and requires A to see exactly
  ONE application, so it fails against any database where that member has
  already applied -- which is likely true live after the first season. That
  is a fragility in the frozen test, recorded in
  `docs/history/brave-noether-tyn6cb.md`, not something this harness fixes.

## Running as root

`initdb` and `postgres` refuse to run as root. Under root (this container)
`run.mjs` runs the server-side commands as the unprivileged `postgres` user
through `runuser` and hands it the temp directory; `psql` connects over the
cluster's own unix socket either way.
