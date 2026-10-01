# 37 Should This Week and the 6-week trend on My Hours count only sessions that count toward totals?
- Raised: 2026-10-01 by the overnight session (the My Hours fix, workstream B)
- Status: open
- Default if nobody decides: **yes, as `src/myHoursModel.js` does at
  `e652b01`.** A session pending mentor review or voided is left out of This
  Week and the trend, as it is from the totals, matching the page's existing
  notice that such sessions are "not counted in your totals yet". Staff hour
  adjustments count in the season and category totals but not in This Week or
  the trend, because they correct a season rather than record a week's work.
- Decided: --

## What is actually true right now

- Before 2026-10-01, This Week and the trend summed sessions the totals left
  out; the fixture page showed This Week 15h beside All Time 6h 5m.
- Every hour figure on My Hours now comes from one derivation: the rows the
  session list shows, each marked counted, pending, voided or flagged. A voided
  row shows a "not counted" marker.

## The options

**A. Counted sessions only (the default).** This Week can never exceed All
Time.

**B. Raw presence.** This Week shows time in the shop whatever its review
state, and can exceed All Time, which is the confusion the 2026-09-23 report
described.

**C. Adjustments in the trend too.** A season correction would show up as one
spiky week.
