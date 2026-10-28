# The Techmen connector

A remote MCP server that lets Mr. Pina do, from any Claude chat (by voice on his phone included), what he does in the app by hand, acting as himself. Built by ledger 0013, migration 0018, ported in design (not in code) from idea-app's IDEA Website connector. The record of how it was built and what was measured is `docs/history/frc-connector-0013.md`; the living list of things he says is `docs/connector/EVALS.md`.

## The shape

- **Address:** `https://frc-app-liard.vercel.app/mcp`. Streamable HTTP, stateless, JSON responses (`api/mcp.js`, the work in `api/_lib/connector/mcp.js`, `@modelcontextprotocol/sdk` 1.32.1).
- **The app is its own OAuth server** (`api/_lib/connector/oauth.js`), in the form Claude custom connectors accept: `/.well-known/oauth-protected-resource[/mcp]`, `/.well-known/oauth-authorization-server`, `/connector/authorize` (the consent card, a page of the app: `src/ConnectorPage.jsx`), `/connector/token`, `/connector/register` (RFC 7591), `/connector/revoke` (RFC 7009). PKCE S256, public clients, rotating refresh tokens, Client ID Metadata Documents. Every path but the page is one Vercel function, `api/connector/[route].js`, reached through `vercel.json` rewrites (the Hobby plan caps a deployment at twelve functions).
- **`/connector`** is the admin page: the on/off switch, every connection with Disconnect (and Disconnect all), and the audit log, each row opening to its arguments, the rows it wrote and its undo. Anybody but an admin reads "Page not found". Both `/connector` routes sit outside `ProtectedLayout` so the consent card works signed out on a phone.

## Who it acts as, and who may connect

- **It acts as the token's account and nobody else.** On every MCP request the bearer is turned into a Supabase session for the account on the token row (`mintSession`: `auth.admin.generateLink` then `verifyOtp` on a fresh anon client), cached in memory, never stored. Every tool runs through a client carrying THAT session, so `auth.uid()`, `is_admin()`, `is_staff()`, `has_role()` and every policy see him exactly as the browser does.
- **The service role is in one file**, `api/_lib/connector/backend.js`, for the `connector_*` tables and minting only. `tests/connector-service-role.test.js` holds it there.
- **One account may connect.** `connector_settings.allowed_member` names it, set by pasting `docs/connector/allowlist.sql` (looked up by email; no identity constant anywhere in code). `connector_may_connect()` is true only for that account AND only while it passes `is_admin()`. The consent card answers 404 to anyone else; every MCP request re-checks both halves and revokes the connection when either fails. The switch starts OFF and the allowlist empty, so nothing works until the paste.

## Every write goes through `connector_call`

`connector_call(p_tool, p_function, p_args, p_request_key, p_mode, p_meta)` (0018) is SECURITY INVOKER. It builds the call from `pg_proc` (named arguments, each cast to its declared type), so the inner function is gated exactly as from the browser, and writes one `connector_audit` row "via Claude" in the same transaction: who, tool, function, arguments, result, the rows written (read from `connector_log_tables` by an in-progress xmin test) and the computed undo. The app's own logs are written by the inner function, unchanged. For a caller who may not connect, the inner function runs exactly as a direct call: its own refusal comes back text for text, and if it would have worked the connector refuses with its own sentence; nothing lands either way. The `connector_*` tables carry no policy and no client grant; the private helpers refuse outside a `connector_call` of the same transaction.

## Three levels, enforced by the server

Decided by `api/_lib/connector/engine.js` from the registry, never by a prompt:

- **read** runs at once, as him, no audit row.
- **undo** runs and is logged; `dry_run` previews; the entry names its reverse and `undo_last` runs it.
- **confirm** always previews first (the write rolled back by a `CONNECTOR_PREVIEW:` raise) and writes only on a second call carrying the single-use `confirm_token` within ten minutes with identical arguments.

Anything that deletes, lowers a member's hours, removes a role or member, or messages people outside the app is confirm. A level may depend on the arguments (`level_when`: adding hours is undo, lowering them is confirm; granting a role is undo, removing one is confirm). Repeats never double: Claude's `request_id`, or a derived key matched within 120 seconds, answers the stored result with `repeated: true`; `again: true` is the deliberate second.

## The registry writes itself

One generated file, `api/_lib/connector/registry.generated.js`, written by `npm run connector:build` (`tools/connector/build.mjs`) from four layers:

