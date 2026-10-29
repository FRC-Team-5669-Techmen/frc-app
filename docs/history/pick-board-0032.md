---
title: "Pick board: automatic ranking, live alliance selection, Rate teams"
date: 2026-10-28
branches: [main]
commits: []
migrations: ["0042_scouting_pick_board.sql"]
subsystems: ["Scouting", "Connector"]
---

Goal (Mr. Pina, 2026-10-28, before Beach Blitz): choosing alliance partners
was manual and impractical on phones, there was no alliance selection in the
app, the screens were pages of scrolling and not laid out for a laptop, and
the scouts are not fully trained. Automate it without lowering quality, keep
people's overrides smooth, follow alliance selection live.

## Research first

A deep-research round (report: "Automated pick list and alliance selection",
four tracks: this app's code, external data, top teams' methods, draft-board
UX) found: no ranking in the app; sorting 40 teams with the arrows about 400
taps; the Teams tab 44 phone screens with 40 teams (fixture, admin); the EPA
filter would show nothing at Beach Blitz (Statbotics skips offseason events);
Beach Blitz 2026 runs four-team alliances, three pick rounds; TBA is the only
live source and gives per-robot TOWER levels but FUEL per alliance; no source
reports picks one at a time.

## What was built

- `src/scouting/pickRank.js` and `src/scouting/draft.js` (pure), the board
  page, one-tap Rate teams in Pick lists, migration 0042 for the shared board,
  a season prior per event from TBA's public pages
  (`tools/scouting/season-prior.mjs`), and the replay judge
  (`tools/scouting/replay.mjs`). Details: `docs/subsystems/scouting.md`, "Pick
  board and live alliance selection".

## Proof

- Replay of 10 real 2026 selections (211 picks), 2026-10-28: round 1 picks in
  the board's top 3 for 79 to 83 percent, plain OPR 73 to 79, season alone 46
  to 50, random mean rank 14 to 16.
- `0042_scouting_pick_board_rls_test.sql` 25/25; `mutants-0042.mjs` 10/10.
- `tests/pick-rank.test.js` and `tests/pick-draft.test.js` 24/24.
- `tools/e2e/features/pick-board.mjs` 81/81 at 375 and 1440.
- Not verified here: the live database, the live `scouting-import` answering
  2026cabl with breakdowns (it answered teams and an empty match list on
  2026-10-28, before the event), real phones, and the arena's network.
