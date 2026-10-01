# 36 What may the /display wall screen show and do: may staff open a member's attendance history there, and who is listed on it?
- Raised: 2026-10-01 by the overnight session (the /display history, workstream D, and its verification pass)
- Status: open
- Default if nobody decides: **what the tree does at `e652b01`.** A staff
  viewer (mentor, lead or admin) clicks a name to open that member's attendance
  history, read-only: no "+ Manual session", Edit or Void. It covers the season
  Team Hours opens on, has no season switcher and does not close itself. A
  non-staff viewer sees the plain board. The board lists approved, active
  profiles, which includes an approved parent-only account.
- Decided: --

## What is actually true right now

- `/display` is often a staff session left open on a shared shop screen, so
  write controls there would let anyone at the screen void attendance. Staff
  still edit from Team Hours and `/verify-hours`.
- `AttendanceHistory` is read-only by itself; only Team Hours passes it the
  staff edit controls (`src/AttendanceHistory.jsx`).
- The data in the history is already readable by every member on `/hours`, so
  a history left open exposes nothing new; it only covers the board until
  someone presses Close or Escape.
- The board stopped listing unapproved accounts on 2026-10-01 (`ccd6aef`). A
  parent-only account that is approved and active is still listed, under
  UNASSIGNED.

## The options

**A. Read-only history, no auto-close, approved active profiles listed (the
default).**

**B. Close the history after a period of no interaction (for example 2
minutes).** The board is never left covered.

**C. List only members who hold a student, mentor, lead or admin role.** A
wall screen in the shop shows the team, not parents.

**D. Edit controls on `/display`.** Rejected by the default for the
shared-screen reason above.
