---
title: "Overnight 2026-10-01: IDEA certifications mirror, feedback console, the two open bugs, /display history, Discord announcements, member capabilities, the shape language, fixture mode, overhaul audit"
date: 2026-10-01
branches: [claude/zen-wozniak-n1tf1o]
commits: ["89896ca", "9543e90", "e24d63d", "7cdf3e3", "e652b01"]
migrations: ["0001_idea_certifications_mirror.sql", "0001_idea_certifications_mirror_rls_test.sql", "0002_feedback_console.sql", "0002_feedback_console_rls_test.sql", "0003_discord_announcements.sql", "0003_discord_announcements_rls_test.sql", "0004_member_permissions.sql", "0004_member_permissions_rls_test.sql"]
subsystems: ["Hours and attendance", "Feedback", "Discord", "Schedule", "Roster and access", "Theme", "Testing", "CI", "Documentation"]
---

One solo session, run overnight on 2026-10-01 from `afc0435`, built eight
workstreams (A to H in the prompt, ledger entry 0002) and pushed them straight
to `main` in five fast-forward pushes, never forced: `89896ca`, `9543e90`,
`e24d63d`, `7cdf3e3` and `e652b01`. Every one is deployed; the live app's
feedback widget chunk carries the build stamp `e652b01`. **None of the four
migrations it wrote has been applied to the live project.** Nothing in this
container can reach that project, so every feature that needs one shows "not
set up yet" until a person pastes it. The list below is what that person does.

## What a person must do, in this order

All SQL is pasted by hand into the FRC app project's Supabase SQL editor. Each
test file rolls itself back and returns one row per check; every row must read
PASS.

1. **Take a backup first** (the Dashboard's backup, or `pg_dump`). Whether the
   project has point-in-time recovery is unknown from here (decision 12).
2. **`supabase/migrations/0001_idea_certifications_mirror.sql`**, then
   `supabase/migrations/0001_idea_certifications_mirror_rls_test.sql`: 28 rows,
   27 checks and a SUMMARY row reading `27 checks, 0 FAIL`.
   - Then the ONE secret statement in 0001's header, with a secret you generate
     on your own machine (`openssl rand -hex 32`) pasted where it says
     `<PASTE SECRET>`. Do not save it as a snippet. The secret is in no file,
     test or log.
   - Give the IDEA Classroom side three server-only environment variables,
     never `PUBLIC_`-prefixed: `TECHMEN_SUPABASE_URL`,
     `TECHMEN_SUPABASE_ANON_KEY` and `TECHMEN_CERT_SYNC_SECRET` (the same value
     you just hashed).
   - Confirm it is live: `select to_regclass('public.idea_cert_holders'),
     to_regprocedure('public.idea_cert_sync(text, jsonb)');` returns two
     non-null values.
3. **`supabase/migrations/0002_feedback_console.sql`**, then its test: 24 rows.
   This one is safe to paste only while the NEW console is live, and it has
   been since `9543e90`. It maps every report's status in place (`open` to
   `new`, `reviewed` to `seen`, `dismissed` to `wont_do`), and the console
   deployed before that night filtered on `open`.
4. **`supabase/migrations/0003_discord_announcements.sql`**, then its test: 24
   rows. Paste it before deploying the function in step 7.
5. **`supabase/migrations/0004_member_permissions.sql`**, then its test: 34
   rows, 33 checks and a summary reading `33 PASS, 0 FAIL, 0 SKIP of 33 checks`.
   It refuses with a plain message naming the file if `events.sql`,
   `push_notifications.sql`, `event_series.sql`, `domain_roster_gate.sql`,
   `skills_catalog.sql` or `feedback.sql` has not been applied.
6. **`docs/feedback/2026-10-01/MARK_DONE.sql`**, any time after 0002. It
   returns the six reports it moved: five to `done`, one (Discord
   announcements) to `in_progress`. It finds each by route, filed minute in Los
   Angeles and reporter role, raises and changes nothing unless each matches
   exactly one report, and a second paste changes 0 rows.
