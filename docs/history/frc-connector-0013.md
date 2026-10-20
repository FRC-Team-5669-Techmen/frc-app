---
title: "The Techmen connector: a remote MCP server so Mr. Pina can run the app from any Claude chat (ledger 0013)"
date: 2026-10-19
branches: [main]
commits: []
migrations: ["0018_connector.sql", "0018_connector_rls_test.sql"]
subsystems: ["Connector", "Feedback", "Roster and access", "Testing", "CI workflows"]
---

## Progress

Kept current so a restarted session can resume. Each milestone is a local commit.

- [x] M1 rebased onto origin/main 4f3ccff; read CLAUDE.md, the ledger and migrations READMEs, idea-app's connector; audit started
- [x] M2 migration 0018 and its test pass in the SQL harness (23/23; mutants-0018 12/12); docs/connector/allowlist.sql; package.json has @modelcontextprotocol/sdk 1.32.1 and pg 8.16.3 (dev)
- [x] M3 tools/connector: sqlchain, inventory, gates, registry YAML, build.mjs writing api/_lib/connector/registry.generated.js; `npm run connector:build` / `connector:check`
- [x] M4 api/_lib/connector (crypto, errors, backend, oauth, registry, engine, resolve, dates, tools, mcp, node, log-tables), api/mcp.js, api/connector/[route].js, vercel.json rewrites
- [x] M5 src/ConnectorPage.jsx/.css, the /connector/* route and lazy import in App.jsx, the fixture routes line; build and ds:audit green; fixture screenshots at 375 and 1440 show the not-set-up state
- [x] M6 vitest: connector-oauth (22), connector-engine (21), connector-coverage (16), connector-service-role (5); coverage mutation-proved both ways (a planted direct write reddens 2 checks, a planted rpc reddens staleness), restored from a copy
- [x] M7 harness: proof.mjs 656/656 (10 hand samples same rows as direct; 84 write entries x member, mentor, signed out refused with nothing landing; 84 previews write nothing; allowlist paste 3 ways); a mutant letting anyone through turns 130 red; MCP Inspector 0.17.2 CLI 12/12 against the real handler over the harness, judged by rows
- [x] M8a docs (subsystems/connector.md, connector/EVALS.md), connector.yml and its test, CLAUDE.md row, this entry's audit and steps
- [ ] M8b full gate on the exact tree, fetch and rebase, renumber if needed, push

Next: M8b.

## Audit (answered from the tree before building, 2026-10-19, on 4f3ccff)

**1. Every way the app writes.**
- **Database functions:** 103 distinct public functions the app calls under `src/` and `api/` (81 literal `.rpc('name')` call sites; the rest are names passed to a helper, `rpc(supabase, 'decide_absence', ...)`, `staffRpc`, `rpcCall`, which a `.rpc(` scan misses). 89 of them write (transitively, read off the bodies). Every one is in the registry: 93 reachable (`call_app` or a hand tool), 10 excluded with a reason.
- **Direct table writes in `src/`: 84** (31 insert, 32 update, 15 delete, 6 upsert) **in 26 files**, multi-line ones included. `api/` makes none. Each is excluded for now with the reason "direct table write, moves to a function in the next connector ledger", keyed by file, table and operation with its count (`tools/connector/registry/exclusions.yaml`). By file and line:
- `src/AccessGate.jsx` (1): 43 access_requests.insert
- `src/AnnouncePage.jsx` (4): 208 discord_announce_roles.insert, 222 discord_announce_roles.update, 275 discord_announce_roles.update, 284 discord_announce_roles.delete
- `src/App.jsx` (1): 265 profiles.update
- `src/CheckinPage.jsx` (2): 133 attendance_events.insert, 330 profiles.upsert
- `src/FeedbackPage.jsx` (1): 369 feedback.update
- `src/FeedbackWidget.jsx` (1): 173 feedback.insert
- `src/HandbookPage.jsx` (1): 381 handbook_acknowledgments.insert
- `src/HomePage.jsx` (2): 213 event_signups.delete, 214 event_signups.upsert
- `src/JobsPage.jsx` (7): 230 task_updates.insert, 313 tasks.update, 382 tasks.update, 388 task_required_skills.delete, 390 tasks.insert, 398 task_required_skills.insert, 418 tasks.delete
- `src/LogHoursPage.jsx` (2): 71 logged_hours.insert, 91 logged_hours.delete
- `src/MemberApplication.jsx` (2): 393 member_applications.insert, 407 profiles.update
- `src/NotificationsPanel.jsx` (3): 75 profiles.update, 95 push_subscriptions.upsert, 118 push_subscriptions.delete
- `src/ProfilePage.jsx` (2): 47 profiles.update, 109 profiles.update
- `src/RosterPage.jsx` (6): 165 profiles.update, 167 member_roles.upsert, 184 allowed_domains.insert, 192 allowed_domains.delete, 238 profiles.update, 252 profiles.update
- `src/RostersPage.jsx` (2): 184 hub_events.update, 185 hub_events.update
- `src/SchedulePage.jsx` (8): 125 event_signups.upsert, 131 event_signups.delete, 202 events.insert, 228 events.update, 241 events.update, 245 events.insert, 257 events.delete, 258 events.delete
- `src/SquadPage.jsx` (5): 50 position_assignments.insert, 60 position_assignments.delete, 96 positions.update, 97 positions.insert, 107 positions.delete
- `src/StandingTeamPage.jsx` (2): 292 fll_teams.insert, 335 standing_settings.update
- `src/SurveyPage.jsx` (2): 228 survey_responses.insert, 244 survey_answers.insert
- `src/SurveysAdmin.jsx` (11): 412 surveys.insert, 437 surveys.update, 441 surveys.update, 455 surveys.update, 480 surveys.insert, 493 survey_questions.insert, 513 surveys.delete, 529 survey_questions.insert, 544 survey_questions.update, 552 survey_questions.delete, 570 survey_questions.update
- `src/TripsAdmin.jsx` (9): 433 hub_food_needs.update, 447 hub_food_needs.insert, 458 hub_food_needs.delete, 584 hub_events.update, 639 hub_days.update, 665 hub_meals.update, 692 hub_events.update, 709 hub_days.insert, 730 hub_meals.insert
- `src/TripsPage.jsx` (1): 39 hub_events.insert
- `src/VerifyHoursPage.jsx` (3): 390 session_reviews.update, 414 app_settings.update, 431 logged_hours.update
- `src/VolunteerCheckinPage.jsx` (3): 111 attendance_events.insert, 149 attendance_events.insert, 244 profiles.upsert
- `src/attendanceCheckout.js` (1): 32 attendance_events.insert
- `src/signout.js` (2): 141 attendance_events.insert, 142 attendance_events.insert
- **Storage writes:** 5 (`src/DriverDocsPage.jsx` upload and two removes, `src/FeedbackWidget.jsx` and `src/JobsPage.jsx` uploads), excluded: the connector carries no file bytes.
- **Edge Functions the app invokes:** 6 (`calendar-feed`, `discord-announce`, `event-family`, `invite-member`, `parent-response`, `send-approval-email`), each excluded with its reason; `discord-announce` and `invite-member` message people outside the app and are named for the next ledger as hand entries at confirm.
- **`api/` routes that write:** 1, `api/discord-week-ahead.js` (a Vercel cron that posts to Discord with its own secret); excluded, not a person's action.

**2. Identity and roles.** Roles live in `public.member_roles (member_id, role)`, role in student, mentor, lead, admin, parent. `is_admin()` (`supabase/feedback.sql`) is true when `member_roles` holds `admin` for `auth.uid()`; `is_staff()` (`supabase/skills_catalog.sql`) is mentor, lead or admin; `has_role(text)` (`platform_migration.sql`) is the general check; `parent` is never staff. Mr. Pina's account is identified only by email lookup in SQL: `docs/connector/allowlist.sql` reads `auth.users` by `lower(email)` (profiles has no email column), refuses an account without the admin role, and writes its id to `connector_settings.allowed_member`. No id is in any code.

**3. Environment variables `api/` uses** (`api/discord-week-ahead.js`, documented in `docs/subsystems/discord.md`): `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_WEBHOOK_URL`. **A service role key is available to `api/`** (the week-ahead post already reads `SUPABASE_SERVICE_ROLE_KEY`). The connector also needs the public anon key server-side, to verify a minted session and to act as him: **`SUPABASE_ANON_KEY` must be added in Vercel**. The code falls back to `VITE_SUPABASE_ANON_KEY`, which Vercel normally exposes to functions too, but that could not be checked from here, so the step is listed.

**4. Sign-in.** `src/LoginPage.jsx` offers Google OAuth (`signInWithOAuth`, redirect to `/dashboard`) and an email code (`signInWithOtp` then `verifyOtp`). A session can be minted server-side for one user the way idea-app's Armory does: `auth.admin.generateLink({type: 'magiclink'})` with the service role, then `verifyOtp({token_hash})` on a fresh anon client (`mintSession` in `api/_lib/connector/backend.js`).

**5. The feedback inbox** (`docs/subsystems/feedback.md`): `public.feedback`, insert-own policy (`member_id = auth.uid()`), admin read, no delete; the console at `/feedback` with statuses new, seen, in_progress, done, wont_do, spam through `feedback_set_status` and its exact undo `feedback_restore_status`. Gaps are filed there by `connector_report_gap` (SECURITY INVOKER, through that insert policy), type `idea`, `route = 'connector'`, `user_agent` "Techmen connector (via Claude)". The inbox has no reply or comment of any kind, so "reply in the feedback inbox" is not available: `feedback_reply` says so and points at `report_gap`.

**Claims in the prompt the tree contradicted or could not support:**
- "create events": the schedule writes `public.events` directly from `src/SchedulePage.jsx`; no function creates a schedule event, so `create_event` is a not-available tool for now, as the prompt allowed.
- "read and reply in the feedback inbox": reading works; there is no reply anywhere.
- "correct hours": there is no single correction function; `staff_add_hour_adjustment` (signed hours with a reason) is what `/members/:id` uses for it, and is the hand entry. Editing or voiding a session, and editing logged hours, are reachable through `find_tool`/`call_app` (`staff_edit_event`, `staff_void_session`, `staff_edit_logged_hours`), each asking first.
- `idea-app`'s `.github/workflows/connector.yml` uses Node 24; this repo's CI pins 22, and the port uses 22.

## Design decisions taken while building (each the most conservative reading)

- **Signatures are read off the SQL files, not a database** (`tools/connector/sqlchain.mjs`), because CI reads no credential and the build must need none. `tools/connector/harness/check-parse.mjs` proves the parse against a real PostgreSQL 16 with the whole chain applied: 264/264 signatures match `pg_proc` (names, defaults, set-returning, definer), 2026-10-19.
- **Harness scripts live under `tools/connector/harness/`**, not `tools/sql-harness/`, because only `tools/connector/**` is owned. They run through `tools/sql-harness/run.mjs --node` unchanged.
- **Two Vercel functions, not one per route**: `api/mcp.js` and `api/connector/[route].js`. The Hobby plan caps a deployment at 12 functions and the app already has one.
- **The consent card and the admin page are one React route**, `/connector/*`, outside `ProtectedLayout` so a signed-out phone can still sign in on the consent card. Registering it takes the route line and its `lazy()` import line in `src/App.jsx` (the import cannot live inside the route line without remounting on every render), plus one line in `src/dev/fixture/routes.js`, which `tests/fixture-routes.test.js` requires for every route in `App.jsx`. That last file is outside the owned paths; CLAUDE.md's gate wins.
- **The consent card signs in by email code as well as Google.** Google returns to the redirect address only if Supabase allows it, which this repo cannot see; the code never leaves the page.
- **Hours are read through the database's own `member_standing`**, never re-derived in `api/`, so there is no second copy of the hours arithmetic. Today's sign-ins need the LA calendar day; `src/hoursUtils.js` cannot be imported by a Vercel function (its own imports have no extensions, which Node ESM refuses), so `api/_lib/connector/dates.js` carries a one-line copy of `laDateKey` and `tests/connector-engine.test.js` holds it equal to the original across DST edges.
- **Functions whose first argument is a family capability token** (`family_call`, `hub_add_parent`, `hub_household_open`, `hub_remove_family`, `hub_remove_guardian`) are excluded: they act as whichever family holds the link, not as the signed-in account.
- **Edge Functions the app invokes** are inventoried. None gets a generated tool, because their request bodies are declared nowhere the build can read; each is excluded with its reason, and `discord-announce` and `invite-member` (which message people outside the app) are named as the next hand entries. `connector_external_begin`/`_finish` (0018) are the audit path they will use.
- **Table-write exclusions are keyed by file, table and operation with a count**, and the line numbers are recorded in the generated registry. A key on line numbers alone would redden every unrelated edit that moves a line; a key with a count still reddens a new write.

## What was built

Everything is described in `docs/subsystems/connector.md`; this is the record.

- **Migration 0018** (`supabase/migrations/0018_connector.sql`, test `0018_connector_rls_test.sql`): eight `connector_*` tables with RLS on, no policy and no client grant (revoked from anon and authenticated by name); `connector_may_connect()`; SECURITY INVOKER `connector_call` built from `pg_proc`, writing one `connector_audit` row in the same transaction; the private helpers gated on the account check and a transaction marker; `connector_audit_failure`; `connector_external_begin`/`_finish` for a future Edge Function hand entry; SECURITY INVOKER `connector_report_gap` into the feedback inbox; the five admin functions the page uses. Ported from idea-app 0270 with `is_admin()` replaced by `connector_may_connect()` wherever the caller is the connector. The switch starts off and the allowlist empty.
- **The server** (`api/mcp.js`, `api/connector/[route].js`, `api/_lib/connector/*`): the OAuth server, the MCP endpoint, the write engine (three levels, confirm tokens, repeats, undo), name resolution against what his account reads, 19 tools (13 hand entries, `create_event` and `feedback_reply` as not-available, `report_gap`, `undo_last`, `find_tool`, `call_app`).
- **The registry** (`tools/connector/*`, `npm run connector:build`, `connector:check`): 103 functions called, 99 reachable in the registry (15 read, 2 undo, 80 confirm, 2 by argument; 86 generated), 10 excluded, plus 84 direct table writes, 5 storage writes, 6 Edge Functions and 1 route each excluded with a reason.
- **The page** `/connector` and `/connector/authorize` (`src/ConnectorPage.jsx`/`.css`), Tactical HUD tokens only, 44px-high controls, verified at 375 and 1440 in fixture mode (where it shows "not set up yet", since fixture mode has no connector functions).
- **Self-update:** `.github/workflows/connector.yml`, held by `tests/connector-workflow.test.js`.
- **Gaps** go to the existing feedback inbox, `route = 'connector'`.

## Measured, 2026-10-19

- vitest: `connector-oauth` 22, `connector-engine` 21, `connector-coverage` 16, `connector-service-role` 5, `connector-workflow` 5. The coverage test was mutation-proved both ways: a planted direct table write in `src/SquadPage.jsx` reddened 2 checks, a planted `.rpc('staff_log_safety')` reddened the staleness check; restored from a copy.
- SQL harness: `0018_connector_rls_test.sql` 23/23 (applied twice, re-runnable); `tools/connector/harness/mutants-0018.mjs` 12/12 caught (allowlist dropped, admin dropped, connector_call open, marker dropped, tables opened, state readable, switch flippable, preview commits, derived repeats unmatched, app-service audit open, anon granted, broken shut).
- `tools/connector/harness/check-parse.mjs`: the static SQL parse equals `pg_proc` for 264/264 public functions.
- `tools/connector/harness/proof.mjs`: 656/656. Ten hand samples write the same rows through `connector_call` as the admin's direct call (normalised for fresh ids and times), plus exactly one audit row each; every one of 84 write entries refuses a member, a mentor and a signed-out caller with nothing landing (inner refusal text for text where the inner function refuses; the connector refusal where it would have worked); every preview writes nothing; the allowlist paste allows the admin, refuses a non-admin and an unknown email. A permissive mutant (connector_call and the guard letting anyone through) turned 130 checks red.
- **MCP Inspector** (`@modelcontextprotocol/inspector@0.17.2 --cli`, Streamable HTTP) against the real handler on the harness database (`tools/connector/harness/inspector.mjs`): 12/12, judged by rows: tools/list; two reads; an hours credit (one row), its repeat (no row), its undo (the -2 row); an hours debit previewed (no row) then confirmed (one row); a generated entry asking first; `report_gap` landing in the inbox; four audit rows; a bad bearer refused.
- Every hand read (`list_members`, `todays_signins`, `list_events`, `event_signups`, `trip_boards`, `parent_responses`, `feedback_inbox`, `find_member`, `approve_signout` preview) was run against the harness schema as the admin and answered.

## Not verified, and why

- **Nothing here touched the live Supabase project.** No credential exists in this container. Whether 0018 is applied, whether the allowlist row is set, whether `generateLink`/`verifyOtp` mint a session on the hosted auth service (the Armory pattern works in idea-app; it was not run here), and whether RLS on the live tables matches the frozen files, are all unverified.
- **No Vercel deployment was exercised.** The rewrites, the `[route]` dynamic function, the request body handling in `api/_lib/connector/node.js`, and the environment variables are unverified on Vercel; they are tested only through the same handlers in Node.
- **No Claude client connected.** The OAuth flow was driven by the real handlers in tests and the Inspector used a pre-minted token; Claude's own registration, consent redirect and token exchange against the deployed app are unverified until Mr. Pina adds the connector.
- **Google sign-in on the consent card** returns to `/connector/authorize?...`; whether Supabase's redirect allow list accepts that address is unverified. The email code on the same card does not depend on it.
- **The workflow** `.github/workflows/connector.yml` has not run on GitHub.

## Mr. Pina's steps (also in the final report)

1. **Paste the SQL**, in order, at https://supabase.com/dashboard/project/_/sql/new (choose the Techmen project). For each file: open it on GitHub, copy all of it, paste, press **Run**. Expected: "Success" with a notice.
   1. `supabase/migrations/0018_connector.sql` (notice: "0018: connector tables and functions created; 33 log tables listed; allowlisted: f.")
   2. `supabase/migrations/0018_connector_rls_test.sql` (expected: a grid of 23 PASS rows and a summary PASS; it changes nothing)
   3. `docs/connector/allowlist.sql` (expected: one row, enabled true, allowed_account apina@boscotech.edu)
2. **Add one environment variable in Vercel:** https://vercel.com/dashboard, open the frc-app project, **Settings**, **Environment Variables**. Key `SUPABASE_ANON_KEY`, value: the same anon key as `VITE_SUPABASE_ANON_KEY` (Supabase, **Project Settings**, **API**, "anon public"), environment Production. **Save**, then **Deployments**, the newest, **Redeploy**. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already set for the Sunday Discord post.
3. **Add the connector in Claude:** https://claude.ai/settings/connectors, **Add custom connector**. Name `Techmen`, URL `https://frc-app-liard.vercel.app/mcp`, leave the OAuth fields blank, **Add**, then **Connect**. The app opens on the consent card; sign in with apina@boscotech.edu if asked; press **Connect**. Expected: the connector shows as connected, and in a new chat "who's here today" answers from the app.
4. To switch it off or disconnect: https://frc-app-liard.vercel.app/connector.
