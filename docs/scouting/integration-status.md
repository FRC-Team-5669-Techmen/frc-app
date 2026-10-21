# Current integration boundary

The decision-support continuation changes no SQL, provider, Edge or connector contract. Final `db990e5` passes 28 built-PWA/local API checks with synthetic Auth and fictional providers. Fresh native SQL/RLS, mutation and race results, and the earlier hosted SQL/deployment evidence are scoped in `VERIFICATION.md`. Hosted Auth/API/provider success and real notification delivery remain unverified; production is unchanged.

---

# Earlier integration checkpoint — October 21, 2026 (historical)

Source at that checkpoint: `7a1ddca`. Read-only Nexus geometry and connector forwarding are implemented, including bounded demo/offseason keys. Roster import remains manager-only. The local production-built app passes **22/22** API/database assertions through real local PostgREST/native PostgreSQL, with synthetic Auth and fictional Nexus data supplied to the real adapter. Actual local Deno 2.9.6 entrypoints pass `deno check` and **12/12** HTTP boundaries against rejecting local Auth; no external network permission or real sends.

In an isolated hosted branch, 0022 applied twice and **72/72** SQL/RLS assertions passed. Both actual Edge source directories deployed ACTIVE/version 1 with **verify_jwt=true**. Hosted HTTPS was denied by the workspace proxy, so no deployed Auth/API/provider/Discord success is claimed. All fixtures rolled back; the temporary branch was deleted after retaining evidence. Production remained unchanged. See `STAGING.md`.

The notes below preserve earlier implementation detail and historical counts; use `VERIFICATION.md` for current results and boundaries.

---

## Implemented

- `supabase/functions/scouting-dispatch/index.ts` and `dispatch.js`: authenticated, user-scoped record read; author/manager check; service-only atomic delivery reservation; existing Discord bot and guild configuration; fixed #scouting and #strategy channels; mentions suppressed. A delivered, sending or uncertain version never automatically posts again. Explicitly requested revised notes carry a Correction vN label. Definite refusals can be retried explicitly. Saved scouting data survives every delivery failure.
- `supabase/functions/scouting-import/index.ts` and `import.js`: manager-authenticated, read-only upstream preview from fixed TBA, Statbotics and Nexus origins. Request validation, redirect refusal, 10-second fetch deadlines and 4MB upstream response bound. Per-source statuses and retrieval times. Missing estimates stay unknown; official score breakdowns stay alliance-attributed. Failed sources omit fields so existing values can be preserved during a reviewed merge.
- Connector reads: `scouting_event` and `preview_scouting_import`. Connector `scouting_save` is explicitly confirmation-required; the private SQL delegation cannot accidentally be inferred as a read. `call_app` binds `p_actor` to the token account. Delivery is attempted only after an audited committed save, never a preview, and uses that same account JWT.
- Browser sync invokes the same dispatcher after the local operation is durably marked synchronized. Data state and delivery state remain separate.

## Provider contracts pinned

- TBA OpenAPI 3.27.2: `https://www.thebluealliance.com/swagger/api_v3.json`; `X-TBA-Auth-Key` header; event teams/simple and matches. Raw alliance breakdown retained, never divided among robots.
- Statbotics API 3.0.0; first-party model at commit `a2cea5553e35693d423400f419bd770cb2143408`, `backend/src/db/models/team_event.py`. `epa.total_points` is a number, not an object with a mean property. `/v3/team_events?event=...` has no API key in the published contract. Live sample response returned 500 during source research, so only the documented/source-backed mapping and mocked responses are verified. The adapter requests up to 1000 team-event rows explicitly.
- Nexus v1.8.0 docs: `https://frc.nexus/api/v1/docs`; `Nexus-Api-Key`; `/event/{eventKey}/pits` maps team number strings to pit address strings. This implementation uses verified pit addresses, not an AI-generated map.
- Supabase changelog read October 21, 2026. The recent CBC TLS cipher deprecation does not require application changes for the modern fetch runtime; runtime deployment remains unverified. Edge Functions keep platform user JWT verification ON and additionally call `auth.getUser()`.

