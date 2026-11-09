# codex-frc-ops-nov8 Remaining FRC operations
- Issued: 2026-11-09T01:18:49Z
- By: Codex, user-authorized solo job
- Owns: src/, supabase/migrations/, tools/e2e/, tools/sql-harness/, tests/, docs/subsystems/, docs/decisions/54-frc-direction-roster-and-pit-rules.md, docs/history/codex-frc-ops-nov8.md, docs/prompt-ledger/entries/codex-frc-ops-nov8.md, CLAUDE.md
- Migration permitted: yes. Highest at issue: 0050. Reserve 0051, recheck at landing.
- Status: issued
- Branch: main
- Notes: Read required project, audit, history and subsystem files before changes. Fetched and rebased onto 77cc698. Solo, no agents. Build named parent service records/export first; venue competition check-in and expiring exemptions second; lead scout tally third; mentor-only advisory rotation fourth; student updates fifth. No real identities or live member writes. Migration delivered only by migrate.yml on push. Full seven-command local gate required before fast-forward main push, no force. Existing 0011 CSV contains adult counts, not the requested named attendance/times. Existing 0031 assignments and rotation warnings, scouting coverage, and post-October features are retained.

Implemented all five items; see docs/history/codex-frc-ops-nov8.md for verified before/after findings. Targeted proof: 233/233 browser checks (42 geometry views and six one-page PDF states), 1664/1664 unit tests, 1266/1266 native SQL checks, 73/73 permissive SQL mutations, 32/32 named-default ACL closures and 2/2 omitted-revoke controls. No live member/setting write. The complete solo gate and final fetch/number check precede the main push.
