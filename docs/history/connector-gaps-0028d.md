---
title: "Connector gaps: seat a student, trip day roster, absences waiting and decided together"
date: 2026-10-28
branches: [worktree-agent-a6d28098b8dfca1e1]
commits: []
migrations: []
subsystems: ["Connector", "Event family hub", "Member standing"]
---

Goal: close three connector gap reports filed from Mr. Pina's chat on
2026-10-28, before Beach Blitz (Oct 30 to Nov 1):

- **48e69e1a**: the connector could not place a student in a car seat on a
  trip's carpool board, or move one between cars. Mathias Garcia was unplaced
  every day and Joaquin Whittemore unplaced Friday, and inside the 72-hour
  lock only staff can change seats.
- **33c4a50b**: no read of which students attend each trip day by name, with
  arrival and leave times; `trip_boards` gives headcounts and car riders,
  `trip_signups` only who answered.
- **566af99c**: no read of the absence requests waiting for a decision, so
  `decide_absence` (which needs a request id) could not be reached by voice;
  and no way to decide many at once. The rest of that report (it continues
  "and no way for a mentor ...") was not read: the feedback row lives in the
  live database, which this session did not query.

## What the tree already had

- **The staff seat path exists.** The mentor page's Carpool tab moves a
  student with `hub_staff_call('move', {invite_id, day_id, run, car_id,
  override_reason})` (0005): `car_id` null takes them out of their car on
  that day and way, otherwise `_hub_claim` (0009) seats them, moving them out
  of any other car that day and way. Every carpool rule is in that function:
  seats, the one-minor rule (a staff override with a reason), a car that left,
  a family driving that way. The 0016 `carpool_lock_guard` trigger lets staff
  through inside 72 hours and nobody inside 12. `hub_staff_call` was already a
  generated connector entry at confirm, so no migration was needed and none
  was written (0039 stays free).
- **Staff read every hub table** (0005 policies: `is_staff()` select on
  invites, day answers, cars, seats) and `hub_member_board` answers staff the
  staff board, with each rider's and each unplaced student's invite id.
- **The trip form asks no arrival or leave time per student.** What exists:
  per day the meet time, target arrival, venue open and close, pits close and
  the ride-home choices (Friday: leave at 9:00 PM, or stay for the movie);
  per car its leave-by time. `trip_day_roster` reports those and says so.
- **Absences**: `absence_requests` is readable by staff (0015
  `_can_see_member`); `decide_absence` (0025) is staff only, never for
  yourself, and refuses to deny a request still unanswered when its event
  started (it already counts as approved).

## What was built (no SQL)

- **`writeGroup`** in `api/_lib/connector/engine.js`: several asks-first
  writes asked as ONE question. Each plan stays its own `connector_call`
  (own transaction, audit row and preview). The first call previews all and
  answers one `confirm_token`, each plan's own stored token joined with dots,
  only when none refuses. The second call takes and checks every token against
  its own plan before committing any (a stale or mismatched token writes
  nothing for anyone), then commits in order, reporting a commit-time refusal
  per item as `partial`. It throws for a plan below confirm, which would
  commit before the question. `write` gained an internal `confirmed` option
  that only `writeGroup` sets; no tool argument reaches it.
- **Readable trip refusals**: a `hub:<code>` error now answers the page's own
  sentence (the error detail) with the code in `reason`, for every connector
  call into the trip hub, not only the new tool.
- **`place_in_car`** (kind function, `hub_staff_call`): student, car (driver
  name or `none`), day (date, weekday or `all`), run (there, home, both),
  trip, override_reason. Skipped ways are listed, never guessed: no car from
  that driver that way, not coming that day, the family driving, already in
  that car. A single named day and way refuses instead of skipping.
- **`trip_day_roster`** (read), **`absences_waiting`** (read) and
  **`decide_absences`** (kind function, `decide_absence`, grouped), with a
  hand entry for `decide_absence` in `functions.yaml` (confirm, words for
  `find_tool`).

## Proof

- `tests/connector-trip-absences.test.js`, 16 tests through the real runner
  and engine over the memory backend: one preview and one confirm for five
  moves, the same token twice, a token for other changes or missing a piece,
  a refusal at preview offering nothing, a commit-time refusal reported as
  partial, unknown and ambiguous students and cars, a student not on the
  trip, a day not on it, not coming, family driving; the roster per day with
  its positive control (Joaquin present Friday, absent Saturday); absences
  listed, filtered, decided together, and refused for an unknown, malformed
  or already decided id.
- Eight permissive mutants of the new code (the group token check, the level
  gate, the preview refusal, the not-coming check, the ambiguous car, already
  decided requests, the pending filter, the roster's seat lookup), each
  killed by that file.
- `tools/connector/harness/proof.mjs` gained fixtures (a hub day, Riley
  coming, a mentor car, a pending absence) and hand samples for
  `hub_staff_call` (one move with the override reason) and `decide_absence`.

## Not verified

- Nothing ran against the live project. Whether Beach Blitz's real cars,
  answers and absences produce the expected answers is unchecked; the live
  board's driver names decide what "Pina" matches.
- The rest of report 566af99c (cut off at "no way for a mentor") was not
  read, so whatever it asks beyond who, event, reason, filed and deciding many
  at once is not built.
