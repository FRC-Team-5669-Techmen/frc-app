# October 21 extended implementation evidence

Run began 14:48:18 UTC. Application candidate: `6b7feaa67aa298927e5c4aca875c6709d64d1c6e`; newer main `0a11c52` retained through merge `f3518cf`. No production mutation, deployment, main push or real notification.

| Artifact | Executed source and boundary |
| --- | --- |
| `unit.log`, `build.log`, gate logs | Final candidate 6b7feaa; 1004/1004 unit/DOM tests in 68 files, build 145 precache entries / 1941.88 KiB. Node 24.19 / npm 11.9 |
| `features.json`, `features.log` | Broad 15-feature run at 254d69e, before focus return/pagination/main merge; 1789/1789 assertions across 15 features |
| `focused-features.json`, `focused-features.log` | Final candidate: 336/336 (169 scouting, 75 families, 92 handbook) after the main merge |
| `pwa.json`, `pwa.log` | Final candidate: 28/28. Built app, native Chromium/IndexedDB/service worker/Supabase JS, local PostgREST/native PostgreSQL 17.6. Synthetic Auth issuance and fictional Nexus response |
| `soak.json`, `soak.log` | Built source 254d69e, 68/68 checks, 39 cycles, 2340.0 measured seconds. Repeated offline capture/reload/reconnect/duplicate sync; no human timing or real recording claim |
| `postgres17-scouting.log` | At 254d69e: full chain twice, 72/72 scouting SQL/RLS assertions, 17/17 permissive mutants caught, seven concurrent-connection checks. SQL/Edge/API contracts unchanged in final candidate |
| `checkin.json`, `checkin.log` | At 254d69e: 51/51, native Chromium both widths; synthetic fixture Auth/storage and geolocation |
| `accessibility.json`, `accessibility.log` | Final candidate: 18/18 scans without automated violations; axe-core 4.11.1, unnamed-button negative controls, tab-arrow focus, 24 dialog Tab steps per width and Escape focus return. Scoped scouting region/dialog, not whole-site WCAG or screen-reader certification. See incomplete/manual rules in JSON |
| `volume.json`, `volume.log` | Final candidate: 120 synthetic teams, 1,682 records/revisions; four card pages, full search, complete cache/export and independent 4/6 denominator/excluded states/median-rank ties pass at both widths. Shared-container timings only |
| `volume-before-pagination.json` | Earlier 3828e86 timing observations; not a controlled speed benchmark. Separate debug attempts were cancelled after harness setup errors |
| `portable-review.log`, `oracles.log` | Final actual-route portable DOM review and 13 independent synthetic math assertions (math code unchanged) |
| `unit-254d69e.log`, `unit-3828e86.log` | Earlier in this continuation: 1002/1002 and 1003/1003; do not substitute for final candidate |
| `ci-6b7feaa.json` | Independent GitHub CI 122 passed: Node 22.23.3/npm 10.9.9, 1004/1004 tests and all required gates; actual job summary lines retained |
| `initial-*` | Missing local test packages corrected by clean npm ci; native focus failure/probe; wrong-port checkout-identity refusal; unrelated reporting-date timeout under contention. Failures retained, not counted as passes |

PNG images contain fictional fixture data and are browser captures, not physical-phone evidence. Large synthetic JSON exports are checked by the retained harness and omitted here to avoid storing duplicate megabytes of generated data. The source, expected results and reproducible commands remain in `tools/e2e/`.

Earlier 573-assertion full SQL, 12 Deno entrypoint, hosted staging and historical CI evidence remains in the adjacent directories. Hosted Auth/API, representative providers/delivery, actual phones, novice timing, mentor assessment, independently annotated match corpus and current TideScout audiovisual fidelity remain open in `FIELD_ACCEPTANCE.csv`.

`sha256.json` pins all retained files except itself. Paths are relative to this directory. Logs have trailing blank lines normalized only; substantive output is retained.
