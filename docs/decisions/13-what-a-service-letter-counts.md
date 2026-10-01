# 13 What exactly does a signed service-hour letter count: staff hour adjustments, capped sessions, still-open sessions?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 28)
- Status: open
- Default if nobody decides: **what the tree does at `e652b01`:** staff hour
  adjustments are NOT in the letter, the Reports export, the per-event rollup
  or the Team Hours CSV; a session longer than 10 hours counts as 10 hours and
  is marked `(capped)` in the itemized record, and the letter's method
  sentence says so; a session still open is counted (up to now, or to the cap
  once it passes 10 hours).
- Decided: --

## What is actually true right now

- My Hours and the Team Hours table count `hour_adjustments`; the letter,
  exports, rollup and CSV do not (`src/reporting.js`, `src/ReportsPage.jsx`,
  `src/HoursBoard.jsx`). So a student, Team Hours and their letter can
  disagree by the adjustment.
- Fixed on 2026-10-01 (`921bbbd`): the letter's sentence now reads that "a
  session longer than 10 hours (usually a missed sign-out) is counted as 10
  hours and marked capped below", which is what the code does; the itemized
  record marks it `(capped)`; and a letter with no From date can no longer be
  generated (it printed "January 1, 1970").
- The audit's draft default had three parts: count adjustments, count capped
  sessions at the cap with a mark, and leave open sessions off. The second and
  third conflict for the commonest case: a missed sign-out still open past 10
  hours is both open and capped. The fix of 2026-10-01 therefore left open
  sessions in. Leaving off only a session still open UNDER the cap (the one
  running right now) would satisfy both parts.

## The options

**Adjustments.** Include them, each as its own itemized row with category,
signed hours, reason and date: one number everywhere, with the reason visible.
Or exclude them (today): the letter, which is the copy that leaves the
building, disagrees with what the student sees.

**Capped sessions.** Count at the cap and mark them (today). Or leave them off
until a mentor fixes them: never overstates, but understates every student
whose missed sign-out is still in the queue.

**Open sessions.** Leave off only a session still open under the cap, so a
letter never certifies time still running and a stale missed sign-out still
counts at the cap. Or count every open session (today).
