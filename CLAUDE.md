# CLAUDE.md - Techmen Team Platform

Operating rules for working in this repository. Everything here changes how a task is done, whatever the task is. This file is read automatically by Claude Code on startup, so per-task prompts can stay lean. Keep it current (see Self-Maintenance at the bottom).

**The per-bundle historical record lives in [`docs/history/`](docs/history/), ONE FILE PER ENTRY.** Until 2026-09-02 it lived on a single 109,839-character line of this file — the "Last reviewed:" paragraph — which every session rewrote, so two sessions working in parallel always collided on it and nobody could find anything in it. It is now one file per bundle, byte for byte, and `npm run history:verify` proves the split lossless on every CI run. Read it when diagnosing something in a subsystem with history, or when you need the REASON a rule below exists before changing it. **`grep -r` over that directory is how you find an entry**; every file's front matter carries its date, branch, commits, SQL files and subsystem as plain text. `npm run history:index` prints the indexes, which are GENERATED and never committed. Do not read the directory end to end.

Two more directories carry things this file used to swallow:

- **[`docs/decisions/`](docs/decisions/)** — open questions that need Mr. Pina, each with a stated default so a session proceeds rather than blocking.
- **[`docs/prompt-ledger/`](docs/prompt-ledger/)** — every Claude Code prompt recorded when it is ISSUED, so a chat can tell whether work is already in flight before writing a rival prompt for it.

---

## What this repo is

The internal team platform for FRC Team 5669 "Techmen" (Don Bosco Technical Institute). A PWA that is the single hub for everything the team runs on: attendance, hours, member profiles, skills/certifications, and a growing set of feature modules. Attendance was the first module, not the point of the app. The long-term vision is one connected platform for the whole team.

- **Stack:** Vite + React + Supabase + Vercel
- **Live:** frc-app-liard.vercel.app
- **Repo:** https://github.com/FRC-Team-5669-Techmen/frc-app

### Branding

Techmen. "Tactical HUD" theme — near-black base, gold targeting accent, silver/steel chrome. Display/UI face is Chakra Petch; all data/readout lines (timestamps, codes, counts, status) use Share Tech Mono. Both fonts are self-hosted via @fontsource (no Google Fonts CDN). Team logo + "TECHMEN·5669" wordmark in the header, not "5669" or "FRC App". Student-facing name is always Techmen.

Light theme (0019): gold `background` uses `--gold-fill*`, never `--gold`. Theme tokens, the gold rules and role colors: [`docs/subsystems/branding-and-theme.md`](docs/subsystems/branding-and-theme.md).

### Tech stack

- Vite + React. PWA via vite-plugin-pwa in **`injectManifest`** mode — custom service worker at `src/sw.js` (precache + autoUpdate + web push). Not `generateSW`.
- Fonts: Chakra Petch + Share Tech Mono, bundled offline via @fontsource (woff2 precached by the service worker). No runtime font CDN. (The one exception is the deck design system under `src/lib/design-system/`, which loads Space Grotesk / Space Mono / Roboto from Google Fonts by spec; nothing in the app shell uses it.)
- Supabase: Postgres + auth + RLS. This is live team data.
- Deployed on Vercel, auto-deploys on push.
- Auth: email OTP (6-digit code) and Google OAuth via an Internal consent screen scoped to boscotech.edu. Every student has a school Google account.

### The subsystems

One file per subsystem under [`docs/subsystems/`](docs/subsystems/), moved there verbatim on 2026-10-19. **Read a subsystem's file before changing that subsystem.** Many carry rules, not just descriptions.

