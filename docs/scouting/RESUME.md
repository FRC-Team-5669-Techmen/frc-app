# Resume Team 5669 scouting

**Branch:** `codex/scouting-2026-evidence` · [draft PR #4](https://github.com/FRC-Team-5669-Techmen/frc-app/pull/4). Read `SCOUTING_START_HERE.md`, `CLAUDE.md`, `docs/subsystems/scouting.md`, `VERIFICATION.md` and `STAGING.md`. Continue the restored checkpoint history; do not rebuild from main. The private original inputs stay outside public commits.

## October 21 follow-up in progress

User requested at least another hour. Reviewed pending-save recovery and draft race/read-failure protections are implemented; see `RECOVERY.md` and `docs/history/scouting-reviewed-recovery.md`. Current targeted DOM/storage checks and the first expanded browser/PWA runs pass; final full-source gates and elapsed-duration testing are being run. Do not inherit the earlier counts below as verification of this new continuation. No database or provider contract changed.

## Implemented, verified and blocked

| Requirement | Current state |
| --- | --- |
| Pit claims, observations, assignments, planning, replies, individual/master lists and comparison preview/apply | Implemented; browser, SQL/RLS and independent math checks pass. Formulas are explicit Techmen rules, not claimed 4414 algorithms |
| Offline capture/recovery | Durable actor-bound queue/cache, cold/expired-session entry, conflicts, lost-response/page-closure recovery and export verified in the built PWA |
| Pit navigation | Nexus v1.8.0 geometry, searchable directory, zoom/rotation, source conflicts/freshness and offline caching implemented; demo/offseason keys supported with bounded validation. Exact TideScout presentation unknown |
| Extensive training | Eight missions, 180-minute facilitation plan, 27 decisions, six simulations, partner/footage practice and frozen/reviewed workbook. All software flows pass; real novice timing and mentor proficiency remain unverified. IDEA Classroom retains certification authority |
| Integrations/connector | Local transport/permission/failure paths pass. Both Edge Functions deployed successfully in temporary hosted staging with JWT verification on. Representative live providers, hosted Auth/API and real delivery remain unverified |
| Hosted database | 0022 applied twice in isolated Supabase PostgreSQL 17.11; 72 rollback-only SQL/RLS checks passed. SQL-injected identities do not prove hosted Auth. Temporary branch deleted after retaining evidence |
| Production | Read-only postcheck still finds no scouting objects/functions. No production installation, deployment, main push or real notification authorized |
| Source fidelity | Evidence matrix, rule/API pins, independent examples and deliberate deviations retained. Original audiovisual/current-app parity and annotated real-match corpus remain external gaps |

Latest application code is `7a1ddca`. Actual results: **971/971 tests (65 files), 150/150 latest scouting Chromium assertions, 22/22 built-PWA assertions, 12/12 local Deno HTTP checks, 573/573 fresh native PostgreSQL 17 SQL checks, 17/17 mutants, 7/7 races, 72/72 hosted staging SQL checks and 51/51 check-in assertions**. The broader **1766/1766** run covers all 15 features at map commit `7240bcb`; the later filename/provider-key changes were covered by the latest focused suite and CI. GitHub CI 115 passed at `7a1ddca` on Node 22/npm 10 with 971 tests. See retained logs for exact source/runtime boundaries.

## Specific external blockers

- Staging HTTPS was denied by the managed workspace proxy (CONNECT 403). There is no network-policy editing tool in this session. Do not bypass the proxy. Hosted Auth/REST/gateway and source-provider acceptance need an approved environment with staging HTTPS access.
- Real iPhone/Android backgrounding/storage recovery, beginner measurements, mentor assessment and independently annotated actual footage require people/devices/artifacts unavailable here. `FIELD_ACCEPTANCE.csv` has 13 NOT_RUN and three PARTIAL gates; none is silently marked passed.
- Original TideScout audio/frames/current app exports remain unavailable. Latest-version parity cannot be asserted. Role pings remain absent pending a reviewed mapping; AI parsing was not invented.
- Production installation and real Discord sends still require the user's explicit release authorization. `RELEASE.md` is the concrete apply/recovery packet.

## Staging cleanup and reproducibility

Temporary branch `scouting-2026-verification`, project `ghznodbtpvxlsyevmkla`, branch ID `94b80d0d-16ed-47c6-848c-3890b5539a09`, was deleted successfully after evidence retention. Listing confirms only default main remains. Before deletion all fixture users/profiles/scouting rows/operations/deliveries, cron jobs and queued HTTP requests were zero. Production project `pbuogcrhdywpzvcxbwsd` remains read-only under current authorization.

`tools/sql-harness/scouting-hosted-proof.mjs --emit` retains the rollback-only staging proof and refuses a populated target. `STAGING.md` records empty-branch fixture corrections, advisor scope, deployment hashes and the network blocker. Do not assume an initial empty branch catalog means copying has completed.

## Continue

Fetch the review branch without force-pushing. Run `npm ci`, `npm test` (use `-- --maxWorkers=1` under heavy local contention), `npm run build`, `npm run connector:check`, `npm run ds:audit`, `npm run discord:calendar:test`, `npm run history:verify`, the retained browser/SQL/PWA/Deno commands in `RELEASE.md`, and the math/portable-review checks. No lockfile or existing pinned dependency changed in this continuation. The npm 10 nested-esbuild repair remains preserved.

The review branch and GitHub source ZIP are the portable checkpoint; cloning the branch restores Git history. Complete the specific external acceptance gates before claiming competition readiness.
