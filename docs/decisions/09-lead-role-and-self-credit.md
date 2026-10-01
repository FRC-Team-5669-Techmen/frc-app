# 09 Is the app's "lead" role a student lead or an adult, and may a non-admin staff member verify or credit their own hours?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 51)
- Status: open
- Default if nobody decides: **unchanged: `lead` holds every staff power, and
  nothing refuses a staff member acting on their own hours.** Until this is
  decided, grant `lead` to no student. A session asked to work here blocks
  self-credit for everyone but an admin first (option A's second half), since
  that is right whichever way `lead` goes.
- Decided: --

## What is actually true right now

- `is_staff()` is mentor, lead or admin, and is used across the SQL. Nothing in
  the repo says who a lead is.
- In Discord, Student Lead is a student role that "grants moderation, not
  access" (`scripts/discord/SERVER_SPEC.md`).
- The staff paths that verify, edit or credit hours do not check whether the
  record is the caller's own. Self-certification of skills is intended
  (`src/CertifyPage.jsx`). Audit item 51 (medium, unfixed) has the detail; the
  committed audit carries it as a stub.
- Whether any live member holds `lead` is unverified. Read-only check:
  `select count(*) from member_roles where role = 'lead';`

## The options

**A. Lead is an adult, equivalent to mentor.** Keep the powers and document
it. Block self-verification and self-credit regardless (S).

**B. Lead is a student (M).** Narrow it: verify others only, no application
reads, no access approvals, no self-certification.

**C. Retire the role.** Fold existing leads into mentor or student.

**D. Do nothing.** If a student holds lead, they hold every staff power,
including over their own hours.
