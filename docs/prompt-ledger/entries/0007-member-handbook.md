# 0007 Member handbook in the app
- Issued: 2026-10-19, by the IDEA & FRC chat (claude.ai), worked in the same session that wrote the handbook
- Owns: `src/HandbookPage.jsx`/`.css`, `src/handbook/` (handbook.md, content.js, lessons.js, sign.js, diagrams.js), the
  `/handbook` route and its avatar-menu entry, the dashboard Handbook tile, supabase/migrations/0013_*,
  `tools/sql-harness/mutants-0013.mjs`, `src/dev/fixture/features/handbook.js`, `tools/e2e/features/handbook.mjs`,
  `tests/handbook.test.js`, docs/history entry.
- Migration permitted: yes, 0013 only. Highest in supabase/migrations/ at issue: 0012
- Status: pushed to main 2026-10-19, for the code; NOT for the SQL. `0013_handbook_acknowledgments.sql` and its
  `_rls_test.sql` are on `main` and NOT applied to the live project. Until they are pasted the Sign tab says signing is
  not set up yet; every lesson still works.
- Branch: main (solo mode, decision 05).
- Notes: the text is the release tab of the Claude Doc "FRC Team 5669 Member Handbook"
  (https://claude.ai/code/artifact/be82a6a8-964f-4edd-8547-19e8de8d5b9c), version October 20, 2026. The doc and
  `src/handbook/handbook.md` change together.
