---
title: "Scouting Teams tab: a sortable team table, cards on demand"
date: 2026-10-29
branches: [teams-table]
commits: []
migrations: []
subsystems: ["Scouting"]
---

Goal: the event scouting page's Teams tab rendered every team as a full
evidence card, 30 to a page. The head coach reads it on a laptop and hated the
scrolling. Measured on fixture mode before the change (the core seed plus 40
synthetic teams, 44 in all): 19,216 px at 1440 (21.35 screens) and 42,185 px
at 375 (51.95 screens); with the core seed's 4 teams alone 3,578 px and
6,805 px.

The tab now opens on `src/scouting/TeamTable.jsx`: one row per team with
scouted matches, median FUEL, best TOWER, trouble, defense, the super-scout
driver mean and a yes/decisive cell per capability, every figure from an
existing helper (`teamMatchSummary`, `superSummary`, `eventCoverage`, whose
trials are `reliability`) and its existing formatter, `--` for empty. The
pure rules (cells, sort, next sort, remembered sort) are in
`src/scouting/teamTable.js`. A header click sorts, numbers highest first,
empty last both ways, ties by team number; the sort is kept per device in
localStorage. A row tap opens the unchanged evidence card beneath it. The
30-per-page paging is gone. `CAPABILITIES` gained a `short` label for the
column headers.

Two layout fixes around it: the pit map, match brief and coverage panels sit
side by side on a wide screen while folded (an opened one spans the row), and
the footer's export blocks no longer take a 320 px HEIGHT each on a phone
(their 320 px flex-basis in a column-direction flex container), which had put
about 600 px of empty page under every scouting tab.

After: core seed 1,217 px at 1440 (1.35 screens) and 1,675 px at 375 (2.06);
44 teams 3,017 px (3.35) and 3,475 px (4.28). The remaining height at 44
teams is the rows themselves (45 px each, the 44 px phone target) and the
page header, tabs and tools above them.

Proof kept: `tests/scouting-team-table.test.js` (12 tests; a permissive
mutant treating empty as 0 reddens 2), `tools/e2e/features/scouting-teams.mjs`
(registered in `features.mjs`), and the existing scouting checks updated to
open a row before reading a card: `tests/scouting-dom.test.js`,
`tests/scouting-practice-dom.test.js`, `tools/e2e/features/scouting.mjs`,
`tools/e2e/scouting-volume.mjs` (all 120 teams as rows, then search and open).

Not verified: a real phone or laptop browser outside fixture mode, and live
data. Nothing touched SQL, Edge Functions or the connector.
