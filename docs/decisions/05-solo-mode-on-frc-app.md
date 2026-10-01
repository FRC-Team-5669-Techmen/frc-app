# 05 Does the solo-mode rule (a solo session pushes straight to main) apply to frc-app, and what must pass locally first?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 23)
- Status: decided
- Default if nobody decides: not needed; decided below. Before the decision
  the audit's draft default was parallel mode only.
- Decided: 2026-09-27 -- as the session prompt of 2026-10-01 records it:
  "Mr. Pina's rule since 2026-09-27 is that a solo session commits and pushes
  straight to `main`, and the branch path is for parallel work only." The same
  rule is idea-app's (its `CLAUDE.md` and IDEA_instructions 4.30).

## What is actually true right now

- Until 2026-10-01, `CLAUDE.md` told every session to push a `claude/**` branch
  and never `main`. `integrate.yml` merges a green `claude/**` branch into
  `integration`, never into `main`. The closing push of 2026-10-01 rewrites
  that section of `CLAUDE.md` to this rule.
- The overnight session of 2026-10-01 ran under this rule. It pushed to `main`
  five times, every push a fast-forward and none forced: `89896ca`, `9543e90`,
  `e24d63d`, `7cdf3e3` and `e652b01`. The first push was inert (a helper
  nothing imported yet) and was gated on the build and `npm test`. Every later
  push was gated on the build, `npm test`, `ds:audit`,
  `discord:calendar:test`, `history:verify`, `test:checkin` and
  `test:features`.
- There is no single `npm run gate` script; `package.json` at `e652b01` has
  none. The local gate is the list above, run by hand.
- Every push to `main` deploys to students who may be mid-check-in. On the
  first push, Vercel's production deploy went live at 05:38:16Z and CI finished
  at 05:38:30Z, so CI reported after the fact. Under this rule CI is a report,
  not a gate; the local gate is the gate.
- SQL still reaches the database only by hand. Code on `main` can therefore be
  ahead of the database. Tonight's four migrations (0001 to 0004) were pushed
  unapplied; every feature that reads them detects a missing migration through
  `src/schemaMissing.js` and shows "not set up yet" instead of failing.
  `src/AnnouncePage.jsx`, `src/FeedbackPage.jsx`, `src/feedbackModel.js`,
  `src/ideaCerts.js` and `src/permissions.js` use it.

## The options

**Solo mode with conditions (decided).** A solo session pushes to `main` after
the local gate passes: build, `npm test`, `ds:audit`, `discord:calendar:test`,
`history:verify`, and `test:checkin` whenever check-in, dashboard or app-shell
code changed. Code that reads a migration not yet pasted degrades through
`src/schemaMissing.js`. Never forced, never rebased onto a moved `main` without
re-running the gate.

**Parallel sessions keep the branch path.** Two sessions at once still push
`claude/**` branches to `integration`, because two sessions cannot both gate
`main`. Note that the parallel path's own deploy gate has never passed (audit
item 22).

**Worth adding later:** an `npm run gate` script that runs the list in one
command, so the gate is a command rather than a memory.
