# 52 Should robot match performance count toward the Driver Score?
- Raised: 2026-10-28 by the robot match log session (ledger 0028).
- Status: open
- Default if nobody decides: **No.** The Driver Score (`src/driverScore.js`) stays as it is: drive time (an imported match adds its minutes as a drive session, like any other), MoSim and coach ratings. Match numbers (balls in, shots into a closed hub, ready %, hang time) show on `/robot/matches` Trends per driver and are not scored.
- Decided: --

## Why it is a question

The match log now holds per-driver numbers from the robot itself. Scoring them would reward the driver for things the operator, the shooter's tuning and the alliance also decide (ready % depends on vision and the flywheel; balls in depends on intake and feeding), and a small sample (a few matches) moves a score a lot. Not scoring them leaves the best evidence of match driving out of the leaderboard.

## Options

1. **No (default).** Trends only.
2. **A small match component**, for example the median of balls in per match over the last 5 real-field matches, at most 15% of the score, counted only from 3 matches up.
3. **Coach-rated only.** Keep the robot numbers out, and have the drive coach rate each real match on the existing five criteria from the match detail page.