1. **The inventory** (`tools/connector/inventory.mjs`): every database function the app calls under `src/` and `api/` (a literal `.rpc('name')`, AND any quoted string naming a public function the SQL creates, which catches the helpers that pass a name along), every Edge Function it invokes, every `api/` route, every direct `.from(table).insert/update/upsert/delete` and every storage write.
2. **The schema** (`tools/connector/sqlchain.mjs`): every signature read off the SQL files themselves, frozen files then numbered migrations, no database and no credential. `tools/connector/harness/check-parse.mjs` proves the parse equals `pg_proc` on a real PostgreSQL 16.
3. **The hand overlay** (`tools/connector/registry/*.yaml`), the only layer anybody edits: `tools.yaml` (the voice tools), `functions.yaml` (levels, undo and words for a function), `exclusions.yaml` (what is deliberately not reached, with a reason).
4. **The generated layer**: every function the app calls that the overlay does not name becomes a `call_app` entry, `read` when its body writes nothing (transitively, `tools/connector/gates.mjs`), otherwise `confirm`. Never `undo`: a reverse is a judgment.

**Scope is every operation his account can perform**, not only staff-gated ones; the database decides, as him, every time. `find_tool` plus `call_app` reach the long tail, so a hundred functions do not become a hundred MCP tools.

**Self-update:** `.github/workflows/connector.yml` runs the build on every push to `main` that touches the app or the SQL, runs the connector tests and the build on the result, and commits the regenerated file. It reads no credential, skips its own commits, never forces. **A new operation in the app ships its tool on the push that adds it.**

## How a new operation gets its tool

Nothing to do: add the database function and call it from the app. The next push regenerates the registry, and the operation is reachable through `find_tool` and `call_app`, asking first if it writes.

**There is no direct table write left in the app, and none can be added** (ledger 0014, migration 0019). The connector calls functions, never tables, so every page write goes through a database function by `writeVia(supabase, 'fn', args, fallback)` (`src/writeVia.js`). The 84 direct writes found on 2026-10-19 became 67 functions, one per thing a person does, every one SECURITY INVOKER so the table policies that decided the direct write decide the function, row for row (`0019_connector_writes_rls_test.sql` runs the old write and the function side by side for five callers). The `fallback` is the page's old write described as data; it runs only while a function answers "no such function" (PGRST202 / 42883), so the app behaves the same before and after the SQL is pasted. `tests/connector-coverage.test.js` fails on any `.from(...)` insert, update, upsert or delete (and any `.insert(`/`.upsert(` or builder kept in a variable) under `src/` or `api/` outside `src/writeVia.js` and the fixture engine, whatever `exclusions.yaml` says, and on any `writeVia` call whose function or argument names the SQL does not have.

**A new write is a function.** Write it in a numbered migration with a `-- Does:` line directly above its `create function` (the first sentence after `Does:` is what Claude reads in `find_tool`), call it with `writeVia`, and the next build makes it a `call_app` entry at confirm.

## How to write a hand entry

A hand entry gives an operation its voice: a name, a one-sentence `describe` under 200 characters in his words (never a table or column name), three or more `say` lines, arguments with spoken names, a level, and an undo.

1. In `tools/connector/registry/functions.yaml`, name the function with its `level` (or `level_when`), its `describe`, and its `undo` (templates over `$args`, `$result`, `$before`, `$written`; see `api/_lib/connector/engine.js`). Give it a `before` read when the reverse depends on what was there.
2. In `tools/connector/registry/tools.yaml`, add the tool: `kind: function` with `function:` and a `map` from tool arguments to function arguments (`$args.x`, `$resolved.member.id`), or `kind: read` with a runner in `api/_lib/connector/tools.js` (`READS`). Arguments with `resolve: member | event | signout` are matched against what his account can read; an ambiguous or unknown name writes nothing and names the candidates.
3. `npm run connector:build`, then add a line to `docs/connector/EVALS.md` and a sample to `SAMPLES` in `tools/connector/harness/proof.mjs` so the same-rows proof covers it.

## Gaps

