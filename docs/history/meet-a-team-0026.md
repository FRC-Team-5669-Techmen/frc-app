---
title: "Meet a team: a note per member per competition about another team, with its own role board slot (0035, ledger 0026)"
date: 2026-10-23
branches: [local/meet]
commits: []
migrations: ["0035_meet_a_team.sql", "0035_meet_a_team_rls_test.sql"]
subsystems: ["Meet a team", "Event rosters", "Connector", "Landing page and nav", "Testing"]
---

One solo session, ledger entry 0026, run as a subagent in a local worktree
(branch local/meet, based on origin/main 11cb67d) that the coordinator lands.
Mr. Pina asked for an assignment every member completes at a competition, in
its own time slot: go talk to another team, learn what they do well and how
they are organized, get contact information and see what resources they
offer, because we want to operate like the elite teams around us. First use
is Beach Blitz.

## What shipped

- **0035**: `team_connections` and `team_connection_contacts`, read by every
  approved member (contacts by students and staff only), written through
  SECURITY INVOKER functions under owner-or-staff policies with per-column
  UPDATE grants; `meet_team_event`, `meet_team_progress`,
  `staff_meet_team_fill` (preview or apply), `meet_team_todo`; the `meet_team`
  role in every vocabulary place; Meet a team boxes on the Beach Blitz
  template and the live event (3 per Saturday qualification slot and per
  Sunday morning slot, 24 boxes); the merge rules gain the two member columns.
- `/meet` and `/meet/:eventId` (code split), links from Scouting and the role
  board, Home's Do this now, the What's new entry, three connector tools.

## Decisions taken under the prompt's defaults

- Parents read the notes but never the contacts (the prompt hid contacts
  from parent-only accounts; it did not hide the notes).
- Give everyone a slot treats any time overlap with another assigned role as
  a conflict, not only the same slot, and overfills evenly once the 24 boxes
  are taken (about 30 members), because the board allows overfill.
- The fill rule exists twice (SQL and `planMeetTeam` for fixture mode and the
  unit tests); both copies say so and both are tested.

## Measured

On 2026-10-23: 0035 test 24/24, mutants 13/13, Beach Blitz check 4/4,
connector proof green with the two new hand samples, the meet-team feature
spec 64/64 at 375 and 1440. The full gate numbers are in the commit message.

## Not verified

Nothing here touched the live project. Whether 0035 is applied, and whether
the live Beach Blitz slots now carry meet_team, is answered only by querying
the live database. No real phone was used; the offline draft is proven by a
reload in Chromium and by unit tests, not by airplane mode in a pit.
