# 0029 Beach Blitz readiness audit, fixes and observation options
- Issued: 2026-10-28 (chat session, no separate Claude Code prompt)
- Model: Opus 5.5. Mode: solo.
- Owns: src/roleRules.js; tests/role-rules.test.js; src/RoleBoardPage.jsx; src/RoleBoard.css; src/roleBoard.js; src/doThisNow.js; src/HomePage.jsx; tests/do-this-now.test.js; src/App.jsx; src/App.css; src/ScoutingPage.jsx; src/scouting/RecordForm.jsx; src/scouting/provenance.js; tests/scouting-provenance.test.js; api/_lib/connector/tools.js; api/_lib/connector/registry.generated.js; supabase/migrations/0036_role_board_my_shifts.sql; tools/sql-harness/check-0036.mjs; docs/history/beach-blitz-readiness-0029.md; docs/subsystems/rosters.md; docs/subsystems/scouting.md; supabase/migrations/README.md; supabase/migrations/0037_scouting_observation_options.sql; supabase/migrations/0037_scouting_observation_options_rls_test.sql; src/scouting/options.js; src/scouting/ObservationOptions.jsx; src/scouting/SuggestOption.jsx; src/scouting/MatchFields.jsx; src/scouting/spreadsheet.js; src/ScoutingPage.css; src/dev/fixture/features/scoutingoptions.js; src/dev/fixture/features/scouting.js; tests/scouting-options.test.js; tests/scouting-options-dom.test.js
- Migration permitted: yes, 0036 and 0037
- Claims: migrations 0036, 0037
- Status: landed on main (see docs/history/beach-blitz-readiness-0029.md)
