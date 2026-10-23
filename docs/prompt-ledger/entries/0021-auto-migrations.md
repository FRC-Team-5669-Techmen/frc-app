# 0021 Automatic SQL migrations: migrate.yml, tools/apply-migration.mjs, the schema_migrations record seeded through 0026
- Issued: 2026-10-23
- Model: Opus 5.5, local worktree session (branch local/migrate from 9a82206), committed locally, not pushed
- By: the IDEA & FRC chat (claude.ai), run as a Claude Code subagent session started 2026-10-23T17:55Z.
- Owns: .github/workflows/migrate.yml, tools/apply-migration.mjs, tools/sql-harness/migrate-e2e.mjs, tools/sql-harness/run.mjs (range flag only), tools/sql-harness/README.md, tests/apply-migration.test.js, tests/workflows.test.js, CLAUDE.md (Database section and Last reviewed only), docs/subsystems/database.md, docs/subsystems/ci-workflows.md, supabase/migrations/README.md, docs/history/auto-migrations-0021.md, this entry.
- Migration permitted: no. Highest in supabase/migrations/ at issue: 0028 (0029 driver leaderboard and 0030 scouting may arrive from other sessions). The bootstrap is not a numbered migration: the tool creates and seeds the record itself on every run, so 0031 was not taken.
- Claims: ledger 0021; no migration number; no SQL file.
- Status: committed locally (55382fd), not pushed
- Branch: local/migrate (worktree /home/claude/frc-w-migrate), committed locally; the caller integrates it.
- Notes: Excluded on purpose: idea-app's destructive-DDL scanner, ledger gate, per-object verification and committed record files. deploy.yml is untouched, so a migration reaching main through deploy.yml (a GITHUB_TOKEN push) does not start Migrate until the next qualifying push or a Run workflow. Record: docs/history/auto-migrations-0021.md.
