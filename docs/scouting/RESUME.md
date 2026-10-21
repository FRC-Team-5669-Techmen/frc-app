# Resume Team 5669 scouting

**Branch:** `codex/scouting-2026-evidence` · [draft PR #4](https://github.com/FRC-Team-5669-Techmen/frc-app/pull/4). **Current continuation:** the hosted HTTP conflict fix described in `HOSTED_HTTP.md`; `db990e5` is the previous application checkpoint. Preserve the restored history and newer main `0a11c52` (merged as `f3518cf`); do not rebuild from main. Read `SCOUTING_START_HERE.md`, `CLAUDE.md`, `docs/subsystems/scouting.md`, `VERIFICATION.md` and `RELEASE.md`. Private original inputs stay outside public commits.

## Complete, verified and still blocked

| Requirement | Status and boundary |
| --- | --- |
| Claims, observations, assignments, pit conversations, individual/master lists and comparison preview/apply | Implemented. Final scouting browser, unit/DOM, local API and SQL/RLS checks pass. Techmen formulas remain distinct from undisclosed TideScout behavior |
| Offline capture/recovery | Durable actor/event-scoped drafts, queue, cache, export and reviewed held-proposal import. Conflicts/lost receipts/denial preserve work. Final built-PWA recovery checks pass; prior 39-cycle/2340-second soak remains separately labeled historical evidence |
| Confirmed evidence | Pending corrections retain the previous confirmed vote/rate/coverage; newer confirmed receipts survive failed refresh. Definitive authorization denial hides retained evidence until access is restored |
| Complete observation review | All downloaded observations searchable/pageable, with attributed correction history and current/prior/disputed/unverified-video filters. Unknown video scope is excluded from current rates/coverage until corrected; live observations with reference links remain eligible |
| Match briefing | Explicit six-team lineup, opening/roles/endgame/fallback plan, confirmed evidence/uncertainties, durable local drafts, reviewed frozen JSON/print exports. Evidence/plan changes invalidate review. Raw evidence remains auditable; no win prediction or automatic sharing |
| Large events and pit navigation | Complete paginated loading, full-roster search with paged cards; 120-team synthetic case. Nexus v1.8.0 maps/directory/zoom/rotation/freshness and offline cache implemented; actual venue/phone acceptance remains open |
| Extensive training | Eight missions, 180-minute facilitation plan, 27 decisions, six simulations, partner/footage tasks and frozen/reviewed workbook. All software workflows pass. Human timing/proficiency and annotated real footage remain unverified; IDEA Classroom retains certification authority |
| Integrations and production | Local transport/permission/failure checks pass. Real isolated GoTrue password/refresh, JWT/PostgREST permissions and deployed Edge boundaries now pass. OTP/Google OAuth, provider success and actual delivery remain unverified. No production deployment/database change/main push/real Discord send authorized or performed |
| Source fidelity | Evidence matrix/rule and API pins/independent expectations retained. Current TideScout audiovisual/app parity remains unknown; proposed Techmen decisions are labeled |

## Current verification

Hosted continuation: **1031 unit/DOM tests; 55 real hosted HTTP assertions; 72 hosted rollback SQL/RLS assertions; native PostgreSQL 17.11: 72 SQL checks, 17 mutants and seven races.** Current 0022 uses PT409 to avoid the PostgREST 14 retry loop. Conflict review now waits for refreshed server context; a controlled delay test fails the previous state ordering and passes the fix. Build/connector/design/calendar/history and portable-review checks pass. `HOSTED_HTTP.md` and `VERIFICATION.md` retain failures, runtime/source boundaries and cleanup. Final scouting: **169/169**; built PWA/local API: **33/33**; check-in: **51/51**. The broad run passed all 1632 assertions in 14 unaffected modules but failed one scouting review assertion (1800/1801); the focused rerun after the state-ordering fix restores all 1801 expected feature coverage across explicit source boundaries. Do not describe that broad run as passing.

Previous decision-support checkpoint (historical):

**1028/1028 tests; 1801/1801 Chromium assertions in two serial batches across 15 features (including 169 scouting); 46 new decision-workflow assertions; 28 built-PWA/local API checks; 10 permissive decision controls; 72 SQL/RLS assertions, 17 SQL mutants and seven races; 51 check-in assertions; 20 automated accessibility scans; build/connector/design/calendar/history and portable-review gates pass.** Independent GitHub CI 136 passed at `db990e5`. The native-clock targeted run passed 619 assertions before the remaining-feature batch. Source/runtime scopes and failures are in VERIFICATION.md and the hashed artifacts. The synthetic volume check ran before the denial/provenance and print-only follow-ups; its source boundary remains labeled.

Initial broad runs had 3 and 1 failure(s), including loading/action timing failures in different modules. A third serial attempt at `75fad88` also failed navigation and was cancelled; concurrency is not a proven cause. The final harness fixes business dates and keeps animation/retry timers native, with a standalone positive/negative clock control. No assertion or actionability/navigation timeout was weakened. The final two disjoint batches used the committed application unchanged and collectively passed all expected per-feature counts. This is complete feature coverage, not a claim that the earlier single-process run passed. Do not erase the failed-run evidence or infer a proven root cause.

## Owner handoff

The AI owns technical setup and verification. `YOUR_CHECKLIST.md` now begins with the actual remaining access issue: both connected Vercel accounts can list frc-app but return a team-scope 403 when inspecting project `prj_eDfnffVycoAO4YJIfKY9SiBaDMwR` in team `team_t21qnb2a8oRqQy7beqKF5LZJ` (**mrpina-s-projects**). No team-authorization tool or CLI credential is available. The prior workspace-network blocker is resolved; do not ask the owner to repeat that correction. Prepare a new isolated backend and verified preview only after Vercel team access works, then assign phone drills. The HTTP verification branch was deleted after cleanup to avoid unattended compute.

## Specific external blockers

- Vercel team-scope access blocks an isolated shareable app preview. TBA/Nexus server keys are inaccessible in the test branch; actual endpoints return 401 without keys. Public Statbotics returned HTTP 500 with [] for two event keys. Provider success, school Google OAuth/email OTP and bot/channel configuration remain open; workspace HTTPS is reachable.
- Real iPhone/Android interruption/storage recovery, beginner measurements, mentor assessment, drive-coach/alliance-partner rehearsal and independently annotated actual footage require unavailable people/devices/artifacts. FIELD_ACCEPTANCE.csv has 16 NOT_RUN, two PARTIAL and one PASS gate; FOOTAGE_CORPUS.csv keeps six real recordings unselected.
- Original YouTube watch URL still receives proxy CONNECT 403, although application/provider hosts are reachable. No bypass was attempted. TideScout audio/frames/current-app exports remain unavailable. Latest-version parity is not established. No invented AI parsing, role pings or undisclosed ranking formula.
- Production release and real notifications require separate explicit user authorization. RELEASE.md is the concrete apply/recovery packet; no routine implementation permission is needed.

## Continue and reproduce

Fetch the review branch without force-pushing. Run `npm ci`, `npm test -- --maxWorkers=1`, `npm run build`, `npm run connector:check`, `npm run ds:audit`, `npm run discord:calendar:test`, `npm run history:verify`, `npm run test:checkin`, `npm run test:features`, and `npm run scouting:preview:check`. Run long browser suites one at a time; expected current full-feature total is 1801. `node tools/e2e/scouting-decisions.mjs` checks 23 assertions at each width; `node tools/e2e/scouting-decision-controls.mjs` must detect ten permissive mutations. Native SQL/PWA/Edge commands and exact boundaries remain in RELEASE.md/VERIFICATION.md.

The branch is the durable code/history checkpoint; the commit ZIP is portable source. Brief drafts use the existing `match-brief` actor/event key and are included in event backups. Exports are frozen local copies, not shared database plans. No dependency pin or lockfile changed in this continuation. Decision-support evidence was consolidated at 2026-10-21T17:44:31.273120+00:00; the later HTTP evidence is separately retained.

Both temporary hosted branches (`scouting-2026-verification`, project `ghznodbtpvxlsyevmkla`, and the later `scouting-2026-http-review`, project `cctevrqiuqdiswkgghwo`) were deleted after evidence retention; fixture data/jobs/requests were zero. Production `pbuogcrhdywpzvcxbwsd` remains read-only under current authorization. See STAGING.md for exact hosted-vs-SQL limitations.
