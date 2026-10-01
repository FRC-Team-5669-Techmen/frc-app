# 15 Should crashes file themselves, or only be one tap away from a prefilled report on the error screen?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, items 61 and 5)
- Status: open
- Default if nobody decides: **unchanged: no automatic capture, and the error
  card has no report action.** That matches the earlier recorded choice of "no
  automatic client-error capture". A session asked to work here builds option
  A, idea-app's pattern.
- Decided: --

## What is actually true right now

- Fixed on 2026-10-01 (`9dba1f3`): a page crash is now caught by a boundary
  around the routed page, keyed on the path, so the nav and the feedback button
  stay on screen and Back clears the card; each pre-shell gate has its own
  boundary; and a stale chunk after a deploy reloads the tab once.
- Still true: `src/` has no `error` or `unhandledrejection` listener. The card
  (`src/ErrorBoundary.jsx`) shows the raw message and a Reload button, with no
  id, route or build, and no way to report from it.
- Most students press Reload, so a failure that hits many people silently
  (one phone model, one deploy) leaves no trace.
- idea-app mints a correlation id and puts its report control, prefilled,
  inside the error page. Neither app writes errors to a table automatically.

## The options

**A. A prefilled report on the error screen (S to M, the recommendation).**
The card shows an id, the route and the build, and "Report this" opens the
feedback widget with them filled in. Catches what students choose to send.

**B. An automatic table (M plus a migration).** Sees silent failures. Costs an
insert-own RLS table, dedupe, retention, and a privacy review, because it
stores routes and user agents of minors.

**C. Do nothing.** Crashes reach nobody unless a student types one up.
