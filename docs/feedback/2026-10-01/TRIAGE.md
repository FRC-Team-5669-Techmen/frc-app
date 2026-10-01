# Feedback round 2026-10-01: triage

The first round in this repository, run over the six reports that were open before the
feedback console existed. The oldest was filed 2026-09-03. All six were built by the
overnight session of 2026-10-01 and are on `main` and deployed. One of them, the Discord
announcements report, cannot be used until Mr. Pina finishes its setup.

Every report is listed below with its reporter by role, its route, when it was filed in
America/Los_Angeles, its text, what was built, the commit on `main`, what Mr. Pina still
has to do, and the status [`MARK_DONE.sql`](MARK_DONE.sql) gives it.

## How this round differs from the procedure in `docs/feedback/README.md`

[`docs/feedback/README.md`](../README.md) and `.claude/skills/feedback-round/SKILL.md`
describe a round that starts from an export of the console. This one did not, because the
console was being rebuilt the same night. So:

- **No zip, no `digest.txt`, no `MARK_SEEN.sql`.** The six reports came to the session in
  its prompt, by reporter, route and filed time. There was no export to copy a
  `MARK_SEEN.sql` from, and nothing needed to sit in Seen: every report was built the same
  night.
- **`MARK_DONE.sql` matches by route, filed minute and reporter role, not by report id.**
  The SKILL's `MARK_DONE.sql` shape uses report ids, which come from an export. Without
  them, the file finds each report by its route, the minute it was filed in Los Angeles,
  and whether its reporter holds the admin role or holds no staff role. It raises and
  changes nothing unless each of the six matches exactly one report.
- **No `QUEUE.md`, no session prompts.** All six were built in one session (workstreams B
  to F), so there is no queue of build sessions to run.
