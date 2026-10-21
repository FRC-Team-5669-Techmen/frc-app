# Current database verification — October 21, 2026

Fresh native PostgreSQL 17.6: chain applied twice, **573/573** assertions across 23 rollback suites (72 scouting), **17/17** permissive mutants caught and **7/7** actual separate-connection races. The retained harness observes lock overlap before releasing the winning transaction. Built-PWA/local PostgREST checks pass **22/22**. Auth/cron/network/storage components in the native harness remain explicit stand-ins.

Isolated hosted Supabase PostgreSQL 17.11: unchanged migration 0022 applied twice; **72/72** SQL/RLS assertions passed with real hosted roles/Auth helpers and SQL-injected request claims. All users/profiles/records/operations/deliveries rolled back to zero. This does not prove hosted GoTrue/HTTP sessions. Both Edge Functions deployed with JWT verification on; HTTPS was blocked by the workspace proxy. The temporary branch was deleted after evidence capture. See `STAGING.md` and `verification/staging-2026-10-21.json`.

Production remains PostgreSQL 17.6 with zero scouting tables/functions. It was read only. Earlier PostgreSQL 16.10 results (573 SQL checks, 17 mutants, seven races) are retained historical cross-engine evidence, not described as freshly repeated.

With native binaries on PATH, run `node tools/sql-harness/run.mjs --node tools/sql-harness/scouting-mutants.mjs,tools/sql-harness/scouting-race.mjs`. `tools/sql-harness/scouting-hosted-proof.mjs --emit` emits the guarded rollback-only hosted proof; never execute it on production. Exact commands/limits are in `RELEASE.md`.

---

## Historical WASM checkpoint record

# Scouting database checkpoint

Verified in this cloud workspace on October 20, 2026 (Los Angeles date).

## Implemented

`supabase/migrations/0022_scouting.sql` is additive and re-runnable after 0021. It adds event/member-linked current records, immutable full revisions, member-scoped idempotency receipts, and notification delivery status. Every read uses RLS. Client table writes are explicitly revoked. Public save is SECURITY INVOKER; the atomic implementation lives in the unexposed `scouting_private` schema, uses a pinned search path, checks the actual caller, and never accepts author attribution from the request.

Save signature:

```text
scouting_save(p_id uuid, p_event uuid, p_kind text, p_team integer,
 p_match text, p_payload jsonb, p_expected_version integer,
 p_operation uuid, p_actor uuid) -> jsonb record
```

`p_actor` is an expected identity, not impersonation. It must equal `auth.uid()` before any stored receipt can return. Both operation and record advisory locks are transaction-scoped. An identical retry returns its original receipt; changing the payload under that operation fails. A stale version raises `40001`; changed identity, invalid payload, or unknown fields raise `22023`. Cross-author observations and personal lists are forbidden even for managers. Unique indexes stop fresh IDs duplicating the same logical observation, pit/team row, active assignment, or personal list.

Scouting managers are approved active staff, an event scouting lead, or a holder of `scouting.manage`. Parent-only and parent-plus-student accounts remain excluded. Parent plus staff is staff. All ordinary eligible students can capture scouting, without a new privileged role.

Assignment creation/reassignment creates an existing `member_notices` row. Observation/message delivery requests create a separate queued row in the same transaction. Only `service_role` can call `scouting_claim_delivery(p_record,p_version)` and `scouting_finish_delivery(p_delivery,p_status,p_message_id,p_error)`. A claim returns the immutable revision snapshot plus delivery and claimed flag. Sending, uncertain, or delivered rows cannot be claimed again. Definitive failed/not-configured rows can be explicitly retried. An interrupted worker may leave sending until operational review; automatic resend is intentionally unavailable because the remote message may already exist.

Team data preserves independent TBA, Statbotics, and Nexus provenance. Official results require alliance-level metadata. No alliance score is transformed into an individual robot score. Payloads above 100,000 bytes fail without replacing data.

## Actual verification