## Configuration and apply order

1. Apply reviewed migration `supabase/migrations/0022_scouting.sql` and run its rollback-only tests before enabling the UI. Root report owns migration verification status.
2. Deploy both Edge Functions manually with JWT verification ON: `npx supabase functions deploy scouting-dispatch` and `npx supabase functions deploy scouting-import`. They import local modules, so use the CLI source directory rather than pasting only index.ts.
3. Reuse `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID`. The bot needs View Channel and Send Messages in #scouting and #strategy. No webhook or role ping was invented.
4. Set server-only `TBA_AUTH_KEY` and `NEXUS_API_KEY` if imports are wanted. These are proposed Techmen secret variable names; their presence in a live project was not checked. Never prefix them with `VITE_`.
5. Publish the reviewed app branch only after the database/functions have been verified by the operator. No production changes were made by this work.

## Actual focused verification

`npx vitest run tests/scouting-integrations.test.js tests/connector-engine.test.js tests/connector-coverage.test.js tests/connector-service-role.test.js`: **78/78 passed across 4 files**. Of these, **20 integration tests** cover duplicate suppression, positive sending controls, auth and stale-version refusal, missing configuration, HTTP 403/429 recovery, ambiguous network/500/receipt failures, receipt-write failure, mention suppression, provider mapping/provenance, unknown versus zero, partial-source failure, hostile event-key refusal and connector preview-versus-commit dispatch.

`npm run connector:build` ran; generated registry includes the new entries. `git diff --check` passed for integration-owned tracked changes. Root runs the complete repository gate after other agents finish.

## Not verified or deliberately deferred

- No real Discord message was sent. No live TBA/Nexus key was read or used. No live data was imported. No Supabase function was deployed. Live JWT gateway behavior, Discord permissions and provider quotas remain unverified.
- Real-device offline behavior and first-time scout timing belong to the overall app verification; mocked integration tests establish none of those claims.
- Nexus map geometry is implemented in the October 21 continuation; see `PIT_MAP.md`. Ordinary eligible scouts use the read-only mode while roster imports stay manager-only. Live provider/map presentation fidelity remains unverified. AI parsing and role pings are deliberately absent; there is no reviewed role mapping or authorized real send.
- Upstream HTTP cache metadata is returned but a shared server cache is not implemented. Imported snapshots retain retrieval time; the user explicitly refreshes and reviews before saving.
- Provider-match previews can be accepted into the reviewed shift planner. Schedule drafts persist locally per account/event; reviewed assignments sync through the existing versioned RPC. They are not a new shared server schedule table.
- A `sending` reservation left by a crashed dispatcher remains visibly unresolved. It is intentionally not automatically resent; an operator must inspect Discord before deciding on a new explicit communication.
- Connector scouting reads cap at 1000 records and mark `truncated`; the full app export is the path for larger event archives.

Prior-event observation notifications now include the recorded source event in the text, preserving the distinction outside the app. Mention suppression and duplicate-delivery handling remain unchanged. No real notification was sent during verification.

## Resumed local transport proof, October 21

A real production build/Supabase JS client now runs against local PostgREST 13.0.7 and native PostgreSQL 17.6 in `tools/e2e/scouting-pwa.mjs`. It uses synthetic Auth issuance and no live provider calls. The 19/19 checks include connector HTTP preview rollback, attributed/audited commit, unauthorized-account refusal, direct-write refusal and parent read/write denial. Native separate-connection delivery reservations pass 7/7 race assertions without sending anything.

Read-only production metadata confirms both scouting Edge Functions are absent. No deployed API/provider/Discord acceptance is claimed. A fresh Statbotics sample request through the web reader was inaccessible; Nexus documentation remains v1.8.0. Missing real responses and field/device testing remain release gates.
