# Hosted HTTP conflict continuation

Baseline: `f8d605633298ecc545265f9176ef1982270234f3` on `codex/scouting-2026-evidence`. This folder retains actual execution evidence from the continuation, including failures. `source-boundaries.json` pins application/instrument hashes; `sha256.json` pins this folder. Runtime versions are in `runtime.json`. No credentials, session state, private original handoff or real member records are included.

## Boundaries

- `hosted-http-final.log` / `hosted-results.json`: **49 assertions**, actual GoTrue password/refresh grants, issued JWTs, hosted PostgREST and deployed Edge Functions in data-free branch `cctevrqiuqdiswkgghwo`. Six fictional users were provisioned through guarded SQL, not real signup emails. This does not establish OTP/Google OAuth or a hosted browser/app preview.
- `hosted-revoked.log`, `hosted-restored.log` and their result JSONs: **3 + 3** assertions using the same existing JWT after changing only the fictional other profile. Current RLS and RPC authorization follow revocation/restoration without token refresh. Combined final hosted coverage is **55**, not the sum of repeated earlier runs.
- `staging-evidence.json`: current migration applied twice, final **72-check** hosted rollback SQL proof, fictional fixture counts before cleanup, eight zero counters afterward, successful branch deletion/listing and read-only production postcheck. `HOSTED_HTTP.md` gives the reproducible engineering sequence. The branch and its diagnostic functions no longer exist.
- `sql-native.log`: **72 SQL/RLS checks, 17 permissive mutants caught and seven separate-connection races**, native PostgreSQL 17.11 in a disposable local cluster. Auth/storage/cron/network platform objects are stand-ins. This is separate from actual hosted GoTrue/REST. This run did not repeat the older 573-check whole-platform SQL suite.
- `unit-fixed.log`: **1030 tests / 71 files** before the state-ordering follow-up. `unit-final.log` has **1031/1031**, including the controlled delayed-read regression. `unit.log` is the preceding unchanged 1028-test baseline.
- `scouting-final.log` / result JSON: **169/169** on the final application. Together with the 1632 assertions in the 14 unchanged modules, this covers all **1801** expected feature assertions across serial runs; see `feature-coverage.json` for exact boundaries.
- `pwa-final.log` / result JSON: **33/33**, actual built PWA/service worker/IndexedDB, local PostgREST 14.18 and PostgreSQL 17.11. Auth issuance and Nexus geometry are synthetic. Five new assertions follow an actual concurrent HTTP correction through 409, held local proposal, both review inputs and explicit version-three apply. This does not establish hosted browser or real-device behavior.
- `checkin-fixed.log`: **51/51**, unchanged check-in source at both widths.
- Required build/connector/design/calendar/history and portable-review logs describe local checks. Portable review is actual route code under DOM/IndexedDB emulation, not native layout or phone acceptance.

The retained HTTP runs precede only the harness follow-up that explicitly records `completed` and failed assertions in result JSONs. The verified application, SQL and request expectations are unchanged by that reporting-only follow-up. Current harness source is syntax-checked; a fresh isolated run will also report its completion flag.

Independent [CI 146](https://github.com/FRC-Team-5669-Techmen/frc-app/actions/runs/39661703736) passed on application `de19a66`; `ci.log` and `ci.json` retain actual Node 22/npm 10 test/build/design/calendar/history results. Terminal ANSI styling was removed without changing result text.

## Failures retained

`hosted-http-initial.log` and `hosted-http-second.log` each reached 32 passing assertions and then timed out at stale correction. Their result files contain only assertions completed before the transport exception; they are **incomplete failed runs**, not successful 32-check suites. `conflict-probes.log` retains an initial schema-cache miss for the custom HTTP probe and the serialization-only probe timeout. Supabase documentation is retained in `serialization-retries.md`. PostgREST 14.18 endlessly retried application-raised 40001; exact isolated authenticator backends were terminated. The fixed 47-check run is also retained, but the later 49-check run covers all three conflict branches.

`features.log` is the run intentionally interrupted to apply the fix. `features-fixed.log` is an unsuccessful subsequent run that reused its fixture server; that owned server later shut down, producing connection refusals (**42/73**, incomplete expected coverage). The continuation then used a dedicated fixture port and serial browser processes. No timeout, assertion, expected total or actionability rule was relaxed.

The dedicated broad run (`features-dedicated.log`, its result JSON) finished **1800/1801** and exposed a real scouting UI ordering issue: the conflict panel could open before server evidence refreshed. Its 14 unaffected modules passed all 1632 expected assertions. `conflict-refresh-red.log` deterministically reproduces premature review with held reads; `conflict-refresh-green.log` passes after queue/evidence publication is ordered together. `conflict-refresh-fixture-setup.log` is an earlier test-setup error, corrected by creating an explicit fictional observation. No application assertion was weakened.

## External limits

TBA/Nexus credentials were inaccessible; actual unauthenticated endpoints return 401, while deployed import reaches its missing-configuration response. Public Statbotics returned HTTP 500 with [] for two keys. No successful provider response or bot/channel configuration is claimed. The original YouTube URL still receives proxy CONNECT 403. Both Vercel connections return scoped 403 for the existing project/team, so no app preview was deployed.

`advisors.json` retains existing platform warnings and the intentional service-only operations-table no-policy INFO. Two temporary diagnostic functions had mutable-search-path warnings; they are absent from shipped source and disappeared with branch deletion. No shipped scouting function appeared in the SECURITY DEFINER warnings. These observations are not a security clearance.

Physical iPhone/Android recovery, student timings, mentor/coach acceptance, independent real-footage annotations, current TideScout parity and production/real-notification authorization remain open. No main push, production mutation/deployment, email or real Discord send occurred.

Terminal trailing whitespace and final blank lines were normalized without changing result text; the artifact hashes describe the normalized retained files.
