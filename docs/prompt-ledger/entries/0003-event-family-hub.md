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
- Notes: 2026-10-05, a follow-up asked by Mr. Pina directly in the same session, not a new prompt: the open
  sign-up link (decision 43, option B, more than one parent per student). It took migration 0007, the next
  free number on `main` and on every remote branch at the time; `docs/history/brave-noether-tyn6cb.md` has
  the record and the steps.
  2026-10-05, a second follow-up asked by Mr. Pina in the same session: the family page redesign (parts with a
  progress tracker, info cards, rides and seats in one place, collapsible event info) and migration 0008 (a
  parent driving without their own student, removing a parent or a whole family, mentors seating two at once,
  adults 0 to 30, the one-child rule always on, decision 44). 0008 was the next free number on `main` and on
  every remote branch when it was taken.
