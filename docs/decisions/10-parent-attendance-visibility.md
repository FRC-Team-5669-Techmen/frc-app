# 10 Should a parent-only account see every student's attendance and presence, or only their linked students'?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 50)
- Status: open
- Default if nobody decides: **unchanged until the member boundary (decision 06)
  ships, then decide.** Parents see the team-wide boards every member sees.
  Narrowing parents changes `/hours`, `/display` and the parent dashboard
  together, and decision 06 is the larger exposure, so it goes first.
- Decided: --

## What is actually true right now

- `guardian_links` scopes a parent's reads of `logged_hours` only
  (`lh parent select`). Attendance, profiles, sign-ups and presence are
  team-wide for every signed-in member, parents included, by the base policies
  in `platform_migration.sql`.
- The parent nav includes Team Hours, the whole-team board, by design
  (`CLAUDE.md`).
- Audit item 50 (medium, unfixed) is this question seen as a privacy finding;
  the committed audit carries it as a stub.

## The options

**A. Linked students only, for attendance and presence (M).** A parent's Team
Hours shows only their students, and `/display` is hidden from parents.

**B. Team totals, but no times (M).** Parents keep the team picture without
seeing when anyone else's child arrives or leaves.

**C. Keep it team-wide.** Free. Every parent sees when every student is at the
shop.

## Security recheck, 2026-11-07 (Item 50)

**Exact question for Mr. Pina:** Should a parent-only account see only linked students attendance/presence, team totals without individual times, or the current team-wide boards? Should /display be hidden for parent-only accounts?

**Default for this job:** Keep the existing team-wide scope until the membership boundary and this parent policy are decided; do not narrow only one surface.

A fictional parent-only account read another member attendance in the all-migrations PostgreSQL harness. The base attendance read policy remains team-wide. Linked-child hours and parent dashboard filtering added later do not narrow that database policy.

No claim about live deployment follows from the local harness. See `docs/history/codex-frc-security-recheck.md`.
