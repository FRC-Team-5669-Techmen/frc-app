---
title: "Sign-out requests with mentor approval, meeting check-in, the 12-hour cap, and quick pulse (0014)"
date: 2026-10-19
branches: [main]
commits: [7b7118f]
migrations: ["0014_session_signout.sql", "0014_session_signout_rls_test.sql"]
subsystems: ["Check-in", "Presence board", "Dashboard", "Roster", "Testing"]
---

One solo session, ledger entry 0009, round 1 of making every function the
member handbook describes work in the app. Mr. Pina noticed the check-out note
had never been built. **0014 was pasted by Mr. Pina the same day; its RLS test ran on the live project 23/23 PASS.**

## What shipped

- **Sign-out requests** (handbook Section 7). With 0014 a tag tap or the
  dashboard Check Out, with a build session open, shows the note form: what
  you did (typed, or spoken through the browser's speech recognition; the app
  keeps no audio) and "My area is clean". It sends one `signout_requests` row;
  the tag route then waits ("Show a mentor your area"), polls every 10 s, and
  turns into the check-out receipt when approved or back into the form, with
  the reason, when sent back. Withdraw keeps the session. Hours stop at the
  approval: `approve_signout` writes the OUT then, carrying the note.
- **Approvers**: staff, and members given `signout.approve` on `/roster`.
  Nobody approves their own. `/signouts`: the queue (Approve, Not yet with a
  reason, Approve all), who is signed in, and Decided today with who decided,
  so Mr. Pina sees each day's student approvals. A nav entry with a count.
- **The guard**: a trigger refuses a non-staff member's own OUT on a build
  session (42501), so an old cached client cannot skip approval. FLL sessions
  still sign out directly, now with the note; `switch_to_fll` closes a build
  session and opens the FLL one in one call (a transaction-local setting lets
  its OUT past the guard and is switched off before the IN).
- **Meeting check-in** (Section 6): a scan during a `kind = 'meeting'` event
  logs present in the first 15 minutes and late after, once per member per
  meeting; a member already signed in keeps the session ("Sign out instead").
- **12-hour cap**: `MAX_SESSION_HOURS` 10 to 12.
- **Quick pulse**: on `/display` a staff viewer taps a name and signs that
  member in or out with two taps (`staff_add_event`, audited). Decision 36
  answered in part.

## Proof

- `0014_session_signout_rls_test.sql`: 23/23 on `tools/sql-harness/` with
  0004 and 0014; `mutants-0014.mjs` 12/12 caught. Removing the self-approval
  check alone is not a live mutant (the guard refuses the OUT too) and is
  recorded as equivalent.
- `tools/e2e/features/signout.mjs`: 90/90 at 375 and 1440, both migration
  states. `test:checkin` and `dashboard-checkout` now run with 0001 to 0013,
  the path the live app has until 0014 is pasted.

## Not verified, not built

- Nothing here reached the live project. Whether the Tuesday and Friday team
  meetings exist as `meeting` events on the schedule is unknown; meeting
  check-in records nothing for a meeting that is not on it.
- The 10 PM auto-close still runs (the handbook says there is no fixed
  closing time); a student who leaves without approval is closed by it, and
  that session is flagged for review and not counted.
- No push or Discord notice to approvers, no task picked at sign-in yet.
