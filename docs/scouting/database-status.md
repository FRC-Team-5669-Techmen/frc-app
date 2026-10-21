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
