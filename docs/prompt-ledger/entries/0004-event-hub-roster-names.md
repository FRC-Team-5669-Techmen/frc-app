# 0004 Event hub roster: student leads included, names from the application
- Issued: 2026-10-05, by the IDEA & FRC chat (claude.ai), for one Claude Code session
- Owns: supabase/migrations/0010_*, the hub roster and naming functions, the src/ and fixture/e2e edits they
  require, docs/history entry. Not 0005 to 0009 (never edited in place), not supabase/*.sql.
- Migration permitted: yes, 0010 only (with _rls_test). Highest in supabase/migrations/ at issue: 0009
- Status: pushed to main 2026-10-06, for the code; NOT for the SQL. `0010_event_hub_roster_names.sql` and its test
  are on `main` and NOT applied to the live project (nothing in this session could reach it). The steps, with a
  verification query that lists the roster names, end `docs/history/brave-noether-tyn6cb.md`.
- Branch: main (solo mode, decision 05: one push). No branch was pushed.