7. **Deploy the `discord-announce` Edge Function by hand, WITH JWT
   verification**: `npx supabase functions deploy discord-announce`. Never
   pass `--no-verify-jwt`; the function checks `is_admin()` with the caller's
   own token, and it is deliberately absent from `supabase/config.toml`. The
   Dashboard editor also works (one file; leave Verify JWT on). It reads
   `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID`, the calendar poster's secrets;
   function secrets are project-wide, so if the poster runs there is nothing
   new to set (`npx supabase secrets list` shows the names).
8. **Discord setup.**
   - In #announcements, give the bot's role a channel overwrite allowing View
     Channel, Send Messages, Embed Links and Send Polls. #announcements is
     mentors-post-only in `scripts/discord/SERVER_SPEC.md` and the Bot role has
     no column in its matrix, so this is added by hand. #general,
     #event-logistics and #parents need it only if you will post there.
   - Never grant the bot "Mention @everyone, @here, and All Roles" (decision
     35).
   - Fill in the role list on `/announce`: turn on Developer Mode (User
     Settings > Advanced), then Server Settings > Roles, right-click a role,
     Copy Role ID, and paste its exact name and that id. Never type an id from
     memory. A starting set from SERVER_SPEC section 3: Mechanical, Electrical,
     Programming, CAD, Business/Media, Scouting, Drive Team.
   - Write a short test with no roles ticked and press "Check with server". It
     must say "The server built exactly this payload." and "#announcements
     found". Then send, and look for a Sent row with a message id under Recent
     announcements.
9. **Grant the first "Can add calendar events"** on `/roster` (expand a member,
   press the toggle). That member sees "+ New event" on `/schedule` after a
   reload. Their events reach Discord, push, the week-ahead post and the
   calendar feed like any other, and a `build` one opens the shop card
   (decision 32).
10. **Tell staff that hours totals went up.** The My Hours fix made every
    session that crossed 00:00 UTC (5 PM PDT, 4 PM PST) count again. Those
    sessions had been missing from every total on My Hours and on Team Hours'
    By member table, category strip and Goals view. Totals rose on deploy for anyone with evening sessions, and a goal
    can flip to met. The Team Hours Matrix now files evening sessions under
    their own LA day and agrees with By member.
11. **Tell students the one cost of the check-out fix** (decision 28). A fresh
    tag tap still checks out with zero taps. On a phone whose browser reuses
    the same tab for a repeat tap, the page is a revisit, and it shows "Checked
    in since … [Check out]" and waits for one tap.
12. **Repair, by hand, any past sessions the check-out bug cut short.** Run the
    read-only candidate query in `docs/decisions/30-truncated-sessions-repair.md`.
    Fix each confirmed day on `/verify-hours` with a manual check-out or a void,
    both of which require a reason and are audited. Nothing repairs them
    automatically (decision 30).
13. **Unstick `integration`** (next section). This is a person's call, and no
    session force-pushes.
14. **Read the security items delivered privately, and fix them first** (last
    section).
15. **The IDEA Classroom side of the certifications sync is not built.** The
    session that builds it reads `docs/IDEA_CERTIFICATIONS_SYNC.md`; every field
    name there is authoritative.

The SQL files, in apply order:

```
supabase/migrations/0001_idea_certifications_mirror.sql
supabase/migrations/0001_idea_certifications_mirror_rls_test.sql
supabase/migrations/0002_feedback_console.sql
supabase/migrations/0002_feedback_console_rls_test.sql
supabase/migrations/0003_discord_announcements.sql
supabase/migrations/0003_discord_announcements_rls_test.sql
supabase/migrations/0004_member_permissions.sql
supabase/migrations/0004_member_permissions_rls_test.sql
docs/feedback/2026-10-01/MARK_DONE.sql
```

## `integration` has conflicted with `main` since 08:57Z

The prompt's landing rule was `git rebase origin/main` before each push. The
second push therefore went through a rebase that **linearized 103 commits**: the
lane merges were flattened into one line. The content is identical: `9543e90`'s
tree, `040bc7c`, is byte-identical to the merged tree that was gated, checked by
tree hash. But commit shas quoted in the lane reports are not the shas on
`main`; `docs/OVERHAUL_AUDIT.md` maps the three it cites. Later lanes were
cherry-picked or fast-forwarded so it did not happen again.

