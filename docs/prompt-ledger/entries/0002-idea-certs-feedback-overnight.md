# 0002 Overnight: IDEA certifications mirror, feedback system, open reports, shape language, overhaul audit
- Issued: 2026-10-01, about 05:30 UTC
- By: the FRC certifications rollout chat (claude.ai), for one Claude Code session
- Owns: the whole repository except supabase/*.sql, sql/, src/lib/design-system/, the skills/member_skills/cert_requests tables, src/CertifyPage.jsx, src/SkillsCatalog.jsx, src/MemberSkillsPanel.jsx, src/MemberSkillsHome.jsx, src/CoverageMatrix.jsx
- Migration permitted: yes, numbered 0001 to 0005 in order of need, nothing above 0005. Highest in supabase/migrations/ at issue: none
- Status: issued
- Branch: main (solo mode: pushed straight to `main` per Mr. Pina's 2026-09-27 rule; the harness branch `claude/zen-wozniak-n1tf1o` carries the same commits)
- Notes: Numbers reserved by this session at start, read from `supabase/migrations/` (empty of SQL at issue, confirmed on `main` and on every remote branch): 0001 workstream A (IDEA certifications mirror), 0002 workstream C (feedback), 0003 workstream E (Discord announcements), 0004 workstream F (member permissions). 0005 is left unused unless a workstream needs a second file. No earlier session had taken workstream A: neither `docs/prompt-ledger/entries/0002-idea-certifications-mirror.md` nor `supabase/migrations/0001_idea_certifications_mirror.sql` exists on any ref at start. Final notes are written in the closing push.
