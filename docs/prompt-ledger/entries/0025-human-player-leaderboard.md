# 0025 Human player leaderboard: accuracy, rate and match-run drills, one Human Player Score per season
- Issued: 2026-10-23
- Model: Opus 5.5, parallel lane under a coordinator, local worktree /home/claude/frc-w-hp on branch local/hp (based on 90671076)
- By: the IDEA & FRC chat (claude.ai) coordinator, run as a Claude Code subagent
- Owns: src/HumanPlayerPage.jsx, src/HumanPlayer.css, src/humanPlayerScore.js, src/dev/fixture/features/humanplayer.js, tools/e2e/features/human-player.mjs, tools/sql-harness/mutants-0033.mjs, tests/human-player-score.test.js, tests/connector-human-player.test.js, supabase/migrations/0033_*, docs/subsystems/human-player.md, docs/history/local-hp.md, this entry, src/matchCues.js (the cue hook moved out of src/MatchSimPage.jsx, which now imports it); one-line edits to src/App.jsx, src/RobotPage.jsx, src/NavBar.jsx, src/navIcons.jsx, src/featureGuide.js, src/dev/fixture/routes.js, tools/e2e/features.mjs, tools/connector/registry/tools.yaml, api/_lib/connector/tools.js (+ regenerated registry), docs/subsystems/database.md, supabase/migrations/README.md, tools/sql-harness/README.md, CLAUDE.md
- Migration permitted: yes. Number: 0033 (0031 is the highest on main at issue; 0032 is reserved by another session)
- Claims: ledger 0025; migration 0033 (human player leaderboard) with its _rls_test.sql and mutants-0033.mjs
- Status: committed locally, not pushed (the coordinator lands it)
- Branch: local/hp
- Notes: 0033 replaces _merge_member_rules (copied from 0031 with four hp_attempts columns); if 0032 also replaces it, whichever lands second must carry both lists. Record: docs/history/local-hp.md.
