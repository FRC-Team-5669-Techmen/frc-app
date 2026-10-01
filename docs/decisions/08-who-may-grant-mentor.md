# 08 May a non-admin mentor or lead approve or invite someone as a mentor?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 15)
- Status: open
- Default if nobody decides: **unchanged: any staff member can approve an access
  request or send an invite with the mentor role, as `CLAUDE.md` documents.**
  A session asked to change it builds option A.
- Decided: --

## What is actually true right now

- `CLAUDE.md` documents staff approving an access request as student, mentor or
  parent, and staff inviting with a role. `supabase/domain_roster_gate.sql`
  says elevation stays admin-only. The repo contradicts itself.
- `admin_set_member_role` (the roster's role toggle) is admin-only.
- The access form (`AccessGate.jsx`) offers Mentor to every requester, and the
  Approve dropdown on `/access-requests` preselects the role the requester
  asked for.
- Mentor is the role that reads families' contact data and edits students'
  hours. Audit item 15 (high, unfixed) has the detail; the committed audit
  carries it as a stub and the full text went to Mr. Pina privately on
  2026-10-01.

## The options

**A. Mentor grants become admin-only (M).** In the approve RPC, the whitelist
write policy and the `invite-member` Edge Function. The Approve dropdown
defaults to student or parent and never preselects the requested role; mentor
appears only for admins. Mr. Pina approves every new mentor himself.

**B. Staff-wide, but no preselect and a second confirm (S).** Stops careless
approvals; mentors and leads can still create mentors.

**C. Do nothing.** Any mentor or lead can create a mentor, and a hurried
approval can too.
