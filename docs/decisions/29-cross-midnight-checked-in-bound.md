# 29 How long after Los Angeles midnight should a session opened the evening before still count as "checked in"?
- Raised: 2026-10-01 by the overnight session (the check-out fix, workstream B)
- Status: open
- Default if nobody decides: **10 hours, the session cap.** An IN still counts as
  checked in while it is from today (LA) or inside `MAX_SESSION_HOURS`
  (`src/hoursUtils.js`, 10), the same knob the hours math uses for a forgotten
  check-out. An IN older than that is a forgotten check-out and does not count.
  This is what `src/attendanceState.js` does at `e652b01`.
- Decided: --

## What is actually true right now

- Before 2026-10-01 every copy of the rule stopped at the phone's local
  midnight, so a session open across midnight read as not checked in and the
  tag offered a check-in instead of a check-out.
- The dashboard tile, both tag pages, the presence board, the dashboard glance
  and the parent view now read the one rule (`currentStatus` in
  `src/attendanceState.js`); the board, glance and parent view read events from
  `presenceSinceISO()` so they see the same window. `test:checkin` step M checks
  it at 12:30 AM LA.
- The cost of 10 hours: an IN made after the 10 PM auto-close has run, followed
  by a tag tap the next morning within 10 hours, checks out automatically and
  credits up to 10 hours. That session is under the cap, so nothing flags it;
  the old rule left a flagged `double_in` instead.

## The options

**A. 10 hours (the default).** One knob for the cap and the status rule.

**B. Across midnight only until a fixed early-morning LA hour (for example
4 AM).** Closes the next-morning case; a real overnight event past that hour
reads as checked out.

**C. Across midnight only within a short window (for example 3 hours).** Same
trade, measured from the IN.

Pick B or C if check-ins after 10 PM happen in practice.
