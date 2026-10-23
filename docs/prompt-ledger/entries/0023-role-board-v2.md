# 0023 Role board v2: per slot assignment, no blocking, backups, lunch pit watch, connector tools
- Issued: 2026-10-23
- Model: Opus 5.5, solo, local worktree branch local/roles (based on c6b19f5); the coordinator lands it on main
- By: the IDEA & FRC chat (claude.ai) coordinator, run as a Claude Code subagent, for the 3:10 PM team meeting before Beach Blitz.
- Owns: src/RoleBoardPage.jsx, src/roleBoard.js, src/RoleBoard.css, src/RostersPage.jsx (role list only), src/dev/fixture/features/partd.js, supabase/migrations/0031_*, supabase/migrations/0028_role_interest_board_rls_test.sql (checks 3 and 12 follow 0031), tools/sql-harness/mutants-0031.mjs, tools/sql-harness/sim-0031.mjs, tools/e2e/features/role-board.mjs, tools/e2e/features.mjs (list), tests/part-d-models.test.js, tools/connector/registry/*.yaml, api/_lib/connector/tools.js (role_board read), api/_lib/connector/registry.generated.js, docs/subsystems/rosters.md, docs/history/role-board-v2-0023.md, this entry.
- Migration permitted: yes. Number: 0031 (0029 drivers and 0030 scouting exist in this tree).
- Claims: ledger 0023; migration 0031 with its _rls_test.sql, mutants-0031.mjs and sim-0031.mjs.
- Status: committed locally, not pushed (coordinator lands it)
- Branch: local/roles
- Notes: Record: docs/history/role-board-v2-0023.md.
