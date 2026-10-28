# Connector evals: what Mr. Pina would say

A living list. Each line is something he would say to Claude, the tool that should serve it, and what must happen, judged by rows in the database (the audit log on `/connector`), never by Claude's reply. Add a line whenever he asks for something new; when the app cannot do it, the expected path is `report_gap` and the line stays until the gap is built.

| # | He says | Tool | What must happen |
|---|---|---|---|
| 1 | "Find Riley." | `find_member` | Riley's name, email, roles and sub-teams. Two Rileys: both named, and Claude asks which. |
| 2 | "Who are the mentors?" | `list_members` (role mentor) | Every active member holding the mentor role, by name. |
| 3 | "List every student." | `list_members` (role student) | Every active student, with sub-teams. |
| 4 | "Who's here today?" | `todays_signins` | Everyone who checked in today, who is still in the shop, and sign-outs waiting with their notes. Writes nothing. |
| 5 | "Approve Jordan's sign-out." | `approve_signout` | A preview naming Jordan, the note he wrote and whether cleanup was confirmed; on "yes", one approval and one OUT row, one audit row. No pending sign-out: says so, writes nothing. |
| 6 | "How many hours does Sam have this week?" | `member_hours` | This week's hours against what is required, standing, this month's meetings. Writes nothing. |
| 7 | "Give Riley two build hours for the Saturday fix." | `correct_hours` (+2) | Runs at once: one adjustment of +2 build with that reason, one audit row naming its reverse. |
| 8 | "Undo that." | `undo_last` | One adjustment of -2 with "Undo through Claude:" and the reason; the first audit row marked undone. A second "undo that" says nothing is left. |
| 9 | "Take half an hour off Casey, it was double counted." | `correct_hours` (-0.5) | A preview first, nothing written; on "yes" one adjustment of -0.5. |
| 10 | "What's on the schedule next week?" | `list_events` | Every event in the window with day, times and place. |
| 11 | "Add a build Saturday 9 to 1." | `create_event` | Runs at once: one event, kind build, 9:00 to 13:00 Los Angeles time on that Saturday, added by him; one audit row naming its reverse. "Undo that" deletes it, and the undo audit row lists the deleted event. |
| 12 | "Who's coming to the outreach event?" | `event_signups` | Going, maybe and not going, by name. Two events match: Claude asks which. |
| 13 | "Show the Beach Blitz carpool." | `trip_boards` | The cars with their seats and the meals with their food needs, as staff see them. |
| 14 | "What food is still needed for the trip?" | `trip_boards` | The meal board, read from the same call. |
| 15 | "What did the parents say on the form?" | `parent_responses` | This season's answers per family, and how many have not answered. |
| 16 | "Which parents can drive?" | `parent_responses` | Read from the same answers (driving yes or maybe). |
| 17 | "Make Riley a lead." | `set_team_role` (grant) | Runs at once; one role row; undo takes it back only if Riley was not already a lead. |
| 18 | "Take lead off Jordan." | `set_team_role` (remove) | A preview first that names the role row it will remove; on "yes" the role is removed, the audit row lists the removed row, and "undo that" gives the role back. |
| 19 | "Any new feedback?" | `feedback_inbox` | The newest reports with who sent them, type and status. |
| 20 | "Mark that one done." | `feedback_set_status` | Runs at once; the report moves to done; "undo that" puts its old status back. |
| 21 | "Reply to that feedback, tell Riley it's fixed." | `feedback_reply` | A preview first naming the report; on "yes" one answer stored, a New report moves to Seen, and the sender gets a notice, one email and a push. Before 0024 is pasted the function is missing and Claude says so. |
| 22 | "The app can't do a bus seating chart, log it." | `report_gap` | One feedback report, from him, marked connector, with his words. |
| 23 | "Void Sam's last session, he forgot to tap out." | `find_tool` then `call_app` (`staff_void_session`) | A preview first (a generated entry always asks); on "yes" the session is voided as him. |
| 24 | "Log a safety violation for Riley, no glasses." | `find_tool` then `call_app` (`staff_log_safety`) | A preview first; on "yes" one violation row, logged by him. |
| 25 | "Remind the families who haven't signed up for the trip." | `find_tool` then `call_app` (`staff_remind_signups`) | A preview first (it emails families); on "yes" the reminders are queued. |
| 26 | "Switch the connector off." | `find_tool` then `call_app` (`connector_admin_set_enabled`) | A preview first; on "yes" the switch is off and the next request from this chat is refused. |
| 27 | "Post to Discord that build is canceled." | `report_gap` | Not available through Claude yet (it messages people outside the app); says so and files it. |
| 28 | "Riley's real name is Riley Ortega." | `set_member_name` | Runs at once: her full name changes, her nickname does not; one trail row; "undo that" puts the old name back. |
| 29 | "Merge Riley's summer Gmail account into her school account." | `merge_accounts` | A preview first listing the rows per table that will move; on "yes" nothing names the Gmail account any more, it is inactive with a note, the school account has everything, and two trail rows. Two Rileys: Claude asks which. |
| 30 | "Move the outreach event to Sunday." | `find_tool` then `call_app` (`schedule_update_event`) | A preview first (a generated entry always asks); on "yes" the event moves, as him. |
| 31 | "Send Joseph Tran's family their Beach Blitz link." | `send_family_link` | A preview first naming the family and its emails; on "yes" one link email queued per email on the family (one row each in the trip mail queue), each carrying a fresh link. Already sent this hour: nothing new is queued and it says so. Two coming trips and none named: Claude asks which. |
| 32 | "Which batteries are ready?" | `list_batteries` (show match_ready) | Runs at once, reads only: competition batteries that are charged and not flagged, worst first, with the resting voltage and brownout count. Before 0026 is pasted: not set up yet. |
| 33 | "Log B07 for qual 12, 12.9 before, 11.8 after, no brownout." | `log_battery_run` | A preview first; on "yes" one run, logged by him, and a charged B07 becomes needs charge. "Battery 7" with two batteries numbered 7: Claude asks which. |
| 34 | "B03 is on the charger." | `set_battery_charge` | Runs at once; B03 reads charging; "undo that" puts its old state back. |
| 35 | "Who has not shown up? Give me a list of who to take off the roster." | `team_attendance` | Runs at once, reads only: active members (no parents, no accountless emails) lowest hours first, with check-ins and last check-in; the count never checked in. |
| 36 | "Who hasn't checked in since September?" | `team_attendance` (no_checkin_since 2026-09-01, role student) | Only students whose last check-in is before September 1, or who never checked in. |
| 37 | "Mark Jordan, Sam and Casey inactive, they never came." | `set_member_status` | A preview first listing the three names and their status now; on "yes" all three inactive, one admin log row each with the reason. Two Sams: Claude asks which, and nobody is changed. |
| 38 | "Sign Riley in." | `sign_in_out` | Runs at once: one IN now, build; "undo that" removes it. Already in: says so, nothing written. A sign-out request waiting: points to `approve_signout`. |
| 39 | "Which families haven't signed up for Beach Blitz?" | `trip_signups` | Runs at once: families not answered first, then who ticked FIRST registration not done. |
| 40 | "Which autos are ready?" | `auto_routines` (show ready) | Runs at once: routines with five successes in a row. |
| 41 | "Draft a Discord announcement that build is canceled, ping parents." | `preview_announcement` | The exact post as a dry run; nothing posted; he sends it from /announce. |
| 42 | "The taxi auto failed on B07, it hit the wall." | `log_auto_run` | A preview first; on "yes" one auto run, fail, with the problem and B07; the taxi streak resets to 0. |
| 43 | "Who's on the Beach Blitz roster?" | `event_roster` | Runs at once: each member with their roles, posted or not, and open conflicts. |
| 44 | "What did we learn from other teams at Beach Blitz?" | `meet_team_notes` | Runs at once, reads only: each team met, grouped by number, with what they do well, how they run, what they offer, what to copy, follow ups, contacts and who logged it. Before 0035: not set up yet. |
| 45 | "Who hasn't met a team yet?" | `meet_team_progress` | Runs at once: done, slotted but nothing logged (with their slot), and no slot, by name. |
| 46 | "Give everyone a Meet a team slot." | `give_meet_team_slots` | A preview first listing every name and slot and who could not be placed and why; on "yes" each becomes assigned Meet a team in that box on the role board. A second run places nobody new. |
| 47 | "Put Mathias in Mr. Pina's car every day." | `place_in_car` (day all) | ONE preview listing each day and way (from which car, to which), and what was skipped (no Pina car that way, not coming that day); on one "yes" each seat moves through the trip page's own Move, as him, inside the 72-hour lock. A full car or the 12-hour freeze: the page's sentence, nothing offered. Two Garcia cars: Claude asks which. |
| 48 | "Who is coming each day of Beach Blitz, and when do they get there and leave?" | `trip_day_roster` | Runs at once, reads only: per day every student coming by name, how they get there and home (team carpool with the driver, family car, needs a seat, on their own), arrives and leaves, not sure and not answered. |
| 49 | "Any absences waiting?" | `absences_waiting` | Runs at once: who, which event, the reason and note, when filed, and each request id, oldest first; one unanswered when its event started is marked as counting as approved. |
| 50 | "Approve all of those." | `decide_absences` (the ids from 49) | ONE preview naming each student and event; on one "yes" each is approved and each student is told. An id that is not waiting: nothing changes for anyone. |

## Scouting (0022)

- "Show scouting for Beach Blitz": `scouting_event` resolves the calendar event and reads records/delivery as the caller. No parent-only access.
- "Fetch the event teams": `preview_scouting_import` makes a read-only upstream preview. Missing credentials and upstream failures are visible; no empty replacement is saved.
- "Save this scouting observation": find `scouting_save`, then `call_app` with the record id, event, kind, team, match, payload, expected version and stable operation UUID. Always confirm. Preview rolls back records, revisions and delivery reservations.
- "Send this pit question": `scouting_save` with `kind=message` and `request_delivery=true` confirms before committing, then attempts the same authenticated dispatcher the browser uses. The result distinguishes saved data from delivery. A repeated request never duplicates a delivered or ambiguous message.
- A stale expected version refuses with 40001. An operation UUID replay with changed content refuses. Unknown observations retain their explicit states.
