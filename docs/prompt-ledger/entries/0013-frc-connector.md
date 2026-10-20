# 0013 FRC connector (remote MCP for Mr. Pina)
- Issued: 2026-10-19, by the IDEA & FRC chat (claude.ai), run unattended in one Claude Code session.
- Owns: api/mcp.js and api/connector/** (MCP endpoint, OAuth routes, .well-known documents; vercel.json rewrites for these paths only); api/_lib/connector/**; tools/connector/**; src/** files whose name starts with Connector, plus one route line registering an admin page for it; tests/connector*/** and tests/connector*.test.js; supabase/migrations/<next free>_connector*.sql and its _rls_test.sql sibling; .github/workflows/connector.yml; package.json (connector scripts and dependencies only) and package-lock.json as npm writes it; docs/subsystems/connector.md, docs/connector/**, one row in CLAUDE.md's subsystem list; docs/prompt-ledger/entries/0013-frc-connector.md, docs/history/frc-connector-0013.md
- Migration permitted: yes. Highest in supabase/migrations/ at issue: 0017
- Claims: ledger 0013; migration 0018 (to be re-checked at landing)
- Status: issued
- Branch: main (solo mode, decision 05)
- Notes: direct table writes in src/ are excluded from connector coverage for now and move to functions in the next connector ledger.
