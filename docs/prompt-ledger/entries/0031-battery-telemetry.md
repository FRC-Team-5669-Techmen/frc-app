# 0031 Battery telemetry: robot-measured power per match on the battery board
- Issued: 2026-10-28 (chat session, "run it now", 14:33)
- Model: Opus 5.5, high. Mode: solo.
- Owns: supabase/migrations/<next>_battery_telemetry.sql and its _rls_test.sql; src/robotMatches.js and its tests; the battery board page/components and CSS; the robot match detail view; api/_lib/connector/tools.js and tools/connector/registry/ (only the battery and robot-match tools; regenerate registry.generated.js the way the repo does); src/dev/fixture/features/robotmatches.js and any battery fixture; tests for each; tools/e2e/features for these pages if they exist; docs/history/battery-telemetry-0031.md; docs/prompt-ledger/entries/0031-battery-telemetry.md; CLAUDE.md "Last reviewed" line only.
- Migration permitted: yes, 1. Highest in supabase/migrations/ at issue: 0040
- Claims: 0041
- Status: landed on main (see docs/history/battery-telemetry-0031.md)