- **Design system**: [`docs/subsystems/design-system.md`](docs/subsystems/design-system.md)
- **Weekly survey**: [`docs/subsystems/weekly-survey.md`](docs/subsystems/weekly-survey.md)
- **CI workflows**: [`docs/subsystems/ci-workflows.md`](docs/subsystems/ci-workflows.md)
- **Feedback**: the in-app widget, the admin inbox, the feedback console, answers to the sender (0024). [`docs/subsystems/feedback.md`](docs/subsystems/feedback.md)
- **Push notifications**: [`docs/subsystems/push-notifications.md`](docs/subsystems/push-notifications.md)
- **Jobs**: [`docs/subsystems/jobs.md`](docs/subsystems/jobs.md)
- **PWA and login**: install, OTP and Google OAuth, the login screen. [`docs/subsystems/pwa-and-login.md`](docs/subsystems/pwa-and-login.md)
- **Check-in**: NFC fast path, geofence, iOS, kiosk (removed), auto-checkout, the one checked-in rule, sign-out requests and meeting check-in (0014, `/signouts`). [`docs/subsystems/checkin.md`](docs/subsystems/checkin.md)
- **Presence board**: `/display`, its attendance history, and quick pulse (staff sign a member in or out). [`docs/subsystems/presence-board.md`](docs/subsystems/presence-board.md)
- **Landing page and nav**: the top bar, the account menu, `/robot`, Team admin `/manage`, Home's Do this now (decision 49), `/updates` (0019). [`docs/subsystems/landing-and-nav.md`](docs/subsystems/landing-and-nav.md)
- **Hours**: My Hours, Team Hours, categories, seasons, the LA day rule. [`docs/subsystems/hours.md`](docs/subsystems/hours.md)
- **Session integrity**: [`docs/subsystems/session-integrity.md`](docs/subsystems/session-integrity.md)
- **Admin hours management**: [`docs/subsystems/admin-hours.md`](docs/subsystems/admin-hours.md)
- **Member application**: [`docs/subsystems/member-application.md`](docs/subsystems/member-application.md)
- **Parent response**: [`docs/subsystems/parent-response.md`](docs/subsystems/parent-response.md)
- **Accountability and eligibility**: [`docs/subsystems/accountability.md`](docs/subsystems/accountability.md)
- **Reporting and export**: [`docs/subsystems/reporting.md`](docs/subsystems/reporting.md)
- **Subteams**: [`docs/subsystems/subteams.md`](docs/subsystems/subteams.md)
- **Profile**: [`docs/subsystems/profile.md`](docs/subsystems/profile.md)
- **Roster, access and capabilities**: admin roster, access requests, the `parent` role, staff invites, member capabilities, `claimApproval.js`, merge (0020). [`docs/subsystems/roster-and-access.md`](docs/subsystems/roster-and-access.md)
- **Scheduling**: events and RSVPs. [`docs/subsystems/scheduling.md`](docs/subsystems/scheduling.md)
- **Parent dashboard**: [`docs/subsystems/parent-dashboard.md`](docs/subsystems/parent-dashboard.md)
- **Certifications**: the retired skills system and the IDEA certifications mirror. [`docs/subsystems/certifications.md`](docs/subsystems/certifications.md)
- **Discord**: server provisioning, calendar posting, the `verify_jwt` pin, the two renderers, the week-ahead post, announcements. [`docs/subsystems/discord.md`](docs/subsystems/discord.md)
- **Fixture mode**: fixture mode, the browser E2Es, `src/schemaMissing.js`. [`docs/subsystems/fixture-mode.md`](docs/subsystems/fixture-mode.md)
- **Shape language**: [`docs/subsystems/shape-language.md`](docs/subsystems/shape-language.md)
- **Event family hub**: [`docs/subsystems/event-family-hub.md`](docs/subsystems/event-family-hub.md)
- **Member handbook**: [`docs/subsystems/handbook.md`](docs/subsystems/handbook.md)
- **Member standing**: absences, break weeks, the weekly and monthly checks, probation and removal, grades, discipline, safety, incidents, voids, FLL mentors, notices (0015). [`docs/subsystems/standing.md`](docs/subsystems/standing.md)
- **Event rosters**: roles, eligibility, event-day attendance, conflicts, the family sign-up rule, the carpool lock (0016), the role board with per slot assigned/backup/asked and no blocking (0028, 0031). [`docs/subsystems/rosters.md`](docs/subsystems/rosters.md)
- **Families and records**: the family link, emergency information, driver documents, the no-photo list, sub-team status, the leaderboard, the onboarding checklist and shop gate, training, handbook versions, letter progress (0017). [`docs/subsystems/families-and-records.md`](docs/subsystems/families-and-records.md)
- **Scouting**: event observations with REBUILT match fields (0027), offline queue, shift planning by match number with redundant pairs and super scouts (0030), pit conversations, pick lists, practice (also with no event) and the spreadsheet export. [`docs/subsystems/scouting.md`](docs/subsystems/scouting.md).
- **Battery log**: `/batteries`, the pit battery board, runs and charge state (0026). [`docs/subsystems/batteries.md`](docs/subsystems/batteries.md)
- **Driver leaderboard**: `/drivers`, drive time, MoSim, coach ratings, one Driver Score per season in `src/driverScore.js` (0029). [`docs/subsystems/drivers.md`](docs/subsystems/drivers.md)
- **Human player leaderboard**: `/human-player`, accuracy, rate and match-run drills counted live, one Human Player Score per season in `src/humanPlayerScore.js` (0033). [`docs/subsystems/human-player.md`](docs/subsystems/human-player.md)
- **Connector**: Claude acting as the admin through `/mcp` (0018); every write via `src/writeVia.js` (0019). [`docs/subsystems/connector.md`](docs/subsystems/connector.md)

