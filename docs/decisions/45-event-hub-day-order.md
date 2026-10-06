# 45 Should the family page list the days in date order (Friday, Saturday, Sunday)?
- Raised: 2026-10-05 by the event family hub session (ledger 0003), from a usability review of the rebuilt family page
- Status: open
- Default if nobody decides: Part 1 (Who is coming) keeps the order the event's days are given in Setup (`hub_days.position`). For Beach Blitz 2026 that is Saturday, Sunday, then Friday, as 0006 seeded it. Rides, Finish and every board stay in date order, as they always were.

## What is actually true right now

- 0006 sets `position` so the sign-up form asks about Saturday and Sunday first and the optional Friday evening last, with Friday's short explanation card before its question. That came with the original hub prompt (ledger 0003).
- A review of the rebuilt page, done from a nervous low-tech parent's point of view, found the order confusing. The header says "Fri, Oct 16 to Sun, Oct 18", every other screen lists Friday first, and Friday's question sits below the fold. A parent may answer Saturday and Sunday, assume the trip starts Saturday, and miss Friday. The Finish list then names "Coming on Fri?" first, so they go hunting for it.

## The options

1. **Keep the default.** Required days come first. Friday is easy to miss, and the order differs from every other screen.
2. **Date order everywhere, with Friday marked "Optional evening".** This needs a way to mark a day optional. One option is a new `hub_days.optional` column (a small migration plus a Setup toggle). The other is reusing the day's title ("Load-in and practice") as the only signal. Either way, the order stops differing between screens.
3. **Date order, nothing marked.** The simplest change. Friday's explanation card already says what the evening is.

A mentor can already change the order today without any code: Setup, set each day's position (1, 2, 3).
