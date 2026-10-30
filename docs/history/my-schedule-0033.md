---
title: "My schedule and station reminders"
date: 2026-10-30
branches: [main]
commits: []
migrations: ["0043_my_schedule.sql"]
subsystems: ["Event rosters", "Push notifications", "Event family hub"]
---

Goal (Mr. Pina, 2026-10-30, the morning the team left for Beach Blitz): each
member sees their own schedule for each competition day, when they have to be
where, and gets a push a few minutes before each station or role.

## What was built

- `/my-schedule`: a tab per competition day with the member's own role board
  stations (one card per slot, every role, where to go; backups marked), their
  ride (driver, car, leave time, meeting place) and the team's blocks; Now and
  Next on top. Linked from Home's Do this now shift item (it used to open the
  role board) and from My shifts on the role board.
- 0043: `my_schedule_rides` (only the caller's own seats), and
  `schedule_reminders_run` on pg_cron every minute: a push 10 minutes before
  every ASSIGNED slot and 15 before a car leaves, once each, through
  `_push_one` (category `role_reminder`, listed in Notifications).
- `src/pushSubscribe.js`: the one copy of turning push on, now used by
  Notifications and by My schedule's Turn on.

## Proof

- `0043_my_schedule_rls_test.sql` 17/17; `mutants-0043.mjs` 8/8.
- `tests/my-schedule.test.js` (with the page and push place words held equal),
  `tests/do-this-now.test.js` updated for the new link.
- `tools/e2e/features/my-schedule.mjs` 37/37 at 375 and 1440.
- Not verified here: that push is deployed and that members' phones are
  subscribed (VAPID keys and `private.push_config` on the live project), and a
  real push arriving on an iPhone or Android. iPhones need the app on the Home
  Screen.
