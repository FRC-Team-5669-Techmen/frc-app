# 04 Should frc-app stay public, and may committed docs describe unfixed security weaknesses in reproducible detail?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 68)
- Status: open
- Default if nobody decides: **the repo stays public, and a committed doc says at
  most where an unfixed weakness is and which check is missing, never how to use
  it.** No request shapes, attack statements or payloads. The committed overhaul
  audit follows this strictly: each unfixed security item (1, 2, 3, 6, 7, 8, 14,
  15, 16, 50, 51 and 52, and part (c) of 72) is a stub carrying its severity,
  size and the kind of fix, and the full text was delivered to Mr. Pina
  privately on 2026-10-01. A stub gets its full text back once its fix is live.
- Decided: --

## What is actually true right now

- The repository is public: the GitHub API returned `private: false`,
  `visibility: public` on 2026-10-01.
- The app holds minors' names, grad years, subteams and every check-in and
  check-out time.
- Twelve audit items, plus part of a thirteenth, describe security weaknesses
  that are unfixed at `e652b01` (`main`, 2026-10-01). Each was measured on a
  throwaway Postgres 16 harness built from this repo's SQL. None was measured on
  the live project, which nothing in the session's container can reach.
- `CLAUDE.md` already describes one of them, the `calendar_token` column
  revoke, in more detail than this default allows. That text predates this
  entry and was left alone.
- `docs/feedback/` already keeps student names out of commits because the repo
  is public. Until this entry, nothing covered security detail.
- The cheapest high-value fixes, audit items 1, 3 and 7, are one small numbered
  migration for Mr. Pina to paste. It was not written on 2026-10-01, because
  that night's prompt allowed only trivial fixes from the audit. It is the
  first recommendation for the next session.

## The options

**A. Stay public; location and missing check only, until fixed (the default).**
The docs stay useful to the next session. The cost is that the full detail
lives outside the repo, in the copy delivered to Mr. Pina; if that copy is
lost, a session re-derives it from the SQL.

**B. Make the repo private.** Ends the question outright. Costs to check first:
Actions minutes become metered on a free plan, the status tool in `CLAUDE.md`
clones the repo anonymously, Claude Design sources the design system from
GitHub, and every collaborator needs an invitation.

**C. Stay public and commit everything.** A verified, ranked list of weaknesses
in a database of minors is readable by anyone until each fix is pasted.

**D. Fix first, then publish.** Paste the migration for items 1, 3 and 7, then
put those items' full text back in the audit. Compatible with A.
