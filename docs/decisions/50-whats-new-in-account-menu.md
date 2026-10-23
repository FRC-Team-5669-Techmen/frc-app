# 50 What's new in the account menu: a seventh entry for a student approver?
- Raised: 2026-10-23 by the light mode and What's new session (ledger 0019).
- Status: open
- Default if nobody decides: **What's new stays an account menu entry.** Six entries for a student, a parent and staff; seven for the one case decision 49 already allowed six (a student Mr. Pina named a sign-out approver). The theme switch is a row of three icons in the same menu and is not counted as an entry.
- Decided: --

## What is actually true right now

Decision 49 capped the account menu at six entries, and `tests/nav-admin.test.js` held it there. Ledger 0019 asked for What's new to be linked from the account menu, with an unread dot. Adding it gives:

| Persona | Entries |
| --- | --- |
| Student | My profile, My standing, Handbook, What's new, Replay tour, Sign out = 6 |
| Student sign-out approver | the six above plus Sign-outs = 7 |
| Mentor, lead, admin | Team admin, My profile, Handbook, What's new, Replay tour, Sign out = 6 |
| Parent | My profile, Standing, Handbook, What's new, Replay tour, Sign out = 6 |

The test now allows seven only on the approver path and still requires six for everyone else.

## The alternatives

1. **Keep the default** (above).
2. **Move Replay tour out of the menu** (to the profile or to What's new), which puts every menu back at five or six. Costs: the tour copy in `src/featureGuide.js` and the `inbox` feature spec both say the tour is replayed from the account menu.
3. **Drop the menu entry and keep only the dot on the avatar and the Home strip**, which leaves What's new reachable from Home only.
