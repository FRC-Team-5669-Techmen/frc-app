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
- [ ] M2 migration 0018 and its test pass in the SQL harness
- [ ] M3 tools/connector: inventory, schema, generated registry, `npm run connector:build`
- [ ] M4 api/_lib/connector engine, OAuth, MCP endpoint, vercel.json rewrites
- [ ] M5 src/ConnectorPage.jsx (consent card and admin page) and its route line
- [ ] M6 vitest suites (coverage, service role, OAuth, engine)
- [ ] M7 harness proofs (same rows as direct, refusals, mutants), MCP Inspector
- [ ] M8 docs, connector.yml, CLAUDE.md row, full gate, landing

Next: M2.

## Audit (answered from the tree before building)

Filled in as each item is measured; see the sections below.
