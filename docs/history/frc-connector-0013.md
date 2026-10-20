---
title: "The Techmen connector: a remote MCP server so Mr. Pina can run the app from any Claude chat (ledger 0013)"
date: 2026-10-19
branches: [main]
commits: []
migrations: ["0018_connector.sql", "0018_connector_rls_test.sql"]
subsystems: ["Connector", "Feedback", "Roster and access", "Testing", "CI workflows"]
---

## Progress

Kept current so a restarted session can resume. Each milestone is a local commit.

- [x] M1 rebased onto origin/main 4f3ccff; read CLAUDE.md, the ledger and migrations READMEs, idea-app's connector; audit started
- [x] M2 migration 0018 and its test pass in the SQL harness (23/23; mutants-0018 12/12); docs/connector/allowlist.sql; package.json has @modelcontextprotocol/sdk 1.32.1 and pg 8.16.3 (dev)
- [x] M3 tools/connector: sqlchain, inventory, gates, registry YAML, build.mjs writing api/_lib/connector/registry.generated.js; `npm run connector:build` / `connector:check`
- [x] M4 api/_lib/connector (crypto, errors, backend, oauth, registry, engine, resolve, dates, tools, mcp, node, log-tables), api/mcp.js, api/connector/[route].js, vercel.json rewrites
- [ ] M5 src/ConnectorPage.jsx (consent card and admin page) and its route line
- [ ] M6 vitest suites (coverage, service role, OAuth, engine)
- [ ] M7 harness proofs (same rows as direct, refusals, mutants), MCP Inspector
- [ ] M8 docs, connector.yml, CLAUDE.md row, full gate, landing

Next: M5 (src/ConnectorPage.jsx + .css, App.jsx route, fixture routes line).

## Audit (answered from the tree before building)

Filled in as each item is measured; see the sections below.

## Design decisions taken while building (each the most conservative reading)

- **Signatures are read off the SQL files, not a database** (`tools/connector/sqlchain.mjs`), because CI reads no credential and the build must need none. `tools/connector/harness/check-parse.mjs` proves the parse against a real PostgreSQL 16 with the whole chain applied: 264/264 signatures match `pg_proc` (names, defaults, set-returning, definer), 2026-10-19.
- **Harness scripts live under `tools/connector/harness/`**, not `tools/sql-harness/`, because only `tools/connector/**` is owned. They run through `tools/sql-harness/run.mjs --node` unchanged.
- **Two Vercel functions, not one per route**: `api/mcp.js` and `api/connector/[route].js`. The Hobby plan caps a deployment at 12 functions and the app already has one.
- **The consent card and the admin page are one React route**, `/connector/*`, outside `ProtectedLayout` so a signed-out phone can still sign in on the consent card. Registering it takes the route line and its `lazy()` import line in `src/App.jsx` (the import cannot live inside the route line without remounting on every render), plus one line in `src/dev/fixture/routes.js`, which `tests/fixture-routes.test.js` requires for every route in `App.jsx`. That last file is outside the owned paths; CLAUDE.md's gate wins.
- **The consent card signs in by email code as well as Google.** Google returns to the redirect address only if Supabase allows it, which this repo cannot see; the code never leaves the page.
- **Hours are read through the database's own `member_standing`**, never re-derived in `api/`, so there is no second copy of the hours arithmetic. Today's sign-ins need the LA calendar day; `src/hoursUtils.js` cannot be imported by a Vercel function (its own imports have no extensions, which Node ESM refuses), so `api/_lib/connector/dates.js` carries a one-line copy of `laDateKey` and `tests/connector-engine.test.js` holds it equal to the original across DST edges.
- **Functions whose first argument is a family capability token** (`family_call`, `hub_add_parent`, `hub_household_open`, `hub_remove_family`, `hub_remove_guardian`) are excluded: they act as whichever family holds the link, not as the signed-in account.
- **Edge Functions the app invokes** are inventoried. None gets a generated tool, because their request bodies are declared nowhere the build can read; each is excluded with its reason, and `discord-announce` and `invite-member` (which message people outside the app) are named as the next hand entries. `connector_external_begin`/`_finish` (0018) are the audit path they will use.
- **Table-write exclusions are keyed by file, table and operation with a count**, and the line numbers are recorded in the generated registry. A key on line numbers alone would redden every unrelated edit that moves a line; a key with a count still reddens a new write.
