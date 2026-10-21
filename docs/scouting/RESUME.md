# Resume Team 5669 scouting

**Branch:** `codex/scouting-2026-evidence` · [draft PR #4](https://github.com/FRC-Team-5669-Techmen/frc-app/pull/4). Read `SCOUTING_START_HERE.md`, `CLAUDE.md`, `docs/subsystems/scouting.md`, `VERIFICATION.md` and `STAGING.md`. Continue the restored checkpoint history; do not rebuild from main. The private original inputs stay outside public commits.

## October 21 decision-support continuation

New implementation adds separate confirmed/optimistic projections, a searchable and paged full observation history with dispute triage, and a locally saved drive-team match brief with explicitly entered six-team lineup, frozen JSON/print exports and stale-review invalidation. `DECISION_SUPPORT.md` records the acceptance contract and Techmen provenance. No schema, auth protocol, connector, provider or dependency changes. A definitive authorization/account failure now hides retained receipts and editing controls until access is restored; local work is preserved.

Focused checks passed: 15 new pure/DOM cases, then 30 rendered cases including the real page's pending-correction master/coverage regression; nine permissive scope/confirmation/denial mutations detected; two Chromium viewport cases exercised real IndexedDB, downloads and print rendering against fictional data. Full gates are being rerun; see the newest VERIFICATION section for final results. Earlier result counts below belong to their stated commits.

Continue with the current branch, not the earlier application hash below. Remaining external gates and release restrictions are unchanged. New brief drafts use the existing actor/event-scoped `match-brief` key and travel in event backups. Exported briefs are frozen copies, not shared database records or win predictions.

## October 21 extended implementation

The additional run began **14:48:18 UTC**. Current application candidate is **`6b7feaa67aa298927e5c4aca875c6709d64d1c6e`**. The earlier checkpoint history is preserved. Merge `f3518cf` incorporates newer remote main `0a11c52` (public handbook/family-link changes); no main push occurred. Implementation/verification continued past one hour; evidence was consolidated at **2026-10-21 15:48:25 UTC**. The review branch is the durable source checkpoint; the GitHub commit ZIP provides a downloadable copy.

## Complete, verified and still blocked

| Requirement | Implementation and verification boundary |
| --- | --- |
| Claims, observations, assignments, planning, pit replies, individual/master lists and comparison preview/apply | Implemented; current focused Chromium and independent SQL/math checks. Techmen formulas are explicitly distinguished from undisclosed 4414 behavior |
| Offline capture and recovery | Durable actor-bound queue/cache; cold/expired-session entry; conflicts; lost-response receipts; export. New reviewed backup restoration retains original IDs/bodies, inserts held proposals atomically and requires separate release. Invalid requests cannot enter evidence or editable forms; see `RECOVERY.md` |
| Draft interruption | Form/planner/pick-list reads must succeed before editing; latest-write status, duplicate-submit protection and queue snapshot races corrected. Modal Escape returns focus to its opener |
| Large events | Complete paginated data loading; team cards now page 30 at a time while search, denominator and ranking calculations use the full set. Synthetic 120-team / 1,682-record browser case checks final-team search, four pages, cache/export completeness and independent percentages/ties |
| Pit navigation | Nexus v1.8.0 maps, directory, zoom/rotation, source conflicts/freshness and offline caching implemented. Exact TideScout presentation remains unknown |
| Extensive training | Eight missions, 180-minute facilitation plan, 27 decisions, six simulations, partner/footage tasks and frozen/reviewed workbook. Software flows verified; real novice timing and mentor proficiency remain unverified. IDEA Classroom retains certification authority |
| Integrations/connector | Local transport/permission/failure checks pass. Earlier temporary hosted staging verified SQL and Edge deployment; hosted Auth/API, representative live providers and real delivery remain unverified |
| Hosted database | Earlier isolated PostgreSQL 17.11 proof applied 0022 twice and passed 72 rollback SQL/RLS assertions. Identities were injected through SQL, not hosted Auth. Branch deleted after evidence capture |
| Production | No scouting installation/deployment/main push/real notification authorized or performed. The earlier read-only catalog found no scouting objects/functions; this continuation did not mutate production |
| Source fidelity | Evidence matrix, rule/API pins, hand calculations and deliberate deviations retained. Original audiovisual/current-app parity and fixed annotated real-match corpus remain external gaps |

Final code: **1004/1004 tests**, build/all required gates, **336/336 affected-route Chromium assertions**, **28/28 built-PWA/local API checks**, **18/18 automated accessibility scans** and both 120-team volume cases pass. Independent **GitHub CI 122** also passed. At earlier `254d69e`, the broad suite passed **1789/1789 across 15 features**, check-in **51/51**, native scouting SQL **72/72** with **17/17** mutants and **7/7** races, and the measured soak passed **68/68** with **39 cycles over 2340.0 seconds**. Exact source/runtime boundaries and initial corrected failures are in `VERIFICATION.md` and the retained artifacts.

## Specific external blockers

- Staging HTTPS was denied by the managed workspace proxy (CONNECT 403). There is no network-policy editing tool in this session. Do not bypass the proxy. Hosted Auth/REST/gateway and source-provider acceptance need an approved environment with staging HTTPS access.
- Real iPhone/Android backgrounding/storage recovery, beginner measurements, mentor assessment and independently annotated actual footage require people/devices/artifacts unavailable here. `FIELD_ACCEPTANCE.csv` now has 16 NOT_RUN and three PARTIAL gates, including real drive-team brief acceptance; none is silently marked passed.
- Original TideScout audio/frames/current app exports remain unavailable. Latest-version parity cannot be asserted. Role pings remain absent pending a reviewed mapping; AI parsing was not invented.
- Production installation and real Discord sends still require the user's explicit release authorization. `RELEASE.md` is the concrete apply/recovery packet.

## Staging cleanup and reproducibility

Temporary branch `scouting-2026-verification`, project `ghznodbtpvxlsyevmkla`, branch ID `94b80d0d-16ed-47c6-848c-3890b5539a09`, was deleted successfully after evidence retention. Listing confirms only default main remains. Before deletion all fixture users/profiles/scouting rows/operations/deliveries, cron jobs and queued HTTP requests were zero. Production project `pbuogcrhdywpzvcxbwsd` remains read-only under current authorization.

`tools/sql-harness/scouting-hosted-proof.mjs --emit` retains the rollback-only staging proof and refuses a populated target. `STAGING.md` records empty-branch fixture corrections, advisor scope, deployment hashes and the network blocker. Do not assume an initial empty branch catalog means copying has completed.

## Continue

Fetch the review branch without force-pushing. Run `npm ci`, `npm test` (use `-- --maxWorkers=1` under heavy local contention), `npm run build`, `npm run connector:check`, `npm run ds:audit`, `npm run discord:calendar:test`, `npm run history:verify`, the retained browser/SQL/PWA/Deno commands in `RELEASE.md`, and the math/portable-review checks. No lockfile or existing pinned dependency changed in this continuation. `FIELD_GUIDE.md` is the event-day operating guide; `FOOTAGE_CORPUS.csv` deliberately leaves all six real-recording selections blank. The npm 10 nested-esbuild repair remains preserved.

The review branch and GitHub source ZIP are the portable checkpoint; cloning the branch restores Git history. Complete the specific external acceptance gates before claiming competition readiness.
