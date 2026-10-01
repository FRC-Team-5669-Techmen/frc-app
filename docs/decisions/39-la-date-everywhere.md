# 39 Should every date the app shows or groups by be the America/Los_Angeles date, including the moment the season and its application gate turn over?
- Raised: 2026-10-01 by the overnight session (the hours-dates pass)
- Status: open
- Default if nobody decides: **yes, as the tree does at `e652b01`.** Hours
  bucketing (By category, By season, the Team Hours Matrix and drill-down, Days
  present, reports and letters), "today" on Log Hours and Jobs, and the current
  season (`resolveCurrentSeason` in `src/seasons.js`) all use the LA date
  (`laDateKey` in `src/hoursUtils.js`), whatever zone the device is in. The
  season, and with it the member application gate, turns over at LA midnight.
- Decided: --

## What is actually true right now

- Before 2026-10-01, most of these used the UTC date. After 5 PM PDT (4 PM PST)
  the UTC date is tomorrow, so a session crossing it was dropped from every
  total (the 2026-09-23 report), Log Hours defaulted to tomorrow, a job due
  today read overdue, and on 2027-01-06 the app would have asked for a Biocore
  2027 application from 4 PM.
- One exception is kept on purpose: `src/StudyPage.jsx` still uses the UTC date
  for "today", because it may need to match a server-side `current_date`. That
  is unverified. The Applications CSV's file name also carries the UTC date.
- A session at an out-of-state competition changes LA date only if it starts
  between local midnight and the zone offset, so travel almost never moves a
  session.

## The options

**A. LA everywhere (the default), then check StudyPage against its SQL.**

**B. The device's local date.** Different students would see different days
for the same session.

**C. UTC.** The bug class this replaced.
