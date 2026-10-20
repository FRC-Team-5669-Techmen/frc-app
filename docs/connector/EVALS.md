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
| 21 | "Reply to that feedback." | `feedback_reply` then `report_gap` | Says plainly the inbox has no reply; one feedback report marked connector. |
| 22 | "The app can't do a bus seating chart, log it." | `report_gap` | One feedback report, from him, marked connector, with his words. |
| 23 | "Void Sam's last session, he forgot to tap out." | `find_tool` then `call_app` (`staff_void_session`) | A preview first (a generated entry always asks); on "yes" the session is voided as him. |
| 24 | "Log a safety violation for Riley, no glasses." | `find_tool` then `call_app` (`staff_log_safety`) | A preview first; on "yes" one violation row, logged by him. |
| 25 | "Remind the families who haven't signed up for the trip." | `find_tool` then `call_app` (`staff_remind_signups`) | A preview first (it emails families); on "yes" the reminders are queued. |
| 26 | "Switch the connector off." | `find_tool` then `call_app` (`connector_admin_set_enabled`) | A preview first; on "yes" the switch is off and the next request from this chat is refused. |
| 27 | "Post to Discord that build is canceled." | `report_gap` | Not available through Claude yet (it messages people outside the app); says so and files it. |
| 28 | "Riley's real name is Riley Ortega." | `set_member_name` | Runs at once: her full name changes, her nickname does not; one trail row; "undo that" puts the old name back. |
| 29 | "Merge Riley's summer Gmail account into her school account." | `merge_accounts` | A preview first listing the rows per table that will move; on "yes" nothing names the Gmail account any more, it is inactive with a note, the school account has everything, and two trail rows. Two Rileys: Claude asks which. |
| 30 | "Move the outreach event to Sunday." | `find_tool` then `call_app` (`schedule_update_event`) | A preview first (a generated entry always asks); on "yes" the event moves, as him. |
