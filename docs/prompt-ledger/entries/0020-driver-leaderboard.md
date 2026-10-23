# 0020 Driver leaderboard: drive time, MoSim, coach ratings, Driver Score
- Issued: 2026-10-23
- Model: Opus 5.5, parallel lane under a coordinator
- By: a coordinator session (Claude Code), worktree /home/claude/frc-w-drivers on branch local/drivers from 9a82206
- Owns: src/DriversPage.jsx, src/Drivers.css, src/driverScore.js, src/dev/fixture/features/drivers.js, tools/e2e/features/drivers.mjs, tools/sql-harness/mutants-0029.mjs, tests/driver-score.test.js, tests/connector-drivers.test.js, supabase/migrations/0029_*, docs/subsystems/drivers.md; one-line edits to src/App.jsx, src/RobotPage.jsx, src/NavBar.jsx, src/navIcons.jsx, src/featureGuide.js, src/dev/fixture/routes.js, tools/e2e/features.mjs, tools/connector/registry/tools.yaml, api/_lib/connector/tools.js (+ regenerated registry), CLAUDE.md
- Migration permitted: yes. Highest in supabase/migrations/ at issue: 0028
- Claims: ledger 0020; migration 0029 (driver leaderboard) with its _rls_test.sql
- Status: committed locally; the coordinator integrates and pushes
- Branch: local/drivers
- Notes: 0029 replaces _merge_member_rules (copied from 0028 with six driver columns); a parallel lane that also replaces it must merge both lists. Record: docs/history/local-drivers.md.
