# 0003 Event family hub (Beach Blitz 2026): family form, carpool board, food board, mentor page
- Issued: 2026-10-03, by the IDEA & FRC chat (claude.ai), for one Claude Code session
- Owns: new event-hub files in src/, supabase/migrations/0005_* and 0006_*, supabase/functions/event-family
  (and event-mail if created), additive edits to src/App.jsx routes and nav, supabase/config.toml,
  src/dev/fixture/ catalog, tools/e2e/features.mjs, CLAUDE.md Built-so-far bullet, docs/history/ entry.
  Not supabase/*.sql or sql/ (frozen), not the weekly survey, not check-in routes.
- Migration permitted: yes, 0005 and 0006 only (with _rls_test siblings). Highest in
  supabase/migrations/ at issue: 0004
- Status: pushed to main 2026-10-04, for the code; NOT for the SQL or the function. Migrations 0005 and 0006 are on
  `main` and NOT applied to the live project, and `event-family` is NOT deployed: nothing in this session could reach
  either. `docs/history/brave-noether-tyn6cb.md` ends with the steps. Until they are done `/trips` says not set up yet.
- Branch: main (solo mode, decision 05: one push). The harness branch `claude/brave-noether-tyn6cb` was not pushed.
