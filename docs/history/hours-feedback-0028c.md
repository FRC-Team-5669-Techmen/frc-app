---
title: "Hours feedback: Approve all on /verify-hours, FRC or FLL on the signed-in lists"
date: 2026-10-28
branches: [worktree-agent-a3cce81a26b6cb57a]
commits: []
migrations: ["0040_hours_bulk_approve.sql"]
subsystems: ["Hours", "Check-in", "Presence board", "Connector", "Fixture mode"]
---

Two feedback reports from Mr. Pina, both open on 2026-10-28.

**c4f9a940, /verify-hours: "I want an approve all button for approving hours".**
Found: Pending Hours lists every `logged_hours` row with status pending, oldest
first, with no filter, and each Approve calls `staff_review_logged_hours`
(0019) through `writeVia`. That function is one UPDATE that answers success
even when it matched no row, so a loop of it could not tell the page which
entries were really approved, and the page's single Approve also dropped any
error silently. Built: `staff_approve_logged_hours(uuid[])` in migration 0040,
staff only (42501 otherwise), SECURITY INVOKER, one UPDATE of the listed
entries that are still pending, RETURNING them. The page
(`src/loggedHoursBulk.js`) shows one Approve all with two or more entries, one
confirm ("Approve 4 entries, 10.5 hours?") built from exactly the entries
shown, counts only the rows the database returns, names every entry not
approved, says "Nothing changed" on a failed call, and re-reads the list.
Before 0040 is applied, the fallback is one direct UPDATE ... RETURNING with
the same count rule. The single Approve now shows a failed write.

**37b5feee, /signouts: "I want to see a status if someone is signed into FRC
hours or FLL hours".** Found: the data records it. An open session's kind is
its IN event's `attendance_events.category`; `/checkin` writes `build` and
`/checkin-volunteer` and `switch_to_fll` (0014, IN 1 ms after the OUT) write
`volunteer`. `/signouts` already selected `category` but never showed it;
`/display` did not select it. Built: `sessionKind` in `src/categories.js`
("FRC" for build, "FLL volunteer" for volunteer, the category label
otherwise, legacy null/normal as FRC) and `computePresenceDetail` in
`src/presence.js` (`{ since, kind }`; `computePresence` keeps its shape for
the glance and the parent view). Signed in now on `/signouts` and every
present row on `/display` carry the label in the category color beside the
sign-in time.

Measured on 2026-10-28: `0040_hours_bulk_approve_rls_test.sql` 8/8 in the SQL
harness, `mutants-0040.mjs` 5/5 caught; `tests/hours-feedback-0028c.test.js`
12 tests; fixture E2E `verify-hours` 34/34, `signout` 110/110,
`display-history` 226/226 (its board column list now includes `category`).
Not verified: the live database (0040 not applied anywhere), real devices.
