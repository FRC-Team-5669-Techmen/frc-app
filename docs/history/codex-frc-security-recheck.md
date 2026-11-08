---
title: "Recheck the frozen security audit and repair decision-independent boundaries"
date: 2026-11-07
branches: [main]
commits: []
migrations: ["0049_security_recheck.sql", "0049_security_recheck_rls_test.sql", "0046_signout_session_boundary_rls_test.sql"]
subsystems: ["Roster and access", "Hours and attendance", "Scheduling", "Connector"]
---

The user requested a solo recheck of twelve security stubs frozen at e652b01,
with a direct main push after the local gate, concurrent with the separate
roster/accounts job. The starting checkout was 6876af1 after fetch/rebase.
CLAUDE.md, the audit, relevant history/ledger records, decisions and subsystem
rules were read first. No subagents were used. The private text of item 14 was
not available and has not been reconstructed. All database actors and handler
inputs used here are fictional; no live member data was read or changed.

Every original item was applicable. The current tree contradicted the claim
that all twelve were still wholly unfixed: 4379cb7 already closed item 1 through
0046, and 3a283ea had added an invoker attendance wrapper with server time.
The wrapper alone did not settle direct table inserts. 8cedc44 centralized mail
transport without adding approval-mail authorization. ddba519/0020 addressed
duplicate-account merging, a narrower operation than general removal/access.

| Item | Before this job | After this job | Evidence | Still needs Mr. Pina |
| --- | --- | --- | --- | --- |
| 1 | Fixed by later work | Fixed, retained and tested | 4379cb7/0046; security RLS checks 1-2; named grant mutations | No decision; live state not inferred |
| 2 | Still open | Still open | Full-chain local pending-account probes; invoker wrappers preserve the policy | Decision 06: approved/active member data boundary |
| 3 | Still open | Still open | Full-chain local member-table probe; current policy/trigger catalog | Decision 06: protected approval/status/exemption fields |
| 6 | Still open, with partial later work | Fixed in source/SQL | 3a283ea and 4379cb7 partial controls; new RLS checks 3-11 and five permissive mutations | Confirm live Migrate installation; physical GPS/NFC remains device evidence |
| 7 | Still open | Fixed in source/SQL | New RLS check 12, owner controls 13-14, per-function/per-role grant mutants; README role-set rule | Confirm live Migrate installation |
| 8 | Still open | Fixed in source | tests/security-recheck-edge.test.js executes the actual handler with isolated clients/transport; auth/staff/error/escaping red-green and mutations | Deploy send-approval-email with _shared/mail.js; verify installed behavior |
| 14 | Still open | Still open | Public stub, decision 07, current claim/role catalog, later standing/merge scope | Decision 07: participation versus access and alumni scope |
| 15 | Still open | Still open | Current approve RPC, whitelist policy, invite handler and role selection; local catalog agrees | Decision 08: who may grant mentor |
| 16 | Still open | Still open | Current send-parent-request handler, local schema, consent display; 8cedc44 is transport only | Decision 14: membership/send limits and confirmation before acting on consent |
| 50 | Still open | Still open | Fictional parent-only local read with a positive attendance fixture; base policy unchanged | Decision 10: linked students, totals or full team scope |
| 51 | Still open, partial sign-out protection | Still open | Local lead/staff helper and fictional mentor self-credit probe; 0046 is narrower | Decision 09: lead meaning and self-credit/override policy |
| 52 | Still open | Fixed in source/SQL | New RLS checks 15-26 and permissive mutations; actual feed handler tests membership before events | Deploy calendar-feed; verify live SQL and feed together |

Each decision file now contains the exact question and this job default. The
user explicitly asked for questions instead of building decision-dependent
items, so the older conditional statements that a session asked to work here
builds option A are not taken as permission to choose those policies. No
membership-wide boundary, offboarding flow, role-grant policy, parent read
scope, send-limit/consent rule or self-credit rule was implemented.

The migration applies through migrate.yml on the main push. Its invoker
attendance trigger covers direct INSERT and attendance_record, uses server
time, and rejects client-set staff fields and unsupported self categories.
Checked definer staff paths preserve historical timestamps, manual categories
and their audit. The existing sign-out, pause and concurrent-session guards
remain. The old 0046 test temporarily disables the new outer guard inside its
rollback transaction around one inner-guard assertion; this keeps the original
permissive mutation meaningful without weakening its expected refusal. No
existing production trigger is disabled by the migration.

Internal trigger and legacy cron/dispatch functions lose PUBLIC, named anon,
authenticated and service_role execution. Own-token RPCs grant exactly
authenticated; profile SELECT/INSERT/UPDATE grants are rebuilt from the catalog
without calendar_token. New profile columns need an explicit client grant.
The frozen member policies stay unchanged pending decision 06. The connector
registry remains current, its tools still use the same invoker/staff paths,
and its explicit calendar-secret exclusions remain. No new connector tool or
service-role execution path was introduced.

The approval handler now verifies the user and staff result before privileged
lookup/delivery and escapes its HTML display name. The feed requires approved,
active membership before reading events. Their shared mail transport and feed
format remain covered by positive controls. The handler harness strips types
and swaps remote imports, executing the actual source under Node; this is not
a Deno deployment or a real email send.

Measurements before the final local gate: baseline SQL 1045/1045 across 46
files; the new 26-check SQL suite reproduced 14 failures before the repair,
with supported-path controls passing, then passed 26/26. The initial Edge
suite reproduced seven failures with four controls passing. The completed
17-test Edge suite includes six permissive mutation controls. The full unit
suite passed 1652/1652 in 121 files. The complete SQL chain, applied twice per
migration, passed 1071/1071 across 47 files; security mutations caught 92/92,
0046 mutations caught 17/17, and concurrent-session/approval races passed
11/11. Mutation runs require named failing checks and a complete test run;
rollback restores green after each mutation, and original source buffers must
remain byte-identical. PostgreSQL 16.11 and the psql client were extracted
under ignored work/ because this executor had no installed server or sudo;
no dependency/lockfile was changed.

Repeatable SQL proof:

```sh
node tools/sql-harness/run.mjs \
  --node tools/sql-harness/mutants-security-recheck.mjs \
  --node tools/sql-harness/mutants-0046.mjs \
  --node tools/sql-harness/race-0046.mjs
npx vitest run tests/security-recheck-edge.test.js tests/reply-to-mail.test.js
npm run connector:check
```

Landing protocol: freeze this implementation/record, run build, npm test,
ds:audit, discord:calendar:test, history:verify, test:checkin and the full
feature E2E suite, and read their summaries. Fetch/rebase immediately before
push, recheck the free migration number, and repeat the gate if main moved.
The final delivery reports actual command totals and the confirmed remote
commit. No force push. Logs and temporary tooling stay under ignored work/.

Not verified: live Supabase objects or migration installation, production Edge
Function versions, real mail delivery, real phones/NFC, and physical presence.
The available Supabase connector had no usable project/link binding in this
session (list_projects returned a missing link_id error). No production
credential was retrieved. A main push and a green Migrate report do not prove
installed function bodies; live catalog/read-path verification remains needed.
Edge Functions deploy separately from main/Migrate and remain an operational
follow-up even when the source tests pass. Public security stubs stay stubs.
