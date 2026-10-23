# Meet a team

Built by ledger 0026, migration 0035 (2026-10-23). First use: Beach Blitz, Oct 30 to Nov 1 2026.

Mr. Pina's ask: at every competition, every student goes out, talks to another team and connects with them. Not scouting: what does this team do well, how are they organized, what resources do they offer. We have elite teams around us and want to operate like them. It is an assignment with its own time slot.

## The pieces

- **`/meet`** lists competitions; **`/meet/:eventId`** is the page (`src/MeetTeamPage.jsx`, styles `src/MeetTeam.css`, rules `src/meetTeam.js`). Reached from Scouting (a card on the event list and a link on each event), from the role board (a link when the event has Meet a team boxes) and from Home's Do this now. No top-bar button.
- **The form**, one column for a phone in a pit: team (a pick list from the event's scouting team records when there are any, else typed), team name, what they do well (required), how they are organized (chips + note), resources they offer (chips + note), one thing we should copy (required), follow up yes/no + note, and an optional contact (name, role, email, Discord, Instagram or website) under "Ask before you write down anyone's contact info." A member may log as many teams as they like; the assignment is done after the first.
- **The draft** is kept in localStorage per member and event on every keystroke (`techmen:meet-team-draft:<uid>:<event>`, every access in try/catch) and cleared on a successful save, so a dropped connection or a closed tab loses nothing. A failed save keeps it and says so.
- **The shared list**: every note for the event, grouped by team number, searchable over notes, names and chip labels. Edit and Delete on your own notes; staff on every note.
- **Staff**: progress (done, slotted but nothing logged, no slot, by name) and **Give everyone a slot** (preview every name and slot, then Assign these N).

## The data (0035)

- `team_connections` (one row per note) and `team_connection_contacts` (one row per note, only when a contact was given). Chip vocabularies are CHECK constraints, held equal to `ORG_TAGS` / `RESOURCE_TAGS` by `tests/meet-team-form.test.js`.
- **Who reads**: notes, any approved account with a team role, parents included (`_meet_team_reader`). Contacts, approved active students and staff only (`_role_board_member_ok`), so a parent-only account and anon read none. `meet_team_event` returns `contact: null` to a parent.
- **Who writes**: `team_connection_save` / `team_connection_delete`, SECURITY INVOKER, so the policies decide: a member inserts only in their own name, edits and deletes only their own; staff edit and delete any. UPDATE is granted per column, so `member_id`, `event_id` and `created_at` cannot change even for staff. Default privileges are revoked first.
- **The role**: `meet_team` ("Meet a team") is a role board role like any other (assigned, backup, asked; no blocking). It is in `event_roles_role_check`, `_role_valid`, `src/roleBoard.js`, `src/RostersPage.jsx` and the fixture's role list (`src/dev/fixture/features/partd.js`); `tests/part-d-models.test.js` reads the newest `_role_valid`.
- **Beach Blitz**: 0035 adds `"meet_team":3` to every Saturday qualification slot and every Sunday qualification or playoff slot starting before noon, on the template and on the live event `f891929e-d8bb-4a3e-9f12-c5c0aca3e886` (by id; nothing happens when it is not there). A slot that already names meet_team is left alone, needs are merged, requests are never touched. With the live template that is 8 slots, 24 boxes; boxes may overfill.
- **Give everyone a slot** (`staff_meet_team_fill(event, apply)`): every active student with no ASSIGNED meet_team box at the event, into Meet a team slots not yet over, never into a slot overlapping one where they hold another assigned role (no end counts as one hour). Fewest free slots first, then by name; each to the free slot with the lowest fill (assigned / needed), then fewest assigned, then earliest. Overfills evenly once every box is taken. Returns placed and unplaced with a reason. `src/meetTeam.js` `planMeetTeam` is the same rule for fixture mode and the unit tests; a duplicate on purpose, held to the same outcomes by the 0035 test. Change both.
- **Do this now**: `meet_team_todo()` lists competitions running today (from the LA start of the first day to the end) with Meet a team boxes where the caller has logged nothing, with their slot. Home shows "Meet a team · Your slot: ..." to students until they log one; urgent once the slot has started or when there is no slot.

## Connector

`meet_team_notes` (read: teams met, notes, who logged them, contacts), `meet_team_progress` (read: done, slotted, no slot), `give_meet_team_slots` (`staff_meet_team_fill` with apply, always confirm: the preview is the fill rolled back and lists every name and slot). `assign_roles` takes `meet_team`. EVALS rows 44 to 46.

## Proof

- `supabase/migrations/0035_meet_a_team_rls_test.sql` (24 checks), `node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0035.mjs` (13 permissive mutants), `--node tools/sql-harness/check-0035-bb.mjs` (a Beach Blitz shaped event with the live id, pasted twice, 4 checks).
- `tests/meet-team-plan.test.js`, `tests/meet-team-form.test.js`, the Meet a team case in `tests/do-this-now.test.js`.
- `tools/e2e/features/meet-team.mjs` at 375 and 1440 on fixture mode (`src/dev/fixture/features/meetteam.js`).
