# 51 The connector during a competition and the season: what it covers, and whether it may post to Discord
- Raised: 2026-10-23 by the connector team reads session (ledger 0024).
- Status: open
- Default if nobody decides: **Discord announcements stay preview only through the connector.** `preview_announcement` runs the Discord function as a dry run and posts nothing; Mr. Pina sends from `/announce`, where he confirms it himself. `sign_in_out` runs at once with an undo (not ask-first), because its time defaults to now and an ask-first preview could never be confirmed with identical arguments.
- Decided: --

## The audit (2026-10-23, against the registry this ledger built)

What Mr. Pina will want to do by voice or chat at a competition and through the season, and the connector tool that does it. "call_app" means it is reachable through `find_tool` then `call_app` with a generated entry (always asks first), but has no named tool with spoken arguments.

| Scenario | Status | Tool, or what it needs |
| --- | --- | --- |
| Who is checked in now | covered | `todays_signins` (in_shop_now, people) |
| Sign someone in or out | covered (new) | `sign_in_out` (staff_add_event, undo removes the event); refuses a double IN, an OUT with nothing open, and sends a waiting sign-out to `approve_signout` |
| Today's attendance | covered | `todays_signins` |
| Everyone's hours, who has not shown up, roster cleanup | covered (new) | `team_attendance`, `set_member_status` (asks first) |
| One member's hours and standing | covered | `member_hours` |
| Battery status, log a run, charge state | covered | `list_batteries`, `log_battery_run` (asks first), `set_battery_charge` (undo) |
| Auto routine streaks | covered (new) | `auto_routines` (the page rule, `src/autos.js`) |
| Log an auto run | call_app | `auto_log_run`; a named `log_auto_run` with the routine resolved by name is the next cheap tool |
| Scouting records and pick lists | covered | `scouting_event` (records, personal pick lists, delivery) |
| Scouting coverage (which matches have no scout) | missing | a read over the 0030 shift tables that names unscouted matches; `scouting_now_get` and `scouting_roster` are reachable by call_app but answer one piece each |
| Event RSVPs | covered | `event_signups` |
| Posted event roster (who is going, roles, eligibility) | missing | a named read of `event_rosters` and the roster roles (0016); posting is `staff_post_roster` by call_app (asks first) |
| Trip carpool and food boards | covered | `trip_boards` |
| Families who have not signed up for a trip | covered (new) | `trip_signups` |
| FIRST registration status | covered as the family's tick | `trip_signups` (first_registration is what the family ticked on the trip form; nothing in the app checks FIRST itself) |
| Resend a family link | covered | `send_family_link` (asks first) |
| Feedback inbox | covered | `feedback_inbox`, `feedback_set_status`, `feedback_reply` |
| Announcement to Discord | preview only (new) | `preview_announcement`; sending is the open question above |
| Driver leaderboard | covered | `list_drivers`; logging drive time is `driver_log_session` by call_app |
| Schedule | covered | `list_events`, `create_event` |

## The alternatives

1. **Keep the default** (above).
2. **A `send_announcement` tool at confirm**, through the same function with action `send` and a request id, so a voice "post it" after the preview sends. Cost: the first connector path that messages the whole team Discord; the function already refuses a double post by request id.
3. **`sign_in_out` at confirm** with the time fixed by the tool at preview, so a confirm carries the same time. Cost: an extra round trip for every sign-in at a competition.