It had a second consequence nobody saw during the night. The harness branch
`claude/zen-wozniak-n1tf1o` had been pushed four times before the rebase, and
`integrate.yml` had merged its pre-rebase history into `integration` (five
successful Integrate runs, 05:38Z to 07:01Z). After the rebase the same work reached `main`
under different commits, so every Integrate run since has stopped at its first
step with "integration conflicts with main. Resolve it on integration by hand;
nothing was merged, pushed or deleted": eight failed runs, two each at 08:58Z,
10:13Z, 11:09Z and 13:53Z. CI itself passed on every push, on `main` and on the
branch.

Nothing is lost. `integration` sits at `8e535e7`, whose tree is identical to
`cc7ca70`, a commit already on `main`. The clean way out, for a person:

- Delete the remote `integration` branch. The next Integrate run recreates it
  from `main`, which `integrate.yml` does whenever the branch is missing.
- Then delete `claude/zen-wozniak-n1tf1o` (at `e652b01`, identical to `main`)
  and `claude/repo-standards-conformance-uk5er7` (at `af59b66`, merged long
  ago). `integrate.yml` skips a branch that `integration` already contains but
  never deletes it, so both would otherwise stand forever, and a standing
  branch is supposed to be a signal.

`CLAUDE.md`'s solo-mode paragraph now carries the rule this taught: rebase only
commits that have not been pushed anywhere.

## What was built

Each feature has a bullet in `CLAUDE.md`'s subsystem list; this is how each got
there.

**A, the IDEA certifications mirror** (0001, `/certifications`,
`src/ideaCerts.js`, `docs/IDEA_CERTIFICATIONS_SYNC.md`). Mr. Pina decided on
2026-09-30 that certifications are the official IDEA certifications, awarded
only in IDEA Classroom; this app receives a one-way copy. The migration adds
four tables and one writer, `idea_cert_sync(p_secret, p_snapshot)`, which
refuses a wrong secret with one generic error and writes nothing, validates the
whole snapshot before touching a row, and on a bad snapshot logs `ok = false`
and changes nothing (decision 34). Holders are keyed by lowercased email with no
member id (decision 33). The contract doc's worked example was run through the
real function on the harness and accepted. The route and avatar-menu entry
(every role) were wired by the orchestrator.

**B1, the My Hours report** (a student, 2026-09-23, `/my-hours`: the category
totals showed far fewer hours than the recent sessions list). The cause was
`src/hoursUtils.js` at `89896ca`: `buildBreakdown` grouped a member's events by
`event_time.slice(0, 10)`, which is the UTC date, and paired IN with OUT only
inside each group. A session checked in before and out after 00:00 UTC had its
halves in two groups, and neither paired. The session was DROPPED from every
total, not mis-bucketed; the only mis-bucketing was by season, on a season's
last evening. A Saturday-morning session would survive, which fits the
report's "2 hours". The list came from `sessionsFromEvents`, which pairs the whole ledger,
so it showed everything. The fix is one derivation: `buildBreakdown` became
`breakdownFromSessions` over `sessionsFromEvents`, and `src/myHoursModel.js`
derives the page's rows once and every figure from them. The hours-dates lane
then moved every hours surface to the LA date (`laDateKey`): the Team Hours
Matrix (whose private `attendanceHoursByDate` was a copy of the old pairing and
is deleted), the drill-down, Days present, reports, CSVs, Log Hours, Jobs and
the current season. It also paged every unbounded attendance read past the API
row cap through `src/fetchAllRows.js`. Reports and service letters had paired
correctly all along, so before this fix a student's letter disagreed with My
Hours.

