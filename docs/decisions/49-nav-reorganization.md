# 49 The app is getting busy: how should the navigation be ordered and grouped?
- Raised: 2026-10-22 by the feedback inbox session (ledger 0016), from feedback 9b01037c (Mr. Pina, /certifications: "app is getting busy needs a lot of organization and practical interface work. minimize actions to take action for every action in order or most used to least used actions if need be.")
- Status: decided (2026-10-23, ledger 0017)
- Default if nobody decides: **the navigation stays as it is until `src/NavBar.jsx` is free.** Ledger 0015 (scouting) lists `src/NavBar.jsx` and `src/App.jsx` in its Owns and is not marked deployed, and ledger 0016 was told not to touch anything the scouting review branch owns. The first session allowed to edit `src/NavBar.jsx` applies the proposal below as written, then reruns `node tools/e2e/nav-audit.mjs` for the AFTER numbers and screenshots.
- Decided: 2026-10-23. Mr. Pina, to ledger 0017: "The FRC app is very confusing and overwhelming right now. The amount of buttons, like when you click on your profile, for me especially, there's probably 15, 20 buttons I have to click on." The "wait until NavBar.jsx is free" default was lifted (the scouting branch was deployed into main on 2026-10-22), and ledger 0017 went further than the proposal below. What shipped is under AFTER.

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

## AFTER (measured 2026-10-23, fixture mode, `node tools/e2e/nav-audit.mjs`)

Screenshots: `docs/decisions/49-nav-after/` (the bar and menu per persona, `/manage` for mentor and admin, `/robot`).

| Persona | Top bar | Hours menu | Account menu | Team admin (/manage) |
| --- | --- | --- | --- | --- |
| Student | 5 (Home, Schedule, Scouting, Robot, Hours) | 4 | 5 (My profile, My standing, Handbook, Replay tour, Sign out) | none |
| Mentor | 5 | 4 | 5 (Team admin with the waiting total, My profile, Handbook, Replay tour, Sign out) | 16 tools, 4 groups |
| Admin | 5 | 4 | 5 (same, total includes feedback) | 19 tools (adds Feedback, Announce, Roster) |
| Parent | 3 (Home, Schedule, Team Hours) | none | 5 (My profile, Standing, Handbook, Replay tour, Sign out) | none |

Before: 13, 23, 26 and 7 menu items. After: 5 for everyone (6 for a student Mr. Pina named a sign-out approver, who also gets Sign-outs).

- **Top bar for members**: Home, Schedule, Scouting, Robot, Hours. On a phone the five sit in one row, icon over label (they wrapped to three rows of pads before).
- **Robot** (`/robot`): Batteries, Jobs, Sub-team status, Certifications, each tile with its live state (match-ready batteries, your jobs, sub-teams at risk, certifications held).
- **Team admin** (`/manage`, staff): Right now (Sign-outs, Access requests, Feedback), Events (Trips, Event rosters, Readiness, Announce, Surveys), People (Roster, Applications, Squad, Team standing, Emergency information, No-photo list), Hours (Verify hours, Team hours, Reports, Activity, Display). A tile with something waiting moves into "Waiting on you" at the top, most waiting first. A filter box finds a tool by name, by what it does, or by a word it answers to ("carpool" finds Trips). The catalog is one list, `src/adminTools.js`, read by the page, the menu badge and the staff Home tile; `tests/nav-admin.test.js` holds every tool to an App.jsx route and the menu to six entries.
- **Moved out of the menu**: Driver documents, the weekly survey and (for parents) emergency information are on My profile ("Your records"); Trips and Event rosters are on the Schedule for every member; Scouting is a top tab; the leaderboard is in the Hours menu; Certifications and Sub-team status are on Robot.
- **Home, "Do this now"** (`src/doThisNow.js`): a sent-back sign-out, an unread family sign-up reminder (with Done, which marks it read), open checklist steps (FIRST registration, Discord, GroupMe, handbook signature, emergency information) and the open weekly survey. Nothing open renders nothing.
- **Taps**: a mentor reaches Sign-outs in 3 taps (account, Team admin, the tile) or 2 from the staff Home tile; when anything is waiting it is the first thing on `/manage`. Every page kept its address, so Discord links, the tour and the connector are unaffected. The tour reads `src/featureGuide.js`, whose `where` lines now name the new places.
