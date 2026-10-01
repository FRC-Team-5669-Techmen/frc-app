# 21 On phones, should Schedule open in Agenda, or on Month and scroll to the tapped day?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 35)
- Status: open
- Default if nobody decides: **what the tree does at `e652b01`: Agenda when the
  window is under 640px wide, Month at 640px and up** (`src/SchedulePage.jsx`,
  `aeb27fc`, 2026-10-01). The other half of the audit's draft default,
  scrolling a tapped month day into view, is not built and is the next small
  Schedule change.
- Decided: --

## What is actually true right now

- The view is chosen once, at load, from `(max-width: 639px)`; the toggle still
  offers Month and Agenda at every width. There is no Week view, although
  `CLAUDE.md` lists one.
- Before the change, phones opened on Month: cells 41 to 47px wide, all 20 chip
  titles clipped to 28px, and a tapped day's list rendering below the grid
  (at 342x673 it started at y=702, past the fold).

## The options

**A. Agenda on phones (today).**

**B. Month everywhere, plus scrolling the tapped day into view (S).** The grid
itself stays hard to read on a phone.

**C. Agenda everywhere.** Desktop users lose the month overview.