**B2, the check-out report** (a student, 2026-09-08, `/dashboard`: "every
single time I try to check out it sent me to the check-in portal"). The cause was
`src/CheckinPage.jsx` at `89896ca`: its init effect toggled on every MOUNT. After
a tag check-in the tab stays on `/checkin?loc=…`, and any re-showing of that
history entry wrote a silent OUT: a back gesture onto it (the success screen's
own VIEW STATUS link puts the dashboard on top of it), a reload, or Chrome iOS
reloading an evicted tab. The student's real check-out tap then found them
already out and showed "Tap to confirm your check-in", the "check-in portal".
This was reproduced in Chromium against the unmodified components: a back
gesture 40 minutes after check-in wrote an OUT, and the check-out tap two hours
later landed on the check-in confirm screen. It is inferred from code and
reproduced, not observed in live data. The fix is `src/attendanceState.js`, one
rule for "checked in" read by every surface, plus a history-entry stamp that
makes a re-shown tag page wait for a tap.

**C, the feedback console** (0002). The bulk copy Mr. Pina could not find
existed, but appeared only after a row was ticked. The console now opens on an
export bar (Markdown for chat, Zip with screenshots), with six status tabs,
route and reporter filters, and bulk moves with an exact undo through two admin
RPCs. The widget's type is optional (Mr. Pina, 2026-09-03), with a "what did
you try" field and a build stamp. `docs/feedback/README.md` and
`.claude/skills/feedback-round/SKILL.md` carry idea-app's round with no idea-app
names. The polish lane hardened 0002 before anything applied it: a non-admin's
insert is now clamped to New, unstamped and created now, by a BEFORE INSERT
trigger whose own self-check refuses a trigger that is missing or of the wrong
kind. `MARK_SEEN.sql` never names a member, and a route's uuids become `:id` in
a withheld export. `docs/feedback/2026-10-01/` holds the first round: TRIAGE.md
for the six open reports and MARK_DONE.sql.

**D, attendance history from `/display`.** The Team Hours drill-down moved into
`src/AttendanceHistory.jsx` over the pure `src/attendanceHistory.js`, so
`/display` reuses it. For a staff viewer a name opens that member's history,
read-only (decision 36). A non-staff board has no buttons at all: the lane
measured 0, against 5 of 5 names as buttons for a mentor on the same data, at
375 and 1440. On the way the lane found and fixed a crash already in
production: HoursBoard used `DEFAULT_CATEGORY` without importing it, so "+ Manual
session" threw and unmounted Team Hours (`c939674`).

**E, Discord announcements** (0003, `/announce`, the `discord-announce` Edge
Function). It is admin-only (decision 35). The role list is a table an admin
fills in by hand, and `allowed_mentions` is pinned to `{ parse: [], roles:
[ticked ids] }`. The function cannot import from `src/`, so it carries a
byte-for-byte copy of the payload builder's marked region, and a drift test
fails on one byte of difference. Not live until steps 4, 7 and 8 above.

**F, member capabilities** (0004). A per-member permission an admin grants and
revokes on `/roster`; the first is `events.create`, Mr. Pina's 2026-09-03 ask
that students be able to add calendar events. It is enforced by three RLS
policies on `events` beside the untouched staff policy. The prompt asked for
enforcement "in any RPC that creates events"; there is none. The polish lane
then required an approved profile for a holder and confined a holder's event to
their own series. Mandatory stays staff-only (decision 32).

**G, the shape language** (`src/plate.js`, `src/plate.css`, `docs/SHAPES.md`).
IDEA Classroom's Plate v3 geometry, every colour from `src/theme.css`, keyed on
one class set from one constant; `APP_PLATE = ''` is the revert, measured as 196
of 196 screenshots byte-identical to the pre-plate base. Four visual reviews
followed and their defects were fixed. The final independent confirmation agent
failed on a session usage limit. The orchestrator did a sampled look instead:
student `/dashboard`, `/my-hours`, `/schedule` and `/checkin` at 342x673, 375
and 1440; admin `/feedback`, `/hours`, `/roster`, `/certifications` and
`/announce` at 375 and 1440; and `/dashboard` with the plate off at 342x673.
Nothing was broken. One observation: at 342px the 44px floor makes the nav pads
wrap to three rows (two without the plate), and Check Out stays in the first
screen, about 333px down against 287px with the plate off.

**H, the overhaul audit** (`docs/OVERHAUL_AUDIT.md`, 85 ranked items across
eight dimensions; `docs/decisions/04` to `41`). Every critical and high finding
went to a second agent that tried to refute it; none was refuted. The trivial
fixes the prompt allowed went out in `7cdf3e3`:
- error boundaries that keep the nav and the report button, and a reload-once
  on a stale chunk;
- reports and letters that refuse to render from a failed read;
- failed reads that stop reading as empty or saved;
- accessible check-in results;
- http(s)-only job links;
- nav menu, label and confirm fixes.

**Infrastructure** that every lane used and that stays: fixture mode
(`src/dev/fixture/`, `npm run dev:fixture`), `npm run test:checkin`,
`npm run test:features`, `tools/e2e/shoot.mjs`, `src/schemaMissing.js` (the
first push, inert until imported) and `src/claimApproval.js`. That last file
exists because a failed `claim_profile` call used to show approved students the
access form, even on an NFC tap; it is pinned by `test:checkin` R8 to R10.

**Orchestrator calls.**
- Lanes ran in four parallel workflows, two lanes at a time in each, on four
  CPUs. Each lane had its own git worktree under `.wt/`, its own database and
  its own dev-server port.
- `App.jsx` and `NavBar.jsx` were wired by the orchestrator, including the admin
  feedback badge counting `new` and `open` so it reads right on both sides of
  0002.
- `src/seasons.js`, `src/LogHoursPage.jsx` and `src/JobsPage.jsx` were moved to
  the LA date. After 5 PM PDT the UTC date is tomorrow: Log Hours defaulted to
  tomorrow, a job due today read overdue, and the season turned over at 4 PM
  PST on its last day.
- No migration above 0004 was written.

## What was measured

- **The gate on every push** (in a clean worktree), read by summary lines:
  - `89896ca`: build, 116 tests.
  - `9543e90`: build, vitest 597/597, `ds:audit` ok, `discord:calendar:test`
    19/19, `history:verify` OK, `test:checkin` 48/48, `test:features` 953/953.
  - `e24d63d`: vitest 629/629, all five CI checks, `test:checkin` 51/51,
    `test:features` 957/957.
  - `7cdf3e3`: vitest 640/640, the same checks, 51/51 and 957/957.
  - `e652b01`: vitest 640/640, `ds:audit` ok, discord 19/19, history OK, build
    ok with 0 fixture markers in `dist`, `test:checkin` 51/51 with the plate on,
    and `test:features` 957/957. It read 956/957 before the permissions spec
    learned that the plate's 44px floor deliberately enlarges the desktop
    Edit/Delete.
  - CI passed on every push.
- **SQL**, on a throwaway Postgres 16 harness that is not in the repo. It holds
  Supabase stand-ins (the three roles, `auth.uid()`/`auth.email()`, the default
  privileges, stub `pg_net`/`pg_cron`), all 57 frozen files plus
  `platform_migration.sql`, and fictional members. The three existing
  `_rls_test.sql` files pass against it, which is the evidence it is faithful.
  Each lane applied its migration twice and ran its test twice. Each lane also
  mutated a policy in the PERMISSIVE direction and watched the test turn red,
  restoring from a hashed copy:
  - 0001: three mutants, 2, 1 and 5 FAIL rows.
  - 0002: three mutants caught, one of them refused at apply by the file's own
    self-check.
  - 0003: two mutants.
  - 0004: two mutants.
  - Re-run for this entry on a fresh copy, `core_counts`, all four applied in
    order: 0001 27/27 plus SUMMARY, 0002 24/24, 0003 24/24, 0004 33/33 plus
    summary.
  - MARK_DONE.sql was proven on seeded pre-0002 rows:
    - six rows moved, four decoys untouched;
    - a second paste moved 0;
    - an ambiguous target and a missing target each raised and changed
      nothing;
    - the same paste before 0002 failed on the status check and changed
      nothing.
- **Browser, all on fixture mode in the container's Chromium 141:**
  - Check-in: 51 steps. Its mutation proofs are in `tools/e2e/README.md`; the
    pre-fix tag pages fail R1, R2, R3, R7, V2 and V3 by checking the member out
    with no tap.
  - Features: 957 checks. Four owned modules were mutated one at a time in the
    permissive direction, and each turned its spec red.
  - Hours day rule: 304/304, against 144/304 on the base. That harness was a
    lane's scratch file and is not committed, so this number cannot be re-run.
  - Shape language: 0 of 708 student targets under 44px with the plate on, and
    0 of 6,473 `/_ds` computed styles changed.

## What was NOT verified

- **The live project, at all.** No migration was applied anywhere real. No RLS
  test ran against the real database. The six live reports were never seen;
  MARK_DONE.sql was proven on a harness copy. Some live objects may differ from
  the harness, because three frozen objects depend on the order the files were
  applied (`events_kind_check` and `training`, `app_settings.updated_at`,
  `admin_get_members().nickname`; decision 26).
- **WebKit and iOS.** Only Chromium is here, and no NFC hardware. Unknown on an
  iPhone:
  - whether a background tag opens Safari or Chrome;
  - whether a repeat tap opens a new tab or reuses one;
  - whether WebKit keeps `history.state` when it reloads an evicted tab;
  - the zoom on small inputs, and the status bar (decision 22).

  PostgREST's timestamp form was parsed under Bun's JavaScriptCore, which
  matches V8.
- **A real phone**, a truly backgrounded tab (headless Chromium cannot hide one,
  so `test:checkin` shadows `document.visibilityState`), and the back/forward
  cache restore.
- **Discord.** No real Discord call was made.
- **Deno.** It is not installed, so the Edge Function ran only under Node 22
  with fakes. Supabase's gateway behaviour for 0001 (a refusal's HTTP status,
  the refusal row committing) was not exercised either: the harness has no
  PostgREST.
