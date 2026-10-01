# 24 Raise --muted so every use passes text contrast, or keep it for decoration and move text to --steel?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 18)
- Status: open
- Default if nobody decides: **unchanged: `--muted` stays `#5A6068`.** A session
  asked to work here sets it to `#7F858D` (one line in `src/theme.css`) and
  drops the extra dimming on absent names on `/display`.
- Decided: --

## What is actually true right now

- `--muted` `#5A6068` measures 3.10:1 on `--bg`, 2.85:1 on `--surface` and
  2.66:1 on `--surface-2`, against 4.5:1 for body text. It is the colour of
  timestamps, hints, empty states and placeholders across the app (209
  declarations in 42 product CSS files at the audit).
- axe-core over 39 route and persona views at 375: colour contrast failed on
  35, 451 nodes, 284 of them `#5a6068`. The skills "Safety critical" badge
  measured 4.2:1 and 3.9:1, and absent names on `/display` 1.71:1.
- `#7F858D` is the smallest grey that passes on all three grounds; it sits
  close to `--steel`, so the text ramp would effectively become two steps.
- The plate's control hairline, `--tm-hair`, is a mix of `--steel` and
  `--muted` (`docs/SHAPES.md`). Raising `--muted` lightens every control edge
  too; it stays above 3:1, but the plate's look changes and should be
  re-checked.

## The options

**A. Raise the token (S).** Every surface fixed at once; re-check the plate.

**B. Split the uses (M).** Decorative and disabled stay muted, text moves to
`--steel`. All 209 declarations need auditing; the three-step ramp survives.

**C. Do nothing.** Hints and the safety label stay hard to read for
low-vision students and in a bright shop.
