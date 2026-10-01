# 25 Should accessibility and layout regressions on the app's real routes block a branch, or only be reported?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 65)
- Status: open
- Default if nobody decides: **unchanged: every browser check runs locally only,
  and none runs in CI.** A session asked to work here commits a fixture-mode
  spec that runs axe-core plus the existing `contrast()`, `tapTargets()` and
  horizontal-scroll checks over every route per persona at 342x673, 375x812,
  384x692 and 1440, with a positive control, report-only until serious and
  critical findings reach 0, then blocking.
- Decided: --

## What is actually true right now

- Local only, all from 2026-10-01: `npm run test:checkin` (51/51 at
  `e652b01`), `npm run test:features` (957/957), and the plate's tools under
  `tools/e2e/plate/` (the 44px sweep, the keyed-rule check, on/off screenshots).
  They need the container's Chromium, which CI does not install.
- `tools/browser-verify/checks.mjs` has `contrast()` and `tapTargets()`, run
  only on `/_ds`.
- The viewport parsing that dropped `342x673` is fixed (`ef9edd7`, `a685503`).
- Fixture mode renders every route for every persona with no credential, which
  is what a CI browser job would drive.
- Every contrast and accessibility number in the audit came from scratch
  harnesses outside the repo.

## The options

**A. Blocking now.** Every branch goes red until about 451 contrast nodes are
fixed (decision 24).

**B. Report-only, then blocking (the recommendation).**

**C. Report-only forever.** Regressions are visible but never stopped.
