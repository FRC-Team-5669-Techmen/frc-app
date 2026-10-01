# 23 Beyond the 44px floor on student screens, should staff screens get a 24px absolute floor, and how is a dense staff control exempted?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 38)
- Status: open
- Default if nobody decides: **what the tree does at `e652b01`: the plate
  (`src/plate.css`, on while `APP_PLATE` in `src/plate.js` is `'tm-plate'`)
  gives every student-reachable control a 44px floor, and dense staff-only
  controls are left as they are** (the skills catalog's reorder arrows, a
  table row's resend, the survey editor's mini keys). No absolute floor applies
  to staff screens.
- Decided: --

## What is actually true right now

- The student half is Mr. Pina's own instruction in the session prompt of
  2026-10-01: "Every touch target on a student screen stays at least 44px."
- Measured by `tools/e2e/plate/measure.mjs` over every student-reachable route
  and state (`docs/SHAPES.md`): 708 targets, 0 under 44px with the plate on at
  375 and at 1440; 417 and 298 under 44px with it off.
- Cost seen in a sampled look on 2026-10-01: at 342px wide the nav pads wrap
  to three rows (two without the plate), because the 44px floor raises the
  37px nav links. Check Out stays in the first screen (about 333px down,
  against 287px with the plate off).
- The plate sets labels at an 11px floor; no measured text-size floor exists
  for running text.

## The options

**A. idea-app's full rule.** 44px on every student- and parent-facing
control, a 24px absolute floor everywhere, and staff-only exemptions only where
the surface's root carries a named class, plus a measured check (decision 25).

**B. Today's rule.** 44px on student surfaces through the plate; staff
surfaces unruled.

**C. 24px everywhere, without the plate's 44px.** Meets WCAG 2.5.8, and
contradicts the 2026-10-01 instruction.