### Roadmap (planned modules)

- Field validation of the new scouting system on real iPhone and Android devices.
- Calculators and reference tables for robot design.
- Automated FRC learning environment so students can build skills and take on more responsibility during the season. Offseason priority.
- Job and task list with assignment to members.

This list will grow. When building a new module, confirm the members table and roles already carry it before adding new foundation.

## Commands

```bash
npm run dev                          # dev server
npm run build                        # the build, and this repo's only type gate (see below)
npm test                             # the vitest suite in tests/
npm run test:watch                   # the same, watching
npm run ds:audit                     # the design system's 30 static checks
npm run discord:calendar:test        # the Discord calendar engine's 19-case suite
npm run history:verify               # docs/history/ is still a lossless split
npm run history:index                # print the history indexes (never committed)
npm run verify:browser               # the visual pass: real Chromium against /_ds
npm run verify:browser -- --selftest # 36 negative controls for the checks themselves
npm run verify:browser -- --probe    # what this machine's browser can actually do
```

Local-only, deliberately not in CI:

```bash
npm run ds:audit:controls            # breaks each ds:audit check in turn; REFUSES a dirty tree
npm run ds:dev                       # boot the /_ds specimen at :5175 (vite --mode dsspec)
npm run ds:capture                   # render every sheet pattern to PNG
npm run discord:plan | :apply | :offline   # Discord server provisioning
npm run dev:fixture                  # the real app on an in-memory fake Supabase at :5401 (src/dev/fixture/README.md)
npm run test:checkin                 # check-in/check-out E2E on fixture mode, 375 and 1440 (part of the solo-mode gate)
npm run test:features                # the nine feature specs on fixture mode, 375 and 1440 (part of the solo-mode gate)
node tools/sql-harness/run.mjs       # PostgreSQL 16 + Supabase stand-ins + every SQL file; runs the _rls_test files (tools/sql-harness/README.md)
node tools/e2e/shoot.mjs --persona student --routes all --widths 375 --out artifacts/shots/x   # screenshot any route
node tools/e2e/gen-fixture-schema.mjs --host /tmp --port 54330 --db <db>   # regenerate src/dev/fixture/schema.js
node tools/e2e/plate/<tool>.mjs      # the shape-language harness: shots, compare, measure, identity, keyed (docs/SHAPES.md)
python3 /tmp/status.py --repo FRC-Team-5669-Techmen/frc-app   # read-only status, see below
```

What `test:checkin` and `test:features` print, why `ds:capture` fails in this container, and the fetched status tool: [`docs/subsystems/tooling.md`](docs/subsystems/tooling.md).

**There is no type check and no linter in this repo.** No `tsconfig.json`, no ESLint config, plain `.jsx` throughout. **`npm run build` is the type gate**, in the only sense one exists here: it fails on a syntax error, an unresolved import, or a module that throws at load. A `.d.ts` sweep does run, but only over the design system's own declaration files and only inside `ds:audit`. Do not report "typecheck passed" — say the build passed.