- **Fixture mode's blind spots**: write-side RLS, triggers, views, non-enum
  CHECKs.
- **Vercel.** Only the build stamp in the live bundle was read.

## Claims that were wrong

From the prompt and the lane briefs written from it, checked against the tree:

- "No `claude/**` branch is standing": false. `claude/repo-standards-conformance-uk5er7`
  stood at `af59b66`, fully merged; it was left alone. The rest of the
  preflight held: `main` was `afc0435`, last moved 2026-09-02, and no earlier
  session had taken workstream A, so the ledger entry is 0002 and migrations
  start at 0001.
- B1's starting points, `src/hoursResolve.js` and `src/categories.js`: neither
  is involved. `hoursResolve.js` is the staff anomaly helper, and the student's
  "service hours" are the Volunteer row. "Dropped or mis-bucketed": dropped.
  The brief's other candidates (the volunteer auto-switch, capping, manual
  entries, row limits, ordering) are not this report's cause.
- B2, "iOS Chrome specifically if the cause is browser-dependent": it is not.
  The brief's other candidate is also not the cause: nothing in the repo
  rejects the dashboard's check-out row. There is no CHECK on `location`, and a
  NULL passes the `method` CHECK.
- C: the console's existing admin check is inside `FeedbackPage`, not in
  `App.jsx` as `CLAUDE.md` said. "In the shape of `feedback_rls_test.sql` …
  returns rows naming each check": that file returns one row with a column per
  case. The new tests return one row per check, as asked.
