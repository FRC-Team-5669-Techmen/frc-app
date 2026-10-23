---
title: "Human player leaderboard: accuracy, rate and match-run drills, counted live, one Human Player Score per season (0033)"
date: 2026-10-23
branches: [local/hp]
commits: []
migrations: ["0033_human_player_leaderboard.sql", "0033_human_player_leaderboard_rls_test.sql"]
subsystems: ["Human player leaderboard", "Connector", "Fixture mode", "Landing page and nav"]
---

Added `/human-player` (ledger 0025) so Mr. Pina can rank human players in a way that predicts competition performance. Three drills are logged per attempt by the player or by staff: accuracy (a fixed set of shots, 20 by default), rate (a timed burst, 30 s by default) and a match run on the simulator clock from `src/matchSim.js` with the HUB order drawn at random and shown before the start. A full-screen live run gives the person logging two big pads (+1 MADE, +1 MISS, count by 5, undo), calls the phases with the simulator sounds (the cue hook moved from `MatchSimPage.jsx` to `src/matchCues.js` so both pages share it) and files each make as active or inactive by the HUB state at the tap. The Human Player Score lives only in `src/humanPlayerScore.js`: per drill the mean of the best 3 of the last 5 attempts, divided by the team best, ranked only after 3 attempts of every drill, weighted 0.5 match run, 0.3 rate, 0.2 accuracy. The SQL stores attempts and never scores. A Human player tile went on `/robot` next to Drivers, the connector got `list_human_players`, and fixture mode got the feature and a spec.

0033 replaces `_merge_member_rules`, copied from 0031 with the four `hp_attempts` columns. Migration 0032 was reserved by another session when this was written; if 0032 also replaces that function, whichever lands second must carry both lists (`tests/merge-coverage.test.js` reads the latest copy in the chain and fails on a missing column).

Measured in this tree: the 0033 test 15/15 in the SQL harness, 12/12 permissive mutants caught, the human-player feature spec at 375 and 1440 (the live match run driven with the fixed clock advanced into SHIFT 1 and SHIFT 2). Not verified: the live database (the Migrate workflow applies 0033 on push), a real phone in the shop, audio cues (headless), and the weights themselves, which are proposed defaults for Mr. Pina to tune.