## Architecture (locked decisions)

- **Central members table is the hub.** Everything keys off the member ID: attendance, hours, profile, skills, and every future module. Never break this. New tables reference member ID.
- **One app, code-split routes.** Each feature is a lazy-loaded bundle that only downloads when opened. This keeps check-in fast no matter how many modules exist.
- **Check-in is the fast path.** The NFC tag deep-links straight to a deliberately minimal check-in route. Keep it light. Do not pull the dashboard, nav, or other modules into that route.
- **Public site stays separate** from team data. No login, different audience, different security.
- **Read and write RLS differ.** Students write only their own attendance; all members can read the team hours board. Respect this split when adding policies.
- **Parent vs staff role resolution.** `is_staff()` is mentor/lead/admin only — `parent` is never staff. A parent who ALSO holds a staff role is treated as staff and sees the mentor view. Any parent-specific UI must gate on `(hasRole('parent') && !isStaff)`, never on `hasRole('parent')` alone.

## Database, and how SQL actually reaches it

**By hand, in the Supabase SQL editor, until the `SUPABASE_MIGRATE_DB_URL` repository secret is set; after that, by `.github/workflows/migrate.yml`.** On a push to `main` touching `supabase/migrations/`, it applies every numbered migration not recorded in `supabase_migrations.schema_migrations`, in order, one transaction each, stopping at the first failure; 0001 to 0026 are seeded as hand-applied (`tools/apply-migration.mjs`, [`docs/subsystems/database.md`](docs/subsystems/database.md)).

- No `supabase db push` anywhere, and `ci.yml` reads no credential. Without the secret, nothing records what ran, and a file pasted by hand is never recorded (the one-row insert in the migrations README fixes that).
- So **a file existing on `main` says nothing about the database having it.** The only proof a migration is live is querying the live project for the objects it creates — the table, the index by name, the constraint by name, the function in `pg_proc` — and reporting what was found. Not that a file exists. Not that a report said "applied".
- **Which SQL files exist** (the frozen unnumbered ones, the numbered migrations, which have an `_rls_test.sql` sibling): [`docs/subsystems/database.md`](docs/subsystems/database.md).
- **From 2026-09-02 forward, a new SQL file is a numbered migration under [`supabase/migrations/`](supabase/migrations/), with its test beside it.** Read that directory's README before writing one: it carries the numbering rule, the frozen-foundation rule (nothing under `supabase/*.sql` or `sql/` is ever renumbered or moved), and the conventions learned from files that had to be pasted twice.
- **Take the next migration number by reading that directory, and record it in your prompt-ledger entry before starting.** Two parallel sessions will otherwise both read the same highest number and both pick the next one.
- **Edge Functions deploy separately, by hand.** `supabase/config.toml` pins `verify_jwt = false` for the six that are invoked by pg_cron or by capability URL. `discord-calendar` is the one function that is not single-file and so cannot be deployed from the Dashboard editor.

### The traps that make a wrong migration silent

- **A missing policy fails at 0 rows, not with an error.** The project's bootstrap `ALTER DEFAULT PRIVILEGES` grants `authenticated` everything on a new public table, so where an operation must be impossible, `revoke` it explicitly. Discovered on `feedback.sql`, where a delete block was silent until the revoke was added.
- **A column revoke is a no-op while a table-level grant exists.** Effective column privileges are the UNION of the column ACL and the table ACL. Hiding a column means dropping the table-level grant and re-granting every other column individually — `parent_responses.sql` does this for `parent_token` and explains it. `calendar_token.sql` uses the naive form and is flagged as probably not blocking anything.
- **An UPDATE has to FIND its rows, and row lookup goes through the SELECT policy.** So a test that thinks it is checking UPDATE is often checking SELECT again, and a wide-open UPDATE policy can pass a naive test. This cost a real miss on `feedback_rls_test.sql`: seven negative controls were run and the first version caught only six.
- **`ON DELETE CASCADE` is not blocked by a revoke.** Measured against a real PostgreSQL 16: a cascade runs as the referencing table's owner with row security not forced, so the caller's grants and RLS are not consulted for the rows it removes. Do not "fix" a working cascade by granting delete on the child tables — that hands every member a direct delete on other people's rows.
- **SQL dollar-quoting**: use named tags like `$fn$ … $fn$` for function bodies, never bare `$$`. Bare dollar signs break on paste.
- **`profiles` has no `email` column.** Email lives on `auth.users`; `admin_get_members()` joins it via SECURITY DEFINER. A client `from('profiles').select('…, email, …')` errors and — because callers ignore the error and `?? []` — silently yields an empty list. That is what had blanked the skill-coverage matrix. Use `full_name`/`nickname` for display, or the admin RPC for email.

