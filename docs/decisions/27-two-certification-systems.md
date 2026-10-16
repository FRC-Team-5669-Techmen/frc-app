# 27 Now that IDEA Classroom is the official certification record, retire the app's own skills certifications, keep them for team-only skills, or move job gating to the IDEA mirror?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 67)
- Status: answered
- Decided: 2026-10-14, Mr. Pina: retire the app's old skills certification
  system and the old FRC training page, "it teaches nothing." Job claiming
  must not break. Built by ledger 0006 (`docs/history/upbeat-keller-i4t69g.md`):
  options A and C together. `/skills`, `/certify`, `/coverage` and `/study`
  redirect to `/certifications`; job gating moves to the IDEA mirror through
  migration `supabase/migrations/0012_jobs_idea_cert_gate.sql`, and until
  0012 is pasted the Jobs page keeps the old gate. No table was dropped.
- Default before the decision: both kept running unchanged, and the app's own
  `member_skills` kept gating jobs.

## What was true when it was raised

- `docs/IDEA_CERTIFICATIONS_SYNC.md` makes IDEA Classroom "the one official
  record" and defers retiring the app's system to a later decision; this is
  that decision.
- `/certify` and `approve_cert_request` still award `member_skills`
  certifications, and job claims gate on them (`src/JobsPage.jsx`).
- Students now see `/skills` and `/certifications` side by side, so a student
  can be certified on one page and not the other.
- The IDEA mirror (migration 0001) keys holders by email, with no member id
  (decision 33). That is an exception to `CLAUDE.md`'s rule that new tables
  reference the member id.

## The options

**A. Retire the app's system (L).** Touches job gating, the coverage matrix,
the certify page and cert requests.

**B. Keep it for team-only skills IDEA does not certify (S).** Relabel it so it
never reads as official.

**C. Move job gating to the IDEA mirror (M).** Needs an email-to-member
mapping, because the mirror has no member id.

**D. Do nothing (the default).** Two records that can disagree.
