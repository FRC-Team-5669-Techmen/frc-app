# 22 Fix the iPhone status bar by going opaque, or by adding viewport-fit=cover and safe-area padding?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 37)
- Status: open
- Default if nobody decides: **unchanged, and first confirm the problem:** look
  at the installed app on a notched iPhone. If the nav sits under the clock, a
  session switches the meta to `black` (opaque), which is one line and matches
  the near-black theme.
- Decided: --

## What is actually true right now

- `index.html` sets `apple-mobile-web-app-status-bar-style` to
  `black-translucent`, and its viewport meta lacks `viewport-fit=cover`.
- `src/` has no `env(safe-area-inset-*)`.
- The wordmark and the avatar (the account menu) sit near the top edge, and the
  feedback launcher 16px from the bottom.
- Not measured: there is no WebKit in the session's container. idea-app uses
  `viewport-fit=cover` with safe-area padding.

## The options

**A. Opaque status bar (S, one line).**

**B. Translucent plus safe-area padding (S to M).** Across the nav, the
check-in header, the launcher and the survey footer. Looks more native.

**C. Do nothing.** If confirmed, the account menu sits under the clock on
every launch of the installed app.
