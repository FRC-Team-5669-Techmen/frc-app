---
title: "Driver leaderboard: drive time, MoSim, coach ratings and one Driver Score per season (0029)"
date: 2026-10-23
branches: [local/drivers]
commits: []
migrations: ["0029_driver_leaderboard.sql", "0029_driver_leaderboard_rls_test.sql"]
subsystems: ["Driver leaderboard", "Connector", "Fixture mode"]
---

Added `/drivers` (ledger 0020): members log real robot sessions (practice field, match, test) and MoSim sessions; staff log for anyone, edit and void, and rate drivers on control, awareness, scoring, defense and consistency. One Driver Score per driver per season comes from `src/driverScore.js` alone (practice hours with MoSim weighted 0.35, diminishing returns through 1 - e^(-hours/10), half experience and half the mean of each coach's newest rating). The SQL deliberately does not score. Coach notes are readable by staff and the rated driver only; everyone else reads the criteria through `driver_rating_scores()`, which has no note column. A Drivers tile went on `/robot`, the connector got `list_drivers`, and fixture mode got the feature and a spec.

Measured in this tree: the 0029 test 18/18 in the SQL harness, 12/12 permissive mutants caught, the drivers feature spec 61/61 at 375 and 1440. Not verified: the live database (the SQL is pasted by hand later), a real phone, and the weights themselves, which are proposed defaults for Mr. Pina and the drive coach to tune.
