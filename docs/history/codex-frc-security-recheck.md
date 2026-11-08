---
title: "Recheck the frozen security audit and repair decision-independent boundaries"
date: 2026-11-07
branches: [main]
commits: [2d87b63]
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
| 1 | Fixed by later work | Fixed, retained and tested | 4379cb7/0046; security RLS checks 1-2; named grant mutations | No decision; installed client ACL verified read-only |
| 2 | Still open | Still open | Full-chain local pending-account probes; invoker wrappers preserve the policy | Decision 06: approved/active member data boundary |
| 3 | Still open | Still open | Full-chain local member-table probe; current policy/trigger catalog | Decision 06: protected approval/status/exemption fields |
| 6 | Still open, with partial later work | Fixed and installed in SQL | 3a283ea and 4379cb7 partial controls; new RLS checks 3-11 and five permissive mutations | No policy decision; physical GPS/NFC remains device evidence |
| 7 | Still open | Fixed and installed in SQL | New RLS check 12, owner controls 13-14, per-function/per-role grant mutants; README role-set rule | None |
| 8 | Still open | Source fixed; deployment pending | tests/security-recheck-edge.test.js executes the actual handler with isolated clients/transport; auth/staff/error/escaping red-green and mutations | Choose the deployment connection; deploy send-approval-email with _shared/mail.js |
| 14 | Still open | Still open | Public stub, decision 07, current claim/role catalog, later standing/merge scope | Decision 07: participation versus access and alumni scope |
| 15 | Still open | Still open | Current approve RPC, whitelist policy, invite handler and role selection; local catalog agrees | Decision 08: who may grant mentor |
| 16 | Still open | Still open | Current send-parent-request handler, local schema, consent display; 8cedc44 is transport only | Decision 14: membership/send limits and confirmation before acting on consent |
| 50 | Still open | Still open | Fictional parent-only local read with a positive attendance fixture; base policy unchanged | Decision 10: linked students, totals or full team scope |
| 51 | Still open, partial sign-out protection | Still open | Local lead/staff helper and fictional mentor self-credit probe; 0046 is narrower | Decision 09: lead meaning and self-credit/override policy |
| 52 | Still open | SQL installed; feed deployment pending | New RLS checks 15-26 and permissive mutations; actual feed handler tests membership before events | Choose the deployment connection; deploy calendar-feed |

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

The implementation landed at `2d87b63ce6ad683a68d5330f0ea70061e011e4e7`,
confirmed by the remote main ref and the committed audit artifact. Immediately
before push, fetch/rebase left the gated commit unchanged, remote main still
ended at 0048, and 0049 was free with no duplicate number. No force push.
The exact implementation tree passed all seven commands: build (200 precache
entries, 2611.67 KiB), unit (121 files, 1652 tests), design audit (36 aliases
across three grounds, 79 components, 315 files), calendar (19/19), history
(lossless across 50 original and 50 post-split entries), check-in (51/51), and
features (8491/8491 across all 35 specs at 375, 1152 and 1440). The delivery
record is frozen separately and receives the same gate before its own push.

Live read-only evidence became available through the connected Supabase
project. Before this push, the migration record reached 0048, item 1 client
execution was already closed, and the targeted internal/profile grants were
still open. The installed approval-mail and calendar-feed sources lacked the
new caller and membership checks respectively. No member rows, real names,
addresses, tokens, secrets or email credentials were retrieved.

[Migrate run 42445147896](https://github.com/FRC-Team-5669-Techmen/frc-app/actions/runs/42445147896)
succeeded after the main push. Independent catalog reads then confirmed the
0049/security_recheck record, the enabled attendance_00_client_integrity
trigger attached to the invoker helper, attendance_record still SECURITY
INVOKER, and the three changed function bodies identical to the local harness
by body hash. Effective anon/authenticated/service_role grants on the managed
internal functions total zero. Anon/authenticated SELECT/INSERT/UPDATE grants
on calendar_token total zero; full_name read and nickname edit remain granted.
Both own-token RPCs grant exactly authenticated, with anon and service_role
false. This is installed-object proof, not an authenticated production RLS
exercise. CI and Connector tools also completed successfully for 2d87b63.
Security advisors were reviewed before and after; the remaining findings are
outside these repaired boundaries or depend on the open policy decisions.

Still pending: the deployment tool requires a connection choice when more
than one connected account matches the target. That choice was requested in
chat and has not arrived. Consequently send-approval-email (with shared mail)
and calendar-feed were not deployed by this job. SQL is installed; the two
Edge fixes are source-complete and tested, with operational closure pending.
No live mail was sent and no production actor/session was created. Deno
runtime delivery, signed-in production behavior, real mail, real phones/NFC,
physical presence and actual pg_net/pg_cron delivery remain unverified. Public
security stubs, including item 14, stay stubs.