- D, "it may be a shared screen": `/display` has no role gate at all. Every
  signed-in member can open it, and the student dashboard links to it.
- E: Discord's developer docs now redirect to `docs.discord.com`. Send Polls is
  defined on the permissions page and is not listed on Create Message; it is in
  the setup either way.
- F, "in any RPC that creates events": no such RPC exists. A series is one
  client-side bulk insert.
- The frozen set the prompt points at: the migrations README says
  `supabase/*.sql` holds 57 files, and `CLAUDE.md` said 58 SQL files in all.
  There are 56 there, plus `sql/forgotten_checkout.sql`, plus two root files
  nobody had named.
- The rebase rule produced the `integration` conflict above.

`CLAUDE.md` claims found false, and corrected in the closing commits:
- the SQL counts;
- the `/checkin` category picker, which does not exist;
- `/display` as a staff-only screen;
- the Agenda/Month/Week views and the Agenda default;
- `GlanceCard.jsx` imported by `HomePage`;
- `attendanceHoursByDate`;
- the feedback widget's required category and "no commit-sha telemetry";
- the CI bullet describing the retired workflow;
- the member application bullet's "8-value subteam taxonomy" (the CHECK has 12
  values) and "both acknowledgments unstorable-as-false" (the build-season
  CHECK was dropped), the two rows of audit item 24's table the first closing
  commit missed, corrected by the closing review;
