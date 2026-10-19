# 0009 Sign-out requests, meeting check-in, quick pulse
- Issued: 2026-10-19, by the IDEA & FRC chat (claude.ai), the session that built the handbook. Mr. Pina: "Every function of the handbook has to function within the app live as soon as possible." This is round 1 of 4 (Sessions); quick pulse was asked for mid-round.
- Owns: supabase/migrations/0014_*, `tools/sql-harness/mutants-0014.mjs`, `src/signout.js`, `src/SignoutForm.jsx`/`.css`, `src/SignoutsPage.jsx`/`.css`, `src/QuickPulseControl.jsx`, the sign-out parts of `CheckinPage`, `VolunteerCheckinPage`, `HomePage`, the `/signouts` route and nav entry, `MAX_SESSION_HOURS` 12, `src/dev/fixture/features/signout.js`, `tools/e2e/features/signout.mjs`.
- Migration permitted: yes, 0014 only. Highest in supabase/migrations/ at issue: 0013
- Status: pushed to main 2026-10-19 (`7b7118f`). 0014 pasted by Mr. Pina 2026-10-19; its RLS test ran on the live project 23/23 PASS (his paste of the result grid).
- Branch: main (solo mode, decision 05).
- Next rounds: 2 standing (absence requests, lates, monthly 80%, weekly hours, probation, member page, grades flag); 3 records (discipline, safety, event rosters, conflicts, meals); 4 families and the rest.
