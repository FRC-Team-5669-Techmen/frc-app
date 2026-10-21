# Integration checkpoint

Prepared October 21, 2026 UTC. These changes are local reviewable source, not deployed services.

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
- Nexus map geometry and AI parsing are not implemented; manual/verified pit addresses are available. Role pings are deliberately absent pending a reviewed role mapping.
- Upstream HTTP cache metadata is returned but a shared server cache is not implemented. Imported snapshots retain retrieval time; the user explicitly refreshes and reviews before saving.
- Provider-match preview is available for assignment creation, but match schedules are not persisted as a separate automatic assignment engine.
- A `sending` reservation left by a crashed dispatcher remains visibly unresolved. It is intentionally not automatically resent; an operator must inspect Discord before deciding on a new explicit communication.
- Connector scouting reads cap at 1000 records and mark `truncated`; the full app export is the path for larger event archives.