- Full frozen SQL chain and all migrations 0001 through 0022 applied twice in PostgreSQL **18.6 WASM**, PGlite **0.5.10**.
- `0022_scouting_rls_test.sql`: **52/52 checks passed**. Real PostgreSQL grants, RLS, transactions, functions, constraints, and connector calls execute. Auth, cron, network, and storage use the repository stand-ins.
- `scouting-mutants.mjs`: **11/11 permissive mutants caught**. Widened record/revision/delivery visibility; missing parent, approval, and active gates; removed version, actor, and ownership checks; changed-body retry acceptance; removed logical-observation uniqueness.
- All existing rollback-only RLS files under the same PostgreSQL WASM runner: **553/553 checks across 23 files**, excluding summary rows. The three legacy raise-on-failure files each count as one successful complete execution.
- Focused Vitest: **67/67** across permissions, merge coverage, connector coverage, and scouting storage.
- Native PostgreSQL 16 harness: **blocked before start**. It reported `chown: invalid user: postgres:postgres`; the image has no native PostgreSQL binaries/user. This is not a native harness pass.
- No live Supabase schema/data change, production deployment, real notification, or live RLS test occurred.
- WASM is single-connection. The lock/unique behavior is exercised sequentially, but a genuine two-connection race is **unverified**. PostgREST schema cache behavior and live grants are also unverified.

## Reproduce

The optional WASM dependency is deliberately outside the application dependencies. Install a pinned copy in a scratch directory:

```sh
npm install --prefix /tmp/scouting-pglite --no-audit --no-fund @electric-sql/pglite@0.5.10
PGLITE_MODULE=/tmp/scouting-pglite/node_modules/@electric-sql/pglite/dist/index.js node tools/sql-harness/scouting-pglite.mjs --mutants --all-tests
npx vitest run tests/permissions.test.js tests/merge-coverage.test.js tests/connector-coverage.test.js tests/scouting-storage.test.js
```

With a normal PostgreSQL 16 environment and the repository harness prerequisites:

```sh
node tools/sql-harness/run.mjs --tests supabase/migrations/0022_scouting_rls_test.sql
node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/scouting-mutants.mjs
```

## Apply order and boundaries

After all existing prerequisites through 0021, apply:

```text
supabase/migrations/0022_scouting.sql
```

Then the rollback-only proof is:

```text
supabase/migrations/0022_scouting_rls_test.sql
```

Do not expose `scouting_private` in Supabase API schema settings. Edge Functions deploy separately. Root verification/deployment documentation describes those steps.

Historical authorship is intentionally kept when accounts merge. The merge rules know all new member columns, so the existing unknown-column safety gate continues to work. The retained original account owns its old personal observations/list; the newly merged destination cannot rewrite that historical record. Deleting a member/event that owns scouting history is restricted by foreign keys, preventing silent destruction. Use existing inactive status for members. These are deliberate evidence-preservation choices, not claimed TideScout behavior.


## Continued-build verification, October 21, 2026

The same retained PGlite command was rerun after adding immutable same-event/team pit replies and the manager-only eligible roster. Results: **62/62 scouting checks, 15/15 permissive mutants caught, and 563/563 checks across 23 SQL test files**. Both migration passes succeeded. New mutations widen reply event/team boundaries and roster authorization/eligibility; the unchanged tests catch each. Native PostgreSQL16, concurrent connections and live Supabase remain unverified.

## Resumed source-boundary verification

The latest retained harness run passed **72/72 scouting checks, 17/17 permissive mutants, and 573/573 SQL checks across 23 files**, with both migration passes successful. New tests cover prior-event provenance, source/assignment agreement, a reviewable external URL, and current-event short/full match alias uniqueness. Mutation controls remove the external match-prefix and assignment-scope guards and are caught. No native PostgreSQL, PostgREST or live Supabase claim follows from these WASM results.

## Read-only production catalog, October 21

The connected `frc-app` project reports PostgreSQL **17.6**. A metadata-only query found the expected profiles, events, roles, permissions, connector audit and member-admin tables. It found **zero public scouting tables and zero scouting functions**. The Edge Function list contains neither `scouting-import` nor `scouting-dispatch`. This proves the release is not installed; it is not a live RLS/workflow test. No live schema/data change or notification was made. Production's patched build and hosted Auth/extensions are not emulated by the native harness.