## Verification standard

This applies to every change. Prompts do not need to restate it.

**Always:**

- **`npm run build` is green**, and so are `npm test`, `npm run ds:audit`, `npm run discord:calendar:test` and `npm run history:verify`. Those five are what CI runs. A session reports the numbers, not the adjective.
- **State plainly what was NOT verified, and why.** Local test commands use disposable data and never establish live deployment or RLS. A configured connector can inspect the live catalog read-only; report exactly which objects were found. A live write, migration, integration send or deployment still requires the task’s authorization. Do not infer signed-in production behavior from catalog access. **"Not verified" is a result; silence is not.**
- **A measurement that cannot be repeated is a claim about the past.** For months every bundle here wrote a headless Chromium harness, drove the real components against a stubbed `./supabase`, reported numbers, and then DELETED the harness. Those numbers are in `docs/history/` — 78/78, 54 checks, 62/62, 44/44 — and not one can be re-run. **Do not do this again.** A harness worth writing is worth keeping: add a route spec under `tools/browser-verify/routes/`, a fixture-mode spec under `tools/e2e/features/`, or a test under `tests/`.
- **Every test and every check needs a positive control.** An assertion that something is absent, empty, refused or zero is satisfied by a module that has stopped working entirely. Drive the same fixture the other way round in the same file. This is not a style preference: `tests/anomaly-pairing.test.js` mutates the shipped pairing function in memory and requires three ledgers to break, because without that every assertion in it would pass against a function returning an empty set.
- **Assert both directions of any visibility or gating claim.** Name what must be PRESENT alongside what must be ABSENT, and report both counts. "The parent view has no staff controls" is not a result; "0 of 3 staff links, against 3 on the same fixture with `isStaff` true" is.

**The instruments, what each can and cannot see, and what fixture mode can and cannot see:** [`docs/subsystems/tooling.md`](docs/subsystems/tooling.md).

**`ds:audit` and the design standards' pre-delivery checks number INDEPENDENTLY and must never be cross-referenced by number.** Always name which: "pre-delivery check 43", "`ds:audit` check 16". Both run, because source cannot see what a deck added and a deck cannot see whether the rule it relied on ships.

**Mutation proof is required where a wrong result is invisible in normal use** — RLS boundaries, exclusion filters, data-visibility rules, any assertion that a row does NOT appear. Mutate in the PERMISSIVE direction: a policy commented out entirely fails closed and reddens almost nothing, while `using (true)` reproduces the real leak. **Restore from a copy you made, never with `git checkout --`** — that restores from HEAD and silently discards the session's own uncommitted work, after which the remaining mutants test a tree that no longer has the change in it and all pass. **The tell is a mutation suite that suddenly all passes.**

## Working conventions

