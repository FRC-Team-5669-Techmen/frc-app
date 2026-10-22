# 0015 Event scouting with auditable observations
- Issued: 2026-10-21T06:00:00Z, cloud Codex session, authorized handoff.
- Owns: src/scouting/**; src/ScoutingPage.jsx; src/ScoutingPage.css; src/App.jsx; src/NavBar.jsx; src/dev/fixture/features/scouting.js; src/dev/fixture/routes.js; src/permissions.js; supabase/migrations/0022_scouting*.sql; supabase/functions/scouting-*; tools/e2e/features/scouting.mjs; tools/sql-harness/scouting*.mjs; tests/scouting*.test.js; tools/connector/registry/*; api/_lib/connector/registry.generated.js; docs/scouting/**; docs/subsystems/scouting.md; docs/decisions/46-scouting-inside-frc-app.md; docs/history/scouting-2026-evidence.md; CLAUDE.md
- Migration permitted: yes, 0022 only. Highest observed on all fetched refs: 0021.
- Status: implemented and locally verified; restored and pushed; draft PR #4 open. Local/native/browser/CI gates passed; draft PR #4. External release/field/source acceptance remains blocked.
- Branch: codex/scouting-2026-evidence
- Notes: Current main 9bb3a07 contains prior ledger 0013/0014 artifacts despite their stale pushed labels. No scouting ledger, code or open PR found. No production deployment, live SQL mutation, or real notification permitted. Private source handoff excluded. A codex branch avoids the claude branch auto-integration workflow and preserves the requested PR review.