`report_gap` files what the app cannot do to the existing feedback inbox (`connector_report_gap`, SECURITY INVOKER, through the inbox's own insert policy, `route = 'connector'`, type idea), where it shows on `/feedback` with every other report. `feedback_reply` answers a report through `feedback_reply` (0024, ledger 0016) at confirm: the sender is told in the app, by email and by push.

## Tools added by ledger 0014

- **`create_event`** (`schedule_create_event`, 0019): title, kind (the schedule page's own list), start, end, location, notes; times are read as Los Angeles wall-clock time (`$la.x` in a tool `map`, `laWallToIso` in `api/_lib/connector/dates.js`), an end before the start or an unreadable time writes nothing. Level undo: the reverse is `schedule_delete_event` with the new event's id.
- **`set_member_name`** (`admin_set_member_name`, 0020): admin only, the full name and the nickname only when given; level undo, the reverse puts the previous values back (the function answers them). Each change writes a `member_admin_log` row.
- **`merge_accounts`** (`admin_merge_member`, 0020): from and into resolved by name or email, a reason; always confirm, and the preview is the merge itself rolled back, so it lists the counts per table before anything is written. The rules are in `docs/subsystems/roster-and-access.md`.
- **`set_team_role`** taking a role away now carries its undo (give it back), and its preview names the role row it will remove (below).

## Tools added by ledger 0016

- **`send_family_link`** (`staff_send_trip_link`, 0023): a student (resolved by name), optionally part of a trip title and one email; confirm, because it messages people outside the app. The preview names the family and its emails; on "yes" one link email per address is queued and the event-family function sends it. The family-token functions 0023 adds (`family_hub_trips`, `family_hub_send_link`) are excluded: they act as whoever holds a family link.

## Tools added by ledger 0024 (0032)

- **`team_attendance`** (read, `team_attendance_summary`, 0032, staff only): every member in one call with signed-in hours all time (and since a date when asked), check-ins, first and last check-in, verified logged hours, this season application, trip invites and family answers, and the last app sign-in. Hours are `_member_hours` (0015) called as is: closed sessions only, FLL time and voided or under-review sessions left out; no second pairing rule. Filters run in `api/_lib/connector/tools.js` over what the database answered: role, status (active by default), min and max hours, no check-in since a date (never checked in counts), and `include: all` to keep parent-only accounts and approved emails that never made an account (both marked, left out by default). Sorted lowest hours first by default.
- **`set_member_status`** (`admin_set_member_status_bulk`, 0032, admin only): many members, one status (inactive, alumni, active), a reason; each through `admin_set_member_status` (the roster page path) and one `member_admin_log` row (`set_status`, new in 0032) per member actually changed. Always confirm, with no reverse (the members may have had different statuses before); the preview is the change rolled back and the tool adds every resolved name. The names are resolved first (`resolveMembers`): one unknown or ambiguous name answers for the whole call and nothing is written for anyone. It refuses the caller own account, a blank reason and more than 200 members.
- Proof: `0032_connector_team_reads_rls_test.sql` (19 checks), `node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0032.mjs` (13 mutants), `tests/connector-team-attendance.test.js`, and the bulk write is a hand sample in `proof.mjs`. The harness `auth.users` stub gained `last_sign_in_at`, which the real one has.

## Tools added by ledger 0024 Part 2 (no SQL)

The competition and season audit, and the open question about Discord, are `docs/decisions/51-connector-season-audit.md`.

- **`sign_in_out`** (`staff_add_event`, now a hand entry at undo; the reverse is `staff_void_event` with the new event id): the quick pulse control by voice. The time is now unless he says one (Los Angeles time). Before writing, the tool reads the member's last attendance event and refuses a second IN (it would orphan and never count), an OUT with nothing open, and an OUT while a sign-out request waits (use `approve_signout`). Undo, not confirm: a default time of now would never match between a preview and its confirm.
- **`trip_signups`** (read): per family on a trip, whether the trip form is answered and what they ticked for FIRST registration and the school form; not-answered families first.
- **`auto_routines`** (read): streaks, best streak, rate over the last ten runs and ready, ranked by `routineBoard` in `src/autos.js` (the page's own rule).
- **`log_auto_run`** (`auto_log_run`, generated entry, asks first): a routine resolved by name (`resolveRoutine`, active routines win a tie), success, partial or fail, the problem and an optional battery resolved by label.
- **`event_roster`** (read): an event's roles by member (0016 `event_roles`), whether the roster is posted, and the conflicts members declared and did not withdraw.
- **`preview_announcement`** (read): the `discord-announce` function's dry run (`action: 'preview'`, fixed in `backend.js` `announcePreview`); role names resolved against the announcement role list. It never posts; `tests/connector-season-tools.test.js` holds `backend.js` to the one preview call.

## Several changes asked as one question (ledger 0028d, no SQL)

`writeGroup(ctx, tool, plans, opts)` in `engine.js`: for a tool that makes one asks-first call per item. Each plan is still its own `connector_call` (own transaction, own audit row, same preview); what is grouped is the asking. The first call previews every plan and, only if none refuses, answers ONE `confirm_token` (each plan's own stored token, joined with dots); one refusal offers nothing and names the item. The second call takes and checks every token against its own plan BEFORE committing any, so a stale or mismatched token writes nothing for anyone; then each commits in order and a commit the database refuses (a car filled meanwhile) is reported per item (`partial`). It refuses a plan whose level is not confirm. A `hub:<code>` refusal now reads as the trip page's own sentence (the error detail), with the code in `reason`.

## Tools added by ledger 0028d (no SQL)

The three connector gaps filed 2026-10-28; record `docs/history/connector-gaps-0028d.md`.

- **`place_in_car`** (`hub_staff_call` move, the mentor Carpool tab's own Move, confirm, grouped): a student by name, a car by its driver's name (or `none`), a day (date, weekday or `all`), there, home or both. One move per (day, way); skipped ways are listed (no such car that way, not coming, family driving, already there). Staff pass the 72-hour lock; the 12-hour freeze, a full car and the one-minor rule (unless `override_reason`) refuse as on the page.
- **`trip_day_roster`** (read): per trip day every student coming by name, how they get there and home (team carpool and driver, family car, needs a seat, on their own), `arrives` (the day's target arrival when coming with the team or a family car) and `leaves` (their ride home's leave time, else the ride-home choice), not sure and not answered. The form asks no per-student times; the note says so.
- **`absences_waiting`** (read): pending absence requests, oldest first, with who, event, reason, note, filed and the request id; one unanswered when its event started is marked `counts_as_approved`.
- **`decide_absences`** (`decide_absence`, confirm, grouped): approve or deny many request ids with one note, one question.
- Proof: `tests/connector-trip-absences.test.js`, and hand samples for `hub_staff_call` and `decide_absence` in `proof.mjs`.

## Deleted rows are reported (0021)

0018 read the rows a call wrote by their in-progress xmin, which never sees a deleted row, so a removal previewed and audited as `"rows": []` (found live 2026-10-20 on a role removal). Since 0021 every table in `connector_log_tables` (now every public table but the connector's own) carries an AFTER DELETE row trigger, `connector_capture_delete`, which does nothing unless the delete runs inside `connector_call`; there it copies the deleted row into a transaction-only temporary table, and `_connector_rows_written` answers those rows marked `"deleted": true` (at most 200 per table, then one `more` entry). Cascades are captured the same way. An undo `when` may be a list that must all hold, and reads `"true"`/`"false"` text as booleans.

## Proof, and how to re-run it

- `npx vitest run tests/connector-*.test.js tests/write-via.test.js tests/merge-coverage.test.js`: OAuth, engine and tools, coverage (zero direct writes, every writeVia call fits its function), service role, workflow, the fallback helper, the merge column list. Part of `npm test`.
- `node tools/sql-harness/run.mjs --tests supabase/migrations/0019_connector_writes_rls_test.sql` (72 checks) and `--tests none --node tools/sql-harness/mutants-0019.mjs` (14 mutants); `0020_member_admin_rls_test.sql` (8) and `--node tools/sql-harness/merge-0020.mjs` (the merge, row by row, three mutants); `0021_connector_deleted_rows_rls_test.sql` (8) and `--node tools/sql-harness/mutants-0021.mjs` (3).
- `node tools/sql-harness/run.mjs --migrations 0002,0018 --tests supabase/migrations/0018_connector_rls_test.sql` (23 checks), and `--tests none --node tools/connector/harness/mutants-0018.mjs` (12 mutants).
- `node tools/sql-harness/run.mjs --tests none --node tools/connector/harness/proof.mjs`: every write entry, same rows as the direct call for the admin, refused with nothing landing for a member, a mentor and signed out; previews write nothing; the allowlist paste.
- `node tools/sql-harness/run.mjs --tests none --node tools/connector/harness/inspector.mjs`: Anthropic's MCP Inspector against the real handler on the harness database (`tools/connector/harness/serve.mjs`, `local-backend.mjs`), judged by rows.

None of these touch the live project. Whether 0018 is applied is answered only by querying the live database.

## Environment (Vercel project settings)

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (already set for `api/discord-week-ahead.js`), and `SUPABASE_ANON_KEY` (the project's public anon key; the connector falls back to `VITE_SUPABASE_ANON_KEY` when it is visible to functions). Without them every connector endpoint answers 503 "not set up yet" and the rest of the app is unaffected.