1. **Surgical edits only.** Edit the smallest unique chunk with a targeted replace. Never rewrite a whole file when a targeted edit works. Never re-output a full file after editing.
2. **Schema and UI ship together.** When a feature needs a column or table, put the SQL and the UI change in the same task so they never drift. Column-mismatch bugs come from shipping one without the other.
3. **Run the SQL in Supabase before testing.** A feature that reads a new column throws "column does not exist" until it is applied. Apply it first, by hand, in the SQL editor.
4. **Supabase holds live team data.** Never run destructive schema or data operations without explicit confirmation. Treat migrations and table changes as high-risk and propose first.
5. **Do not commit secrets.** The Supabase URL and anon key live in env vars and Vercel settings; the service role key never appears in client code. `.env.dsspec` is TRACKED and is the exception that proves the rule: it holds placeholders pointing at a port nothing listens on, so `/_ds` boots from a clean checkout.
6. **Commit and push in the same task.** Do not leave changes unstaged. Push success is the confirmation signal.
7. **Do not duplicate a rule.** A second implementation of a check, a formatter, or a piece of arithmetic is the thing that quietly stops matching. When two places need one behaviour, extract it — `src/hoursResolve.js` and `src/categories.js` exist for exactly this. Where a duplicate is unavoidable, say so at both copies and gate both in CI.
8. **A session that creates SQL files lists their full repo paths at the end of its response**, one line per file, in apply order. They are pasted into the SQL editor immediately, so the path belongs where it is about to be used. A session that created none says nothing.
9. **Bundle multiple changes into one task** rather than one item per task, and build in milestones.
10. **The system is in active pilot.** Favor changes safe to ship to live users, and flag anything that could disrupt an in-progress check-in session.

### Branches, and what happens to them

**Scouting review exception (explicit user instruction):** continue `codex/scouting-2026-evidence` and draft PR #4, preserving newer remote changes. Do not apply the solo-mode main-push rule to this scouting run. Main pushes, production deployment/database changes and real Discord sends require separate explicit release authorization. Read `docs/scouting/RESUME.md` and `RELEASE.md` before continuing; routine review-branch implementation, tests and checkpoint pushes are already authorized.

**A session working alone (solo mode) commits and pushes straight to `main`** — Mr. Pina's rule since 2026-09-27, recorded in [`docs/decisions/05-solo-mode-on-frc-app.md`](docs/decisions/05-solo-mode-on-frc-app.md) — and only after the local gate passes on the exact tree being pushed: `npm run build`, `npm test`, `npm run ds:audit`, `npm run discord:calendar:test`, `npm run history:verify`, `npm run test:checkin` and `npm run test:features`, each read by its summary line, because a runner can exit 0 with a failure. In this mode CI reports after the fact rather than gating: every push to `main` deploys the PWA to students who may be mid-check-in, and on 2026-10-01 production went live 14 seconds before CI finished. SQL still reaches the database only by hand, so code that reads a migration not yet applied must detect it through `src/schemaMissing.js` and degrade to a plain "not set up yet" state, never fail. If `main` moved, rebase onto it and run the whole gate again before pushing, and rebase only commits that have not been pushed anywhere: `integrate.yml` may already have merged them into `integration`, and their rewritten copies then conflict with it (after the rebase of 2026-10-01 every Integrate run failed that way). **Parallel work — two or more sessions at once — keeps the branch path below** (a `claude/**` branch, `integrate.yml` collecting it into `integration`, `deploy.yml` moving `main`), because two sessions cannot both gate `main`.

- **In parallel mode, work on the `claude/**` branch the harness minted for the session. Push it. Do not merge to `main`.**
- **A finished `claude/**` branch vanishing on its own is CORRECT, not a mistake.** `.github/workflows/integrate.yml` merges any `claude/**` branch into the long-lived `integration` branch the moment CI goes green on its tip, and deletes it. The commits are on `integration`; nothing is lost.
- **`main` moves only when a person moves it, or when a solo session pushes it after its local gate.** No workflow in this repo pushes to `main` except `deploy.yml`, which requires a typed confirmation. Every push to `main` deploys the PWA to students who may be mid-check-in, and this repo's SQL is applied by hand with nothing recording what has been applied — so a machine merging on green CI would ship code calling a table the database does not have.
- **A `claude/**` branch still standing after a session ends is a SIGNAL, not a leftover**: its CI failed, its CI has not finished, or its merge into `integration` conflicted. Name it in the report.
- **Never force-push.** Not `--force`, not `-f`, not `--force-with-lease`.
- **If a session ends with a branch still open, report the branch name and what is unfinished on it.** An unmerged branch is invisible work.

