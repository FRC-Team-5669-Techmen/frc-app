# 06 Should the database itself require an approved, active member for every member read and write, and should only an admin be able to change approval, status and the geofence exemption?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, items 2 and 3)
- Status: open
- Default if nobody decides: **no database change; the policies stay as the
  frozen SQL left them.** On the app side, the presence board, the dashboard's
  team counts and the parent dashboard's member reads count approved members
  only (`ccd6aef`, 2026-10-01). A session asked to work here builds option A,
  in its order: the guard first, then the boundary.
- Decided: --

## What is actually true right now

- Audit items 2 (critical) and 3 (high) bear on this. Both are unfixed at
  `e652b01`. The committed audit carries them as stubs; their full text was
  delivered to Mr. Pina privately on 2026-10-01 (decision 04).
- The base member policies, and `has_role()`, live in `platform_migration.sql`
  at the repository root, not under `supabase/` (audit item 25).
- Email-code sign-in creates an account for any address. That is deliberate:
  the access-request form needs a signed-in account to write its row.
- Tonight's migrations already read approval in their own helpers (0001's
  mirror reads, 0004's capability check), so they inherit whatever the
  approval column is worth.
- No SQL file in the repo creates `profiles.geofence_exempt`; whether it
  exists live is unverified (decision 26).
- Every statement here comes from the repo's SQL applied to a throwaway
  Postgres 16. None was checked against the live project.

## The options

**A. A guard, then the boundary.** First, one small numbered migration that
lets only an admin change approval, status, the geofence exemption and the
calendar token, with an RLS test whose positive controls show the roster and
`claim_profile` still work (S). Then an `is_member()` helper (approved and
active) on every member read and write policy, keeping own-row access to
access requests so a pending account still sees its request (L: about twenty
policies, each with a test).

**B. The guard only.** S. Closes item 3; item 2 stays open.

**C. Members may change their own status (for example, mark themselves
alumni); guard only approval and the exemption.** A product choice. Option A
treats status as staff-set.

**D. Do nothing.** Both items stay open on a database of minors' attendance.
