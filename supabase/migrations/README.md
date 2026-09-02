# `supabase/migrations/` -- numbered migrations, from 2026-09-02 forward

**This directory is empty of SQL on purpose.** It is the shape the next SQL file
lands in, established by the conformance bundle on 2026-09-02, and nothing was
renumbered or moved to create it.

## The three rules

### 1. A new SQL file is numbered, and lives here

`NNNN_short_snake_case_name.sql`, starting at `0001`. Four digits, zero-padded,
one file per change, in the order they must be applied.

```
supabase/migrations/0001_add_practice_log.sql
supabase/migrations/0002_practice_log_rls.sql
```

**Take the next number by reading this directory, and record it in your prompt
ledger entry** (`docs/prompt-ledger/`) BEFORE the work starts. Two sessions
running in parallel will otherwise both read the same highest number and both
pick the next one -- that is a real failure with a real precedent in the sibling
`idea-app` repo, where two migrations both claimed `0146`. The ledger's
"Migration permitted" field exists for exactly this check: two prompts may not
both permit a migration at the same time, whatever files they otherwise own.

### 2. The existing SQL is FROZEN WHERE IT IS

`supabase/*.sql` (57 files) and `sql/forgotten_checkout.sql` are **not
renumbered, not renamed, and not moved into this directory.** Ever.

Every one of them has already been pasted into the Supabase SQL editor against
the live project, most of them months ago. Their filenames are the only handle
anybody has on what was run: they are cited by name in `docs/history/`, in
`CLAUDE.md`, in each other's comments, and in the notes of whoever applied them.
Renaming a file that has already been applied does not tidy the history, it
destroys the only record of it, and it invites a re-run of something that was
never meant to run twice.

The two directories therefore mean different things, and that is the point:

| | what it holds | ordering | applied? |
|---|---|---|---|
| `supabase/*.sql`, `sql/` | everything up to 2026-09-02 | none; read the file's own header | assume yes, but **verify** |
| `supabase/migrations/` | everything after | the number | read the file's header |

### 3. A migration ships with its test beside it

Where a file adds or changes an RLS policy, a grant, or a revoke, it gets a
sibling that proves the boundary holds:
`NNNN_add_practice_log_rls_test.sql`.

The pattern already exists in this repo and it works. `feedback_rls_test.sql`,
`member_applications_rls_test.sql` and `parent_responses_rls_test.sql` each run
inside a `begin ... rollback`, so they are safe against live data, and each
carries **positive controls** so a broken-shut policy cannot fake a pass.
`feedback_rls_test.sql`'s own history is the argument for them: seven negative
controls were run against it and the first version caught only six -- an UPDATE
has to FIND its rows, and row lookup goes through the SELECT policy, so a test
that thought it was checking UPDATE was checking SELECT again.

Three of the fifty-eight SQL files in this repo have a test sibling. That is the
number this rule exists to move.

## How SQL actually reaches this database

**By hand, in the Supabase SQL editor, and nothing in this repository records
which files have been run.**

Read that twice before writing a migration, because every other rule here
follows from it:

- There is **no** `supabase_migrations.schema_migrations` history table in play,
  no `supabase db push` in any workflow, and no CI step that touches the live
  project. CI reads no credential at all.
- So **a file existing on `main` says nothing about the database having it.** The
  only proof a migration is live is querying the live project for the objects it
  creates -- the table, the index by name, the constraint by name, the function
  in `pg_proc` -- and reporting what was found.
- Nearly every existing file opens with a line like *"Run once in the Supabase
  SQL editor, BEFORE testing the UI"*. That line is the apply instruction, and
  it is addressed to a person.
- `supabase/config.toml` pins `verify_jwt = false` for the five Edge Functions
  that are invoked by pg_cron or by capability URL. Deploying those is a
  separate manual step (`npx supabase functions deploy <name>`), and
  `discord-calendar` is the one function that is not single-file and so cannot
  be deployed from the Dashboard editor.

**This is why `deploy.yml` asks for a typed confirmation** rather than a button
press. The sentence a person types is the one fact no check in this repository
can establish: that the SQL this deploy depends on has already been run. A
deploy of code whose migration has not been applied ships an app that calls a
table the database does not have, to students who are checking in on their
phones.

## Writing one

The conventions below are this repo's, learned from files that had to be pasted
twice:

- **Make it re-runnable.** Hand application invites a second paste. Guard every
  `create` with `if not exists`, wrap constraint adds in a `do $$` block that
  checks `pg_constraint`, use `create or replace` for functions, and precede
  every `create policy` with a `drop policy if exists`. Only ever drop what the
  same file creates -- a `drop policy if exists` naming a policy this file does
  not create is a no-op today and one re-paste away from silently deleting a
  policy a later migration added under that name.
- **Say what undoes it**, in the file, before it is applied: the SQL that
  returns production to its prior state, or an explicit statement that the
  change cannot be reversed and why.
- **Grants are not optional and their absence is silent.** The project's
  bootstrap `ALTER DEFAULT PRIVILEGES` grants `authenticated` everything on a
  new public table, so a table with no policy for an operation fails at **0
  rows, with no error**, rather than raising. Where an operation must be
  impossible, `revoke` it explicitly. `feedback.sql` and `weekly_surveys.sql`
  both carry that revoke and both say why at the line.
- **A revoke does not block `ON DELETE CASCADE`,** and this was measured against
  a real PostgreSQL 16 rather than reasoned about (see
  `docs/history/record-50-survey-management-surface.md`): a cascade runs as the
  referencing table's owner with row security not forced, so the caller's grants
  and RLS are not consulted for the rows it removes. Do not "fix" a working
  cascade by granting delete on the child tables -- that hands every member a
  direct delete on other people's rows.
- **A column revoke is a no-op while a table-level grant exists.** Effective
  column privileges are the UNION of the column ACL and the table ACL. Hiding a
  column means dropping the table-level grant and re-granting every other column
  individually; `parent_responses.sql` does this for `parent_token` and explains
  it. `calendar_token.sql` uses the naive form and is flagged in `CLAUDE.md` as
  probably not blocking anything.
- **Additive, or it is an outage.** Schema lands and is applied by hand while the
  code that uses it is still on a branch. Between those two events production
  runs the old code against the new schema. Dropping a column, a policy, or an
  RPC signature the deployed app still calls is not a risk, it is a certainty.
  Add the new thing, keep the old shape alive, and drop it in a later migration
  once nothing calls it.
- **Test against seeded PRE-migration data,** not only against an empty chain. A
  backfill run over an empty database is correct in every row and proves nothing.