### How tasks come in

Default: tasks are described by intent and constraints. You own the implementation. Read the repo, find the right place, and write the code yourself. That is the normal mode.

Exact content is provided only in two cases:

- A file or snippet was drafted in chat and must land verbatim. Use it as given.
- A change is precise enough that an exact locator prevents the wrong edit. These arrive as CURRENT / REPLACE blocks: read the actual file first, apply even if the anchor text differs slightly, and report any miss instead of guessing.

Either way, read the repo file yourself rather than requiring a full-file paste to resync.

**Every claim in a prompt about the current state of the repo is a claim, not a fact.** Confirm each against the tree before building on it. Where the tree disagrees, the tree wins and the report says which claims were wrong.

## Known traps

- **PWA cache.** The service worker serves stale copies after a deploy. Test in an incognito window to see the true current version. A "missing build" is almost always cache, and it is the first thing to check rather than the last.
- **Web NFC is Chrome/Android only.** Keep that constraint in mind for any check-in change.
- **The check-in fast paths are outside `ProtectedLayout`** and must stay light. `/checkin` and `/checkin-volunteer` deliberately import none of the dashboard, the nav, the feedback widget or the notification code. The NFC tag deep-links straight there.
- **`sessionsFromEvents` overwrites an open IN when a second IN arrives**, so a `double_in` orphan produces no session row at all. That is why `unclosedInIds` exists in `MemberHoursAdmin.jsx` and why it cannot be replaced by reading sessions. `tests/anomaly-pairing.test.js` pins both halves.
- **Browser-check traps** (`innerText` vs `textContent`, inherited `opacity`, the playwright build this container lacks): [`docs/subsystems/tooling.md`](docs/subsystems/tooling.md).
- **The two Discord renderers disagree about subteams ON PURPOSE and are not being reconciled. Do not try to make the two lists match.** Why: [`docs/subsystems/discord.md`](docs/subsystems/discord.md).
- **The event-kind vocabulary is duplicated across four sites with nothing enforcing agreement** (`SchedulePage.jsx` `KINDS`, the `events_kind_check` constraint, and `KIND_COLORS`/`KIND_LABELS` in `discord-calendar/lib/render.js`). Adding a kind means touching all of them. The subteam and hour-category vocabularies ARE enforced, by `tests/vocabulary-drift.test.js`; this one is not, because two of its four sites are not machine-comparable from here.

## Self-Maintenance

Keep this file accurate. When you discover during a task that any of the following has drifted from what is written here, update it in the same commit as your other changes:

- Repo structure, key paths, or file names changed.
- The stack, Supabase schema, or external integrations changed.
- A module shipped (move it from Roadmap to a new `docs/subsystems/` file plus its line under The subsystems) or a new milestone landed. A subsystem's details go in its file; `CLAUDE.md` keeps one line per subsystem and stays under 4,000 words.
- An architecture decision or standing rule was established or revised.

**The historical record does NOT go here any more.** Write `docs/history/<your branch slug>.md` instead — one file per bundle, front matter then prose. That directory's README carries the format. This file describes the repo as it is now; the record describes how it got there, and mixing the two is what produced a 109,839-character line that every session had to rewrite.

**If a task raises a question only Mr. Pina can answer, write `docs/decisions/NN-slug.md` with a stated default and proceed under it.** Do not record it as a finding in a paragraph and carry it forward: three questions sat in the old "Last reviewed" line for weeks that way, phrased as "recorded and deliberately not fixed".

When you update this file, bump the Last reviewed date below and note what changed in the commit message.

Last reviewed: 2026-10-23. Human player leaderboard line (ledger 0025). Previously: Role board v2 in the Event rosters line (ledger 0023); Scouting pairs, super scouts and match-number shifts (ledger 0022); driver leaderboard line (ledger 0020); light theme and What's new (ledger 0019); automatic migrations (`migrate.yml`, ledger 0021) in the Database section; battery log, scouting and nav lines (ledger 0017). Latest records: `docs/history/light-mode-whats-new-0019.md`, `docs/history/auto-migrations-0021.md`.
