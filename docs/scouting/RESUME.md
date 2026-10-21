# Resume Team 5669 scouting

**Branch:** `codex/scouting-2026-evidence` · [draft PR #4](https://github.com/FRC-Team-5669-Techmen/frc-app/pull/4). Read `SCOUTING_START_HERE.md`, `CLAUDE.md`, `docs/subsystems/scouting.md`, `VERIFICATION.md` and `STAGING.md`. Continue the restored checkpoint history; do not rebuild from main. The private original inputs stay outside public commits.

## Current application: `75fad888b88c3c2a8e547b74342a64a9c0906889`

A final provenance audit found legacy video with unknown event scope still contributed to rates despite its uncertainty label. The new candidate excludes it from current rates/coverage, adds a review filter and explicit brief/comparison exclusions, and preserves raw records. Independent 0/1 versus 1/2 cases, a permissive filter mutation, and native browser checks protect the correction. **1028 tests**, **46 decision-workflow browser assertions**, **10 permissive mutations** and build/connector/design/calendar/history gates passed. The final candidate's built-PWA rerun passed 28/28, final accessibility passed 20/20, and independent CI 130 at resume-only follow-up `6493e9a` confirmed 1028 tests/build/required gates. Two broad attempts had 3 and 1 failures respectively in different cases; their results are retained, not counted as green. The predecessor's scouting phase passed 169/169. A complete serial run of the final application began at 17:02:18 UTC, with all other local test suites finished. Current expected per-feature totals sum to 1801 (the old 1789 total predates newer main). Let that run finish, inspect every result, then consolidate the final verification and ZIP. No timeout/assertion/actionability requirement has been relaxed. See local `/workspace/work/decision-serial-status.json` if this execution workspace persists, or rerun `node tools/e2e/features.mjs --port 5401` alone from the review branch.

Before concluding: manual PDF review found `printableBrief` displays the numeric cache timestamp directly. After the frozen serial gate finishes, format that print-only timestamp as readable UTC while preserving the raw JSON value, rerun relevant export/build/unit checks, and record the final tiny source difference explicitly. Do not edit the application during the running serial gate.

## Previous candidate: `8fef9330a0fdb9677dc7231c9dfba7bcd7b68ee9`

Implementation `09dab54` adds separate confirmed/optimistic projections, full observation history/dispute triage and local drive-team briefs with explicitly confirmed six-team lineups, frozen JSON/print exports and stale-review invalidation. Follow-up `8fef933` hides retained receipts and editing controls after definitive authorization/account failure while preserving local work. `DECISION_SUPPORT.md` records Techmen provenance and acceptance criteria. No schema, auth protocol, connector, provider or dependency changes.

Current checks: **1024 tests**, independent **CI 126**, **40 decision-workflow Chromium assertions**, **nine** permissive scope/confirmation/denial mutations, **28 built-PWA/local API checks**, **72 SQL/RLS assertions + 17 mutants + seven races**, and **51 check-in assertions** passed. Twenty automated accessibility scans and both 120-team volume cases passed before the final denial-only guard. The original scouting browser suite passed 169 assertions before that guard. The broad run hit one announcements loading timeout; its isolated rerun passed 125/125. A full clean-checkout repeat is still running at this checkpoint; do not claim full browser regression is green until its summary is retained.

The current branch is pushed and draft PR #4 remains the delivery path. Brief drafts use the existing actor/event-scoped `match-brief` key and are included in event backups. Exports are frozen copies, not shared database plans or win predictions. New field gate P19 requires actual drive-coach/alliance-partner acceptance. Exact scopes, initial failures and remaining release gates are in VERIFICATION.md; older counts below are historical.

## Previous October 21 extended implementation (historical)

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