- two older contradictions inside `CLAUDE.md`, also corrected by the closing
  review: the Discord calendar suite given as both 19 and 13 tests (it is 19),
  and the parent-dashboard bullet counting two pending-request kinds where the
  NavBar counts three.

Found and NOT corrected here, because each needs its own decision or files this
session did not own:
- No SQL file creates `profiles.geofence_exempt` or the Offseason 2026 and
  Biocore 2027 season rows (decision 26).
- `supabase/migrations/README.md` still says that directory is empty of SQL.

## Decision defaults this session ran under

`docs/decisions/` holds 38 new files, `04` to `41`: the audit's 24 drafts and
the night's lane defaults. Status:
- **05** is decided: solo mode, Mr. Pina's rule since 2026-09-27, as the prompt
  recorded it.
- **Defaults the tree now implements**: 04, 06 (app side only), 13, 21, 23,
  28, 29, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40 and 41.
  - 04: security items as stubs in the public repo.
  - 06: presence and member counts take approved members only; no database
    change.
  - 13: a letter counts a capped session at 10 hours and leaves out staff
    adjustments.
  - 21: Agenda under 640px.
  - 23: the 44px floor on student controls only.
  - 28: a re-shown check-in page costs one tap.
  - 29: 10 hours past LA midnight.
  - 31: `reviewed` becomes Seen.
  - 32: a student's event is an ordinary event; mandatory stays staff-only.
  - 33: the mirror knows a student by email only.
  - 34: refusals are logged; a wrong secret writes nothing.
  - 35: admins announce, and the bot never gets mass mention.
  - 36: `/display` history is read-only.
  - 37: This Week counts only counted sessions.
  - 38: no Service subtotal.
  - 39: the LA date everywhere.
  - 40: a failed read never downgrades; unknown roles fail the application gate
    open.
  - 41: the dashboard's Check Out keeps its gold fill.
- **Every other decision's default is "unchanged, nothing built"**: 07 to 12,
  14 to 20, 22 and 24 to 27.
- **30**: no automatic repair.

## Deliberately not done

- No frozen file was touched. None of the 155 files changed between `afc0435`
  and `e652b01` is under `supabase/*.sql`, `sql/` or `src/lib/design-system/`,
  is a root `platform_*.sql`, or is one of the five old skills files.
- 0005 is unused.
- `src/StudyPage.jsx` still takes "today" as the UTC date. It may have to match
  a server-side `current_date`, which could not be checked from here. The
  Applications CSV filename also uses the UTC date.
- `src/HomePage.jsx`'s own attendance read is unpaged on purpose. It reads
  newest first, so today's rows and Check Out are always in its first page,
  and paging would add a round trip before that tile renders. Only an all-time
  Season figure past about 1000 events would be short.
- No `npm run gate` script; the solo-mode gate is seven commands run by hand.
- Two low findings from the last review are open:
  - At 375 a My Hours flag button's hit area reaches 1.25 to 3.75px into the
    neighbouring row. A tap there opens the wrong session's flag dialog, and
    nothing is written.
  - `App.jsx` holds `onboarded_at` without a per-member key. This is reachable
    only by an in-page sign-in as another member with no sign-out between.

## Security

The repository is public, so security weaknesses that are still open appear
here as stubs only. The audit's items 1, 2, 3, 6, 7, 8, 14, 15, 16, 50, 51 and
52, and part (c) of item 72, are committed in `docs/OVERHAUL_AUDIT.md` with a
number, a neutral title, a severity, a size and the kind of fix, and nothing
else (decision 04). Their full text went to Mr. Pina privately, outside this
repository, together with three lane findings that are not in the audit.

None of these was fixed that night. The prompt allowed only trivial defects in
files the session had already touched, and every one of these needs SQL. **They
are the first work for the next session.** The cheapest high-value fix is one
small numbered migration, 0005 being the next free number, covering items 1, 3
and 7; item 2 follows it (decision 06).