- **The two student reports are quoted in full.** The SKILL allows a few words. These are one
  sentence each, carry no name, and their wording is the evidence for the bug (the "check-in
  portal" is a specific screen). Reporters are named by role; Mr. Pina may be named.

The README's own description of this round ("the first round, run over the reports that were
open before this console existed. Closed with `MARK_DONE.sql` rather than an export") is
accurate.

## Summary

| | Filed (LA) | Route | Reporter | Built in | On `main` | `MARK_DONE.sql` sets |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | 2026-09-23 3:53 PM | `/my-hours` | a student | workstream B | `9543e90` | done |
| R2 | 2026-09-08 3:32 PM | `/dashboard` | a student | workstream B | `9543e90`, follow-ups `e24d63d` | done |
| R3 | 2026-09-03 4:19 PM | `/schedule` | Mr. Pina (admin) | workstream C | `9543e90` | done |
| R4 | 2026-09-03 3:32 PM | `/display` | Mr. Pina (admin) | workstream D | `9543e90` | done |
| R5 | 2026-09-10 4:48 PM | `/schedule` | Mr. Pina (admin) | workstream E | `9543e90` | in_progress |
| R6 | 2026-09-03 4:18 PM | `/schedule` | Mr. Pina (admin) | workstream F | `9543e90` | done |

The commits named under each report are the change itself; each reached `main` and production
in the push whose tip is given above.

## What Mr. Pina pastes, in order

All by hand in the Supabase SQL editor. Each migration's test rolls itself back and returns
one row per check; every row should read PASS.

1. `supabase/migrations/0002_feedback_console.sql`, then
   `supabase/migrations/0002_feedback_console_rls_test.sql` (24 rows). The new console has
   been live since `9543e90`, so 0002 may be pasted now.
2. `docs/feedback/2026-10-01/MARK_DONE.sql`. It needs 0002's statuses. It returns the six
   rows it changed: five `done`, one `in_progress`.
3. When ready for R6: `supabase/migrations/0004_member_permissions.sql`, then its test (34
   rows: 33 checks and a summary).
4. When ready for R5: `supabase/migrations/0003_discord_announcements.sql`, then its test (24
   rows), and the rest of R5's setup below.

The row counts are from a throwaway Postgres 16 built from this repo's SQL, on 2026-10-01.
Nothing here has been run against the live project.

---

## R1. My Hours category totals

- **Reporter:** a student. **Filed:** 2026-09-23 3:53 PM. **Route:** `/my-hours`.
  **Device:** Android, Chrome, 384x692.
- **Report:** "In my category it only shows I have 2 hours for service hours but in recent
  sessions it shows I have a lot more hours."
- **Cause:** `buildBreakdown` (`src/hoursUtils.js`) grouped a member's attendance events by
  the UTC date of `event_time` and paired each check-in with a check-out only inside one
  group. A session that started before and ended after 00:00 UTC (5 PM PDT, 4 PM PST) had
  its two halves in different groups, so neither paired and the whole session was dropped
  from every category total. The Recent sessions list paired the whole ledger and showed it.
  After-school sessions that end after 5 PM are exactly those; a Saturday-morning session
  survived, which is the "2 hours". The rows were dropped, not put in the wrong category.
  This Week and the trend also summed sessions the totals left out.
- **What was built:** one derivation. `src/myHoursModel.js` derives the sessions once, marks
  each counted, pending, voided or flagged, and every hour figure on the page is summed from
  those rows. `buildBreakdown` now pairs sessions with `sessionsFromEvents` and assigns
  seasons by the Los Angeles date (`laDateKey`), and every hours surface uses that one day
  rule. Every attendance read pages past the API's 1000-row cap. Team Hours' by-member
  table, category strip and Goals view were fixed by the same change.
- **Commits:** `3226177` (the pairing fix), `e36f925` (the model), `19dd36a` and `79fd754`
  (paged reads), `a2c49c4` (one day rule). Tests: `tests/my-hours-pairing.test.js`,
  `tests/my-hours-model.test.js`, `tests/hours-day-rule.test.js`; browser spec
  `tools/e2e/features/my-hours.mjs`.
- **What Mr. Pina still does:** no SQL. Tell staff before they notice: student totals on My
  Hours and Team Hours rise, because sessions that were always in the ledger are now
  counted, and a goal's "met" state may change. No data was changed.
- **Not verified:** the student's own rows. The fix was reproduced on a constructed ledger
  with the report's shape.
- **`MARK_DONE.sql`:** done.
- **Decisions it raised:** 37 (what This Week counts), 38 (a Service subtotal), 39 (the LA
  date everywhere).

## R2. Check-out sent the student to check in

- **Reporter:** a student. **Filed:** 2026-09-08 3:32 PM. **Route:** `/dashboard`.
  **Device:** iPhone, Chrome for iOS, 342x673.
- **Report:** "I have been checking in, but every single time I try to check out it sent me
  to the check-in portal."
- **Cause:** `/checkin` toggled on every mount. After a tag check-in the tab stays on
  `/checkin`, and any later showing of that page again (the back-swipe the receipt's own VIEW
  STATUS link invites, a reload, Chrome on iOS reloading an evicted tab) silently wrote a
  check-out. The student's real check-out tap then found them already out and showed "Tap to
  confirm your check-in", which is the "check-in portal"; the dashboard showed "Not checked
  in" with no Check Out button. Inferred from the code and reproduced in Chromium against
  the unmodified pages; not observed in live data.
- **What was built:** one shared "checked in" rule, `src/attendanceState.js`, read by the
  dashboard, both tag pages, the presence board, the dashboard glance and the parent view. A
  page shown again never writes on its own; with a session open it shows "Checked in since
  ... [Check out]". A fresh tag tap still checks out with zero taps. A failed status read
  says so instead of falling through to the check-in screen. A session open across midnight
  counts while it is inside the 10-hour cap. The dashboard reads newest-first, re-reads when
  the tab comes back, and reports a failed check-out with its error code. Follow-ups: a
  failed `claim_profile` or roles read no longer downgrades what the tab holds, and the
  board, the glance, the parent view and the Team Hours In/Out pill read the same rule.
- **Commits:** `38cc65e` (the shared rule), `eff3d41` (act on an arrival once), `05e4826`
  (dashboard), `4783bef` and `73df1a5` (revisit edge cases), `44873a4`, `809fefb`,
  `35c2ef3`, `af10e6b`; follow-ups in `e24d63d`: `25bc795`, `32f058d`, `9864059`. Tests:
  `tests/attendance-state.test.js`, `tests/checkout-path.test.js`,
  `tests/checkout-arrival.test.js`, `tests/checkout-approval.test.js`;
  `npm run test:checkin` (51/51 at 375 and 1440 at `e652b01`), whose steps a, b, c1 and c2
  check in, check out, check in and check out again on the same day; browser spec
  `tools/e2e/features/dashboard-checkout.mjs`.
- **What Mr. Pina still does:** no SQL. Optionally, decide whether to repair sessions the bug
  cut short: decision 30 gives a read-only candidate query and the default (by hand, no
  automated repair).
- **Not verified:** a real iPhone or Android phone (Chromium only), and whether WebKit keeps
  the page's history state when it reloads an evicted tab.
- **`MARK_DONE.sql`:** done.
- **Decisions it raised:** 28 (one tap when a browser reuses the tab for a repeat tap), 29
  (the 10-hour bound across midnight), 30 (repairing past sessions), 40 (first-load
  failures).

## R3. The feedback type should be optional

- **Reporter:** Mr. Pina (admin). **Filed:** 2026-09-03 4:19 PM. **Route:** `/schedule`.
- **Report:** the text itself was not in the session's evidence. The session prompt
  summarized it as: Mr. Pina "reported on 2026-09-03 that he should be able to send feedback
  without picking one" (a type).
- **What was built:** the report box no longer requires a type, and adds "What did you try?"
  and a build stamp. Before 0002 is pasted, an untyped report is resent as the old neutral
  type, so sending works today. The rest of workstream C rebuilt the console: six statuses
  (New, Seen, In progress, Done, Won't do, Spam), bulk moves with an exact Undo, filters by
  status, type, route and reporter, and an export bar (a zip with screenshots, and Markdown
  parts sized for a chat), plus this folder's procedure (`docs/feedback/README.md`, the
  feedback-round skill) and migration 0002.
- **Commits:** `6684b92` (optional type and the insert ladder), `63d25dd` (0002), `e6c1aee`
  (the console), `3fb4616` (0002 files a member's report as New). Tests:
  `tests/feedback-model.test.js`, `tests/feedback-export.test.js`,
  `tests/feedback-zip.test.js`; browser spec `tools/e2e/features/feedback.mjs`; 0002's RLS
  test.
- **What Mr. Pina still does:** paste 0002 and its test, then `MARK_DONE.sql`. The optional
  type works without 0002; the new statuses, bulk moves and Undo need it.
- **`MARK_DONE.sql`:** done.
- **Decisions it raised:** 31 (whether an old "reviewed" report becomes Seen or Done).

## R4. Click a name on `/display` to see attendance history

- **Reporter:** Mr. Pina (admin). **Filed:** 2026-09-03 3:32 PM. **Route:** `/display`.
- **Report:** "I should be able to click on a name on this page to see attendance history."
- **What was built:** on `/display`, a mentor, lead or admin can click a name to open that
  member's attendance history: sessions grouped by day with sign-in, sign-out, location,
  duration and category, under a category totals strip, for the season Team Hours opens on.
  It is the same view as the Team Hours drill-down, extracted into one shared component, and
  on `/display` it is read-only (no manual entry, edit or void), because `/display` is often
  left open on a shared shop screen. A non-staff viewer sees no change.
- **Commits:** `9d9e63d` (one shared history view), `3854c6e` (staff click a name),
  `1755960` (the route passes the role check). Tests: `tests/attendance-history.test.js`;
  browser spec `tools/e2e/features/display-history.mjs`.
- **What Mr. Pina still does:** nothing. No SQL.
- **`MARK_DONE.sql`:** done.
- **Decisions it raised:** 36 (what the wall screen may show and who is listed).

## R5. Discord role pings, polls and announcements

- **Reporter:** Mr. Pina (admin). **Filed:** 2026-09-10 4:48 PM. **Route:** `/schedule`.
- **Report:** "Functionality for pinging certain roles on discord and polls and any other
  discord announcement functions."
- **What was built:** an admin-only composer at `/announce` (in the avatar menu for admins).
  It posts a message to one of #announcements, #general, #event-logistics or #parents, with
  optional role pings, an optional embed, or an optional poll, previewed before sending, with
  a "Check with server" dry run. Pings resolve only the roles ticked: `@everyone`, `@here`
  and user mentions can never fire. The Discord role list is a table the admin fills in, and
  every send is logged. It runs through a new Edge Function, `discord-announce`, using the
  bot the calendar poster already uses.
- **Commits:** `3eab2f8` (0003), `05cf222` (the Edge Function and its shared payload
  builder), `f7bade1` (the page), `44f52f7` (wiring). Tests:
  `tests/discord-announce.test.js`, `tests/discord-announce-function.test.js`,
  `tests/discord-announce-drift.test.js`, `tests/discord-announce-source.test.js`; browser
  spec `tools/e2e/features/announce.mjs`; 0003's RLS test.
- **What Mr. Pina still does, in order:**
  1. Paste `supabase/migrations/0003_discord_announcements.sql`, then its test (24 rows,
     all PASS).
  2. Check the function secrets `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` exist (the
     calendar poster uses the same names; `npx supabase secrets list`).
  3. Deploy the function by hand with JWT verification ON:
     `npx supabase functions deploy discord-announce` (no `--no-verify-jwt`).
  4. In Discord, give the bot's role a channel overwrite in #announcements (and in any other
     listed channel you will use) allowing View Channel, Send Messages, Embed Links and Send
     Polls. Do not grant "Mention @everyone, @here, and All Roles" (decision 35).
  5. Fill in the role list on `/announce`: turn on Developer Mode, then Server Settings >
     Roles, right-click a role, Copy Role ID, and paste its exact name and id.
  6. Send a short test with no roles ticked after "Check with server" reports the payload,
     the channel and each role as found.
  7. Then mark R5 Done in the console.
- **Not verified:** the Edge Function ran only under Node with fakes (no Deno here), and no
  real Discord call was made.
- **`MARK_DONE.sql`:** in_progress, because the code is shipped but nothing can be sent until
  the steps above are done.
- **Decisions it raised:** 35 (who may send, and the bot's mention permission).

## R6. Let students add calendar events

- **Reporter:** Mr. Pina (admin). **Filed:** 2026-09-03 4:18 PM. **Route:** `/schedule`.
- **Report:** "I need to be able to give student permissions to add events to calendar."
- **What was built:** per-member capabilities: a `capabilities` table and a
  `member_permissions` table keyed by member and capability, so a later permission is a new
  row, not a new column. The first capability is adding calendar events. An admin grants and
  revokes it per member on `/roster` ("Can add calendar events"). It is enforced in RLS and
  in `has_capability()`, not only in the UI; a holder may add events, and edit or delete only
  their own, never mark one mandatory. Staff keep exactly the access they had.
- **Commits:** `f945f1c` (0004), `b7bc258` (the client mirror of the rules), `4bdfb37` (the
  schedule offers the form to holders), `a5f2753` (the roster grant), `eea8a4c` (series and
  approval). Tests: `tests/permissions.test.js`, `tests/permissions-fixture.test.js`;
  browser spec `tools/e2e/features/permissions.mjs`; 0004's RLS test.
- **What Mr. Pina still does:** paste 0004 and its test (34 rows: 33 checks and a summary,
  all PASS), then grant the permission on `/roster`. Until 0004 is pasted, the roster's
  control reads "Not set up yet".
- **`MARK_DONE.sql`:** done.
- **Decisions it raised:** 32 (where a student's event reaches: Discord, push, the week-ahead
  post; mandatory stays staff-only).
