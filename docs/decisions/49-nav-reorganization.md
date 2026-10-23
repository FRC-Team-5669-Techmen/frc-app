# 49 The app is getting busy: how should the navigation be ordered and grouped?
- Raised: 2026-10-22 by the feedback inbox session (ledger 0016), from feedback 9b01037c (Mr. Pina, /certifications: "app is getting busy needs a lot of organization and practical interface work. minimize actions to take action for every action in order or most used to least used actions if need be.")
- Status: open
- Default if nobody decides: **the navigation stays as it is until `src/NavBar.jsx` is free.** Ledger 0015 (scouting) lists `src/NavBar.jsx` and `src/App.jsx` in its Owns and is not marked deployed, and ledger 0016 was told not to touch anything the scouting review branch owns. The first session allowed to edit `src/NavBar.jsx` applies the proposal below as written, then reruns `node tools/e2e/nav-audit.mjs` for the AFTER numbers and screenshots.
- Decided: --

## What is actually true right now (measured 2026-10-22, fixture mode)

`node tools/e2e/nav-audit.mjs` (kept in the repo) opens the dashboard as each persona at 375 and 1440 and reads the bar and the account menu. Screenshots: `docs/decisions/49-nav-before/`.

| Persona | Top bar | Hours menu | Account menu |
| --- | --- | --- | --- |
| Student | 5 (Dashboard, Schedule, Jobs, Hours, Certs) | 3 | 13 items, one flat list |
| Mentor | 5 | 5 | 23 items, two flat blocks, no headings |
| Admin | 5 | 5 | 26 items |
| Parent | 3 (Dashboard, Schedule, Team Hours) | none | 7 items |

- On a phone the mentor menu is taller than the screen: everything after Emergency information (Surveys, Trips, Applications, Access Requests, Squad, Activity, Display) is below the fold inside the menu, and Sign-outs, the action a mentor takes most during a meeting, is the ninth item.
- Certifications is both a top tab and an account menu item for a student and a mentor.
- Trips is in the student block for a student and in the staff block for a mentor, so it moves between roles.
- The menu mixes personal pages (Profile, Handbook) with team pages (Scouting, Rosters) and staff tools with no heading between them.

## The proposal (applied when the default lifts, unless he says otherwise)

Ordered by how often each is used, most used first, with a heading per group; the top bar stays five tabs on a phone.

- **Top bar** (unchanged for members): Dashboard, Schedule, Jobs, Hours, Certs. Parents: Dashboard, Schedule, Team Hours.
- **Account menu, mentor and admin:**
  1. *Right now*: Sign-outs (with the waiting count), Access requests (count), Feedback (count, admin), Readiness, Team standing.
  2. *Events*: Trips, Event rosters, Scouting, Announce (admin).
  3. *Team*: Applications, Squad, Roster (admin), Activity, Display, Surveys, Emergency information, No-photo list.
  4. *Me*: My Profile, My standing (students only), Handbook, Driver documents, Weekly survey, Replay tour, Sign out.
- **Account menu, student:** *Events* (Trips, Event rosters, Scouting), *Team* (Sub-team status, Hours leaderboard), *Me* (My standing, Weekly survey, My Profile, Handbook, Driver documents, Replay tour). Certifications leaves the menu (it is a top tab).
- **On a phone** the menu scrolls inside itself with the group headings sticky, so the first group is always on screen.
- Taps saved: a mentor reaches Sign-outs as the first menu item (2 taps, now with no scroll on a phone); every page keeps its address, so links, the tour and the connector are unaffected. The tour reads `src/featureGuide.js`, whose `where` lines then change with it.

## The options

1. **The proposal above**, when NavBar.jsx is free (the default).
2. **Now**: Mr. Pina says the scouting release is done with NavBar.jsx (marks ledger 0015 deployed), and the next session applies it.
3. **A different order**: name the five things you open most and they go first.
