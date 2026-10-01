# 33 Should the IDEA certifications mirror know a student only by their lowercased school sign-in email, and who may read it?
- Raised: 2026-10-01 by the overnight session (the IDEA certifications mirror, workstream A)
- Status: open
- Default if nobody decides: **email only, as migration
  `supabase/migrations/0001_idea_certifications_mirror.sql` builds it.** A
  holder row carries the holder's lowercased email and no member id. So IDEA
  Classroom must record each student's school sign-in email, or that student
  will not see their own certifications on `/certifications`. Reads: an
  approved member, whatever their status, reads the catalog and every holder;
  a parent-only account reads the catalog and only their linked students'
  holder rows; an account with no approved profile reads nothing.
- Decided: --

## What is actually true right now

- A holder need not have an app account, which is why the mirror does not key
  on a member id; a second key could also disagree with the first.
- `profiles` has no email column. The email lives on `auth.users`, so a
  parent's linked students' emails are read through a SECURITY DEFINER helper.
- Students sign in with their school Google account. A student whose IDEA
  record carries any other address is invisible to their own page.
- This is an exception to `CLAUDE.md`'s rule that new tables reference the
  member id (audit item 67, decision 27).
- 0001 is on `main` and not applied anywhere real. Its RLS test passed 27 of 27
  checks on the throwaway harness on 2026-10-01.

## The options

**A. Email only (the default).** One identity, and the sync contract stays
simple. Costs one rule for whoever runs IDEA: record the sign-in email.

**B. Also resolve a member id at sync time.** Lets job gating use the mirror
(decision 27). Adds a second identity that can disagree with the first, and
holders without accounts still need the email.

**C. Require status `active` for the full holder read.** Alumni and inactive
members would see only their own rows.
