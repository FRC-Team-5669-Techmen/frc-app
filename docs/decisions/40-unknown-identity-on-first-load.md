# 40 When the app cannot read a member's approval or roles on its first load, what should it show?
- Raised: 2026-10-01 by the overnight session (the check-in gate and finish passes), and the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 4)
- Status: open
- Default if nobody decides: **what the tree does at `e652b01`.** A failed read
  never downgrades what the tab already holds: a `claim_profile` error keeps a
  held approval, and a failed roles read keeps the held roles
  (`src/claimApproval.js`). With nothing held yet, an unknown approval shows the
  access form, even on an NFC tap; unknown roles show no staff controls, and
  the member application gate fails open, so a mentor or parent is never put
  behind the student form.
- Decided: --

## What is actually true right now

- supabase-js emits a sign-in event on every return to the tab and every token
  refresh, and the app re-reads approval and roles on each. Before 2026-10-01 a
  single failed read there showed an approved student "not on the roster" or
  removed a mentor's staff controls.
- `test:checkin` pins the held cases: R8 (a claim error on tab return keeps the
  receipt), R9 (a fresh tap whose boot claims answer yes, then fail) and R10 (a
  mentor's failed roles read on resume). Each has a positive control: a real
  "no" from `claim_profile` still shows the access gate, and for R10 a real
  empty roles answer still shows the application form.
- Still true: a brand-new tab whose every boot claim fails, for example a tag
  tap with no signal, lands on the access form rather than a "can't reach the
  team server" card. A student who owes an application gets in until the next
  successful read.

## The options

**A. Keep it (the default).** An unknown approval never opens the app, and an
unknown role never gates staff.

**B. A "can't reach the team server" card with Retry on a first-load failure
(S).** Tells a student in a dead spot the truth instead of inviting a duplicate
access request.

**C. Fail closed on unknown roles.** Puts mentors and parents behind the
student form on one failed read.
