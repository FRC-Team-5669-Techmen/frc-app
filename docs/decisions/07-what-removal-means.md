# 07 What does "removed from the team" mean in the app, and should revoking a role also remove that email's whitelist entry?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 14)
- Status: open
- Default if nobody decides: **nothing is built.** Removing someone today is
  the roster's role revoke or delete, plus deleting their `approved_emails` row
  by hand in the SQL editor, because no screen shows that table. A session
  asked to build offboarding builds option A.
- Decided: --

## What is actually true right now

- Audit item 14 (high, unfixed at `e652b01`) found a gap in how a removal done
  from the roster holds today. The committed audit carries it as a stub; the
  full text went to Mr. Pina privately on 2026-10-01.
- `src/` has no screen that lists or removes `approved_emails` rows, and the
  roster has no un-approve.
- Status `inactive` and `alumni` are labels on the roster; no role helper reads
  them.
- Two `claim_profile` definitions exist in the frozen SQL
  (`supabase/access_requests.sql` and `supabase/domain_roster_gate.sql`).
  Which one is live is unknown. Read-only check:
  `select prosrc like '%approved_emails%' from pg_proc where proname = 'claim_profile';`
- Offboarding happens every year: graduates, departures, mentors rotating out,
  parents.

## The options

**A. Removal means no access, through a `blocked` flag (M to L).**
`claim_profile` checks it first and only an admin can set it; revoking a role
also removes or downgrades its whitelist row; `/access-requests` gets a
whitelist list with revoke. Alumni stays a display label.

**B. Alumni keep read-only access (L).** Needs the member boundary (decision 06)
to tell active from alumni on every policy, and a decision on what alumni may
see.

**C. Do nothing.** Offboarding stays a hand edit in the SQL editor, and item
14 stays open.

## Security recheck, 2026-11-07 (Item 14)

**Exact question for Mr. Pina:** Does removal mean loss of app access, or only loss of active-team participation? If access is removed, should it block every sign-in claim and existing data access independently of roster roles, including approved email and school-domain paths? What access, if any, should alumni retain?

**Default for this job:** No offboarding or access-revocation feature is built. Preserve the current model while this question is open. This re-audit does not authorize option A.

Later standing removal and 0020 account merge are narrower operations than a general removal/access policy. Decision 54 also leaves participation versus access open. The current claim and role helpers were inspected in the all-migrations local database; no general offboarding completion was found. Item 14 remains open. Its private text has not been reconstructed here.

No claim about live deployment follows from the local harness. See `docs/history/codex-frc-security-recheck.md`.

## Participation folding is separate (0050)

`folded` is a reversible participation label, not the offboarding option A. Automatic folding ships off under decision 54. It does not change approval, roles, credentials or account access; the existing active-only feature permission checks now accept folded accounts too. It never deletes member history or flags folded driver documents for deletion. The no-access offboarding decision above remains open and unimplemented.
