---
title: "Handbook: one contact for everything, the whole text on a Handbook tab with search, section links, a students-only leaderboard"
date: 2026-10-20
branches: [main]
commits: []
migrations: []
subsystems: ["Member handbook", "Families and records"]
---

Mr. Pina could not find the rules he wanted to cite in a reply to a student: the app showed lesson numbers 01 to 18 while the text said Section 4 or 6, and the full text sat inside collapsed lessons, so "where is the rest of the handbook" had no answer on screen.

- Who to ask: Mr. Pina for everything, his email and phone shown; Mr. Garza helps in the background (Section 1). The Who to ask table lost the Garza row (6 rows).
- The Lessons tab is now **Handbook**: sections 1 to 22 in order and open, each with its own number, a check after each part, an index of all 24 sections, a phone "Go to section" menu, and search that filters sections and marks the words. `?section=N` lands on a section; `?tab=lessons` still opens the tab.
- A link inside bold text (the FIRST Code of Conduct line, Section 14) rendered as raw markdown and overflowed the phone by 22px; `plain()` and the renderer now read bold recursively, and `tests/handbook.test.js` fails if any section leaks link markup (it failed before the fix).
- The leaderboard ranks students only; mentors, admins and parents are listed apart. `tools/e2e/features/families.mjs` gives the mentor more hours than any student and checks 0 on the student board against 1 apart, with Sam the other way round.

Not verified: the live site after deploy (fixture mode only), and the live `member_roles` content behind the leaderboard split.

## Wording audit (same day)

Mr. Pina found instructions written into the rules as explicit negatives ("never excused: a mental health day", from his note not to copy that from 1678). Every such line was reworded or cut: Section 6 (never-excused list, "no limit for now"; a test, major assignment or college application deadline asked ahead is now excusable, since school comes first), 7 (his own hours, Team 111), 12 and 16 ("no other forms", "no dues", "no quota"), 14 ("no outside appeal"), 18 (last season's letters), 19 and 20 (service hours, Live Scan). Section 22 gained one line: a conflict that existed before the handbook gets a written plan with Mr. Pina through the end of that activity's season. The absence form label and the standing page line follow the new wording.

## Parents could not open the handbook (2026-10-21)

A parent tapped the GroupMe link to `/handbook`, signed in with Gmail and got Google's "org_internal" block: the consent screen is Internal to boscotech.edu. `/rules` now serves the handbook to anyone with no login (no Sign tab), and Team standing has one button that emails every family its private link, which already holds the handbook text and the parent sign box. `families.mjs` checks both: 3 tabs and the note signed out against 4 and none for a member; one tap queues 0 emails and the confirm queues one per family on file; a student sees 0 buttons.
