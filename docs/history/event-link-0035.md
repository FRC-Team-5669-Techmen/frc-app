---
title: "Beach Blitz lessons: zero-setup event link, schedule match picker, station tools"
date: 2026-11-02
branches: [main]
commits: []
migrations: []
subsystems: ["Scouting", "Event rosters"]
---

Goal (Mr. Pina, 2026-11-02): "Beach Blitz has concluded. Take what you can
learn from the app and how it was used and improve it."

## What Beach Blitz showed (measured 2026-11-02, read-only)

- 217 stand observations from 20 scouts; 38% of qualification robot-matches
  covered; match keys typed freehand ("Qm1 r1", "Test", "Wm20"); observations
  of teams not at the event; paired scouts disagreed on FUEL by a median of
  about 40.
- The pick board, team import, shifts, super scouts, pit reports and pick
  lists went unused: every one waited on a manager typing a TBA key and
  pressing an import that sat at the bottom of the scouting page.
- Replayed on the real selection (tools/scouting/replay.mjs), the board would
  have put each actual pick at mean rank 4.2 of the teams still available
  (random 11.8).
- The research report: reports/Beach Blitz app lessons.md (chat deliverable).

## What was built

- `api/tba.js`: a keyless Vercel function reading The Blue Alliance's public
  pages (teams with names, schedule, results, alliances, and with detail=1
  each played match's 2026 breakdown in the API's field names). CDN-cached
  for a minute, so every device shares one fetch. Strict input patterns; no
  Supabase, no secret.
- `src/scouting/tbaPages.js`: the one parser, shared by the function and the
  tools. Fixed on the way: a disqualified robot's link carries attributes, and
  the old parser dropped it from the match (Beach Blitz qm2 had five robots).
- `src/scouting/eventLink.js`: a calendar competition finds its TBA event from
  our team's season events by date overlap, title as tiebreak, no guess on a
  tie. A key saved on the pick board or by an import still wins.
- Scouting page: a strip naming the linked event, quals played, and how many
  robots in the next match have no scout; the Teams tab and Rate teams use the
  event's team list when no team records were imported.
- Observation form: the schedule picks the match (first unplayed) and the six
  robots; robots already scouted say so; "Not on the schedule" keeps the
  typed fields; a typed team not at the event is flagged. A hand-typed draft
  reopens in the typed fields.
- Pick board: every device ranks from the live feed (exact HUB and TOWER per
  alliance from the match pages) with no key typed; a manager's pull still
  saves the shared copy and wins while it is at least as far along.
- My schedule: each station card opens its role's tool (`toolFor` in
  roleRules.js): scouting, the pick board, Meet a team, the battery board, the
  match log, Human player.
- `.ms-now` in MySchedule.css is scoped to `.ms-wrap`: MatchSim's phase bar
  uses the same class and would have taken its grid.

## Verified

- tests/tba-feed.test.js against saved Beach Blitz pages (tests/fixtures/tba/).
- tools/e2e/features/event-link.mjs 31/31; pick-board.mjs updated for the
  automatic link (87/87).
- Live: eventFeed('2026cabl', detail) from this container read 42 teams, 85
  matches and 85 breakdowns in 12.8 s cold; the function allows 60 s.

## Not verified

- The function on Vercel itself (first request after deploy).
- TBA rate limiting of a cold 70-page fetch (one per minute per event at most,
  behind the CDN).
- Offseason B robots: team numbers are integers through scouting, so "4414B"
  is not supported (Beach Blitz had none).
- The season priors in src/scouting/priors/ were built with the old parser
  (one DQ robot dropped per affected match); not regenerated, the 2026 season
  is over.
