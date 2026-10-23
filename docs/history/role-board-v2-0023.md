---
title: "Role board v2: per slot assignment, no blocking, backups, lunch pit watch, connector tools (0031, ledger 0023)"
date: 2026-10-23
branches: [local/roles]
commits: []
migrations: ["0031_role_board_v2.sql", "0031_role_board_v2_rls_test.sql"]
subsystems: ["Event rosters", "Landing page and nav", "Fixture mode", "Connector"]
---

Built on c6b19f5 in a local worktree for the coordinator to land on main; nothing was pushed or fetched. The role board (0028) was to be shown to about 28 students at a 3:10 PM meeting before Beach Blitz and filled in live, and Mr. Pina had hit three walls on it: an assignment was per event (event_roles has no slot), so a scout assigned in Quals 1 looked assigned in every slot they asked for; Assign on himself as drive coach raised the eligibility popup from `event_role_blocker`; and there were no backups and no way to overfill.

0031 gives every request a per slot status (asked, assigned, backup). The status is the assignment. A box is unfilled while assigned is below needed, and that one rule is what the board, `_role_slot_cells`, `role_board_open_events` (Do this now) and the connector read. Staff set status per person, add anyone who did not ask, and change many boxes in one call by name, slot label or whole day (`staff_set_role_statuses`, all or nothing). Nothing on the board runs the blocker. `staff_assign_from_request` survives for older callers and only sets assigned. A member takes back only an ask; an assigned or backup row stays until staff change it. event_roles is kept in step without the blocker, and a row made on the roster page is never removed by the board. 0028 assignments that named their slot in the reason were backfilled to assigned in that slot only. team_captain joined the vocabulary. The Beach Blitz template and the live event gained two lunch pit watches per competition day and the exact Alliance selection needs; live slots were updated in place by label.

The page was rebuilt around a tap-to-open sheet: one big "I can do this" / "Take back my request" button, chips per person, a count line ("7 of 6 assigned · 2 backup · 0 asked"), Assign / Backup / Remove for staff, and My shifts at the top. Its status message now lands after the board reloads, which the browser spec caught (it read the old count).

0028 also had a live bug fixed here: the page sent the template as the text `beach_blitz_2026` to a uuid parameter, so "Use the Beach Blitz slots" could never have worked against the real database; it now sends the template id from `role_board`.

Proof, all re-runnable: `0031_role_board_v2_rls_test.sql` 23 checks (28 synthetic members, 84 requests, repeats, take backs, overfill and backups, no block, sync, bulk call); `mutants-0031.mjs` 10/10; `sim-0031.mjs` 13/13 with 29 truly concurrent sessions plus two re-pastes over a live-shaped Beach Blitz event; `tools/e2e/features/role-board.mjs` 40/40 at 375 and 1440. The 0028 test's checks 3 and 12 now follow 0031 (20 template slots, and no eligibility block) when 0031 is present.

Not verified: the live database (no access from here; whether 0031 is applied is answered only by querying it), real phones, and the connector tools against the live MCP endpoint (built and unit tested only; no proof.mjs sample was added for `assign_roles`).
