# 0006 IDEA certifications cutover
- Issued: 2026-10-16, by the IDEA & FRC chat (claude.ai), for one Claude Code session
- Owns: supabase/migrations/0012_*, the old skills system's UI (`/skills`, `/certify`, `/coverage`, `/study`, their
  components, nav entries, dashboard tiles, the cert-request queue), `src/JobsPage.jsx` job gating, `src/CertificationsPage.jsx`
  (verify links, the earned-at-IDEA line, the sync-log export), docs/decisions/27, 33 and 34, fixture/e2e/tests they require,
  docs/history entry. Not 0001 to 0011, not supabase/*.sql, not any idea_cert_* table or idea_cert_sync().
- Migration permitted: yes, 0012 only (additive or a function replacement). Highest in supabase/migrations/ at issue: 0011
- Status: pushed to main 2026-10-16, for the code; NOT for the SQL. `0012_jobs_idea_cert_gate.sql` and its
  `_rls_test.sql` are on `main` and NOT applied to the live project (nothing in this session could reach it). The paste
  steps and what success looks like are under "For Mr. Pina" in `docs/history/upbeat-keller-i4t69g.md`.
- Branch: main (solo mode, decision 05: one push). The harness minted `claude/upbeat-keller-i4t69g`; nothing was pushed to it.
- Notes: Decisions 27, 33 and 34 recorded as answered (Mr. Pina, 2026-10-14). No table dropped, no row deleted: the drop
  statements for later are in the history entry, with the three functions that must be re-defined first. The prompt's
  "old FRC training page" was read as `/study` (Self-Study, header tag TRAINING), the only training-shaped page.
