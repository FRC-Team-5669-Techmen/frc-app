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
