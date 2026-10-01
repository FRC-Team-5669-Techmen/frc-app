# 28 On a browser that reuses the same tab for a repeat tag tap, should check-out keep costing one tap on a "Check out" button?
- Raised: 2026-10-01 by the overnight session (the check-out fix, workstream B, and its check-in gate pass)
- Status: open
- Default if nobody decides: **keep it.** A page shown again never writes on its
  own; an open session there shows "Checked in since ... [Check out]" and waits
  for the tap. A fresh tag tap, which opens as a new navigation, still checks
  out with zero taps. `tools/e2e/checkin.mjs` step R7 pins the same-tab case,
  so changing it is a deliberate edit to that test and its README.
- Decided: --

## What is actually true right now

- The 2026-09-08 report ("every single time I try to check out it sent me to
  the check-in portal") was a `/checkin` page that toggled on every mount: a
  page shown again (the back-swipe its own VIEW STATUS link invites, a reload,
  Chrome on iOS reloading an evicted tab) silently wrote a check-out, so the
  real tap later found the student already out. Inferred from the code and
  reproduced in Chromium; not observed in live data.
- The fix (`src/attendanceState.js`, shipped in `9543e90`) marks the tag page's
  history entry as handled before writing anything, so a page that already
  carries the mark is treated as shown again.
- Chromium turns a same-URL navigation in the SAME tab into a reload that
  keeps that mark. So a browser that reuses the tab for a repeat tap gets the
  one-tap screen, never the silent write: R7 measures 0 writes on arrival,
  against 1 check-out from the one tap. `test:checkin` is 51/51 at `e652b01`
  at 375 and 1440.
- Not measured: whether a real Android or iOS browser reuses the tab for a tag
  tap, and whether WebKit keeps the mark when it reloads an evicted tab. If it
  drops it, that path behaves as before the fix, which is no worse than before.

## The options

**A. Keep the one tap (the default).** A repeat tap in the same tab cannot be
told apart from a reload or a back-swipe onto the page, and the silent write
on re-show was the reported bug. The cost is one clearly labelled tap on such
a browser.

**B. Zero taps everywhere by toggling on load again.** Brings the reported bug
back.

**C. Also mark the tab in `sessionStorage` (not built).** A second signal for
the page-shown-again case on browsers that drop history state; it does not
remove the one tap.
