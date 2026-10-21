# Scouting verification — October 21, 2026

Code is on `codex/scouting-2026-evidence`, [draft PR #4](https://github.com/FRC-Team-5669-Techmen/frc-app/pull/4). Software and isolated hosted SQL checks pass. **Immediate competition acceptance remains blocked** by hosted HTTP access, physical-device/human/source gates and production release authorization. No production database change, deployment, main push or real Discord send occurred.

## Executed results and exact scope

| Check | Actual evidence |
| --- | --- |
| Latest application code | `7a1ddcab51324076dc93cf8fb2d3c6691608799b` |
| Unit/DOM | **971/971, 65 files**; complete one-worker rerun and independent CI. An oversubscribed parallel run timed out in an unrelated reporting-date test; no timeout or expectation was weakened |
| Build | Passed; **145** precache entries, **1928.08 KiB** local / **1928.20 KiB** CI |
| Full Chromium regression | **1766/1766, 15 features** at `7240bcb`, 375px touch emulation and 1440px desktop |
| Latest focused scouting browser | **150/150** after the filename fix and Nexus demo/offseason-key correction; includes all eight practice flows and map/offline recovery |
| Check-in | **51/51**, both widths |
| Fresh native PostgreSQL 17.6 | Chain applied twice; **573/573** SQL assertions, **17/17** mutants caught, **7/7** separate-connection races |
| Hosted Supabase PostgreSQL 17.11 | Isolated data-free branch; 0022 applied twice; **72/72** rollback-only SQL/RLS assertions with SQL-injected request claims; zero fixtures after rollback |
| Built PWA/API | **22/22**: actual build, Chromium/service worker/IndexedDB/Supabase JS, local PostgREST/native PostgreSQL. Auth is synthetic; the real map adapter receives fictional Nexus geometry |
| Actual local Deno entrypoints | Both pass `deno check`; **12/12 HTTP boundaries**, Deno 2.9.6 / TypeScript 6.0.3 / pinned Supabase JS 2.106.2. Rejecting local Auth stand-in; no external network permission |
| Hosted Edge deployment | Both functions ACTIVE, version 1, **verify_jwt=true**, in isolated staging. Metadata is not a successful function invocation |
| Connector/design/calendar/history | Current registry (174 calls, 172 reachable, 23 tools, zero direct client writes); 36 aliases × 3 grounds / 79 components / 315 files; **19/19** calendar engine; 50 original history entries byte/SHA-identical |
| Math/portable review | **13** independent synthetic math assertions; all five actual-route tabs, manager/parent boundaries and fictional map download pass under DOM/IndexedDB emulation |
| GitHub CI | [Run 39614483372](https://github.com/FRC-Team-5669-Techmen/frc-app/actions/runs/39614483372) **passed**, Node 22.23.3/npm 10.9.9; actual logs confirm 971 tests and all required gates |

The full run's source predates only the filename/provider-key corrections; the latest focused browser, build, complete unit suite, PWA, Deno checks and CI cover those changes. Earlier native PostgreSQL 16.10 proof remains historical evidence (same unchanged SQL), not a fresh repeat. No general application type-check gate exists; the Deno check is specific to the two Edge entrypoints.

## Capability evidence

W1 claims versus observations, W2 assignments/footage, W3 conversations, W4 aggregation and W5 comparison rules are connected to independent expectations in `EVIDENCE.md`, `CONTRACT.md` and `acceptance-oracles.md`. SQL/native/HTTP/browser checks cover authorship, unknown versus zero, correction history, conflicts, idempotent retry and role denial, including the connector. Provider/Discord failures are modeled and labeled; actual sends are not claimed.

Nexus v1.8.0 geometry expectations were fixed in `PIT_MAP.md` before implementation: example A1 top-left **(20,970)** and wall start **x=0**. The Techmen renderer includes areas/walls/labels/arrows, text directory, zoom/rotation/search, independent pit-report contradictions, explicit key/time and durable offline cache. Failed schema/provider/storage refreshes preserve the old map. Source text never becomes SVG/HTML markup. Demo/offseason maps do not widen TBA roster-import permissions.

Training retains its eight missions, 180-minute facilitation plan, 27 interactive decisions, six simulations, partner/real-footage tasks and frozen first-pass/appended-review workbook. Browser completion uses simulated partner acknowledgments; it neither measures hours/proficiency nor awards IDEA certification.

## Detectable failures and corrections

The checks exposed a stale generated connector registry, a missing browser wait after reauthentication and a portable esbuild filename collision. The registry/test were corrected and `pitMap.js` became `pit-map-model.js`. A staging-command mistake briefly pushed the rename before its imports; the corrective commit and final CI include both. The final parallel unit run's unrelated reporting-date timeout was resolved by a full one-worker rerun, with no test weakening. Initial failure logs are retained.

Hosted fixture preparation initially lacked copied Auth triggers/profiles and the connector singleton; the first full proof failed 40/41 (70/72). Explicit rollback-only fixture setup fixed those prerequisites, and the retained emitter now passes all 72. This was actual hosted SQL/RLS, not hosted Auth.

## Remaining blockers

- **Hosted HTTP:** workspace proxy refused staging HTTPS (CONNECT 403); no bypass attempted. GoTrue login, deployed REST/gateway behavior, private API-schema exposure, representative live providers and real delivery remain unverified.
- **Field/human/source:** no real iPhone/Android storage/backgrounding proof, novice completion timings/errors, mentor assessment, fixed annotated real-match corpus or original TideScout audiovisual/current-app comparison. No claim of latest TideScout parity. `FIELD_ACCEPTANCE.csv`: 13 NOT_RUN, three PARTIAL.
- **Release:** production still has zero scouting tables/functions or scouting Edge Functions. Explicit authorization is required to install/deploy production or send real Discord messages. Automatic review-preview builds do not install services.

`STAGING.md` and its retained JSON document the actual hosted proof, advisor findings and cleanup. The temporary branch was deleted after evidence retention; all fixture/data/HTTP queues were zero. No scouting function had a SECURITY DEFINER advisor warning; the operations table's no-policy INFO is intentional service-only access. Existing non-scouting advisor warnings were preserved for separate review, not declared cleared.

See `verification/README.md`, `RESUME.md` and `RELEASE.md` for portable commands, exact code boundaries and the concrete continuation/release packet.

---

## Historical checkpoint evidence

# Verification record

Local implementation checkpoint verified October 21, 2026. This records checks actually executed, not production acceptance. Browser, staging and field gates remain open.

## Environment and provenance

- Repository baseline: `9bb3a07321f6fc8a298835e0ec31fc193e106111`, fetched October 20, 2026 (Pacific).
- Branch: `codex/scouting-2026-evidence`. No main or integration changes requested.
- GitHub repository permission reports push access. No open PR or scouting work was found in fetched branches/ledger.
- `npm ci --no-audit --no-fund`: 499 packages installed successfully.
- Supabase read-only catalog query: existing profiles, events, event_roles, member_permissions and connector_audit present; no public scouting objects. This is not a live RLS test. No live data changes made.
- Vercel project list found frc-app; detailed project request returned HTTP 403 for team scope. No Vercel CLI installed. Deployment settings and preview/live deployment unverified.
- Original video metadata retrieved, original frames/audio unavailable so far. See evidence matrix.
- Real iPhone/Android, human completion time and annotated real match ground truth cannot be established by browser emulation or fixtures. They remain required field acceptance checks.

## Independent expectations

See `EVIDENCE.md`, `CONTRACT.md`, math fixtures and acceptance mapping. No historical test totals from the handoff are reused as results.

## Completed local checks

| Check | Actual result |
| --- | --- |
| Final combined `npm test` | 61 files; 934/934 tests passed |
| `npm run build` | Passed; fresh output has 144 precache entries (about 1.9 MiB) |
| Connector generation and check | Passed; 173 called functions, 171 reachable, 23 tools, zero direct table writes |
| Design-system audit | Passed; 36 aliases across 3 grounds, 79 components, 315 files |
| Discord calendar regression | 19/19 passed |
| Historical content preservation | 50 original entries byte/SHA identical |
| Independent mathematical oracles | 13 assertions passed |
| React DOM workflows | 21 tests passed, included in combined suite |
| Compiled portable review | All five tabs, mentor planner and parent denial render; zero script errors under DOM/IndexedDB emulation |
| PostgreSQL 18.6 WASM (PGlite) | Full migration chain through 0022 applied twice; 72 new SQL checks, 17 permissive mutants and 573 checks across 23 rollback RLS suites passed |
| `git diff --check` | Passed |

React DOM checks use jsdom and fake-indexeddb, including a native-dialog stub. They verify behavior under emulation, not browser layout or phone usability. PGlite is a single-connection WASM PostgreSQL runtime; it does not establish native PostgreSQL16, PostgREST or concurrent-connection correctness. See database-status.md and browser-status.md for reproducible commands and boundaries.

## Blocked and unfinished gates

- GitHub branch creation: HTTP403, Resource not accessible by integration. Shell push lacked credentials. No remote branch or PR created.
- Vercel detailed project access: HTTP403. No preview or production deployment.
- Chromium installed, but launch failed with socket EPERM. Automatic approval review rejected sandbox escalation. No rendered browser or real-device acceptance claimed.
- Native PostgreSQL16 harness unavailable; no live Supabase mutation or staging acceptance.
- Original video frames/audio, real annotated match corpus, provider behavior, real-device interruption recovery and measured beginner usability remain unverified.
- Additional product fidelity gaps and next actions are listed in RESUME.md. No real Discord notifications were sent.

The portable checkpoint contains the implementation, Git history, source evidence, test instructions and private original handoff (outside the public source tree). It is a continuation artifact, not a production-ready release.


## Continued build (October 21)

The final combined run includes reviewed shift planning with atomic local batch saves, eligible roster reads, immutable same-event/team pit replies, side-by-side evidence, pit-location provenance, persisted interactive practice, pick-list drafts, completed-assignment corrections and account-change sync recovery. The actual React screens are packaged in a network-disabled portable review, with separate release instructions and a prepared PR description.

The requested interface visual is a static rendering of the actual React DOM using a print renderer with compatibility CSS. It is not a Chromium screenshot and must not be cited as a layout acceptance test.

## Resumed reliability review (October 21)

Added complete device/event exports, atomic local team imports, prior-event footage source boundaries, coverage filters, canonical short/full current-event match identity and direct offline-cache opening. Final combined run: 934/934 tests across 61 files. The 21 rendered DOM tests include prior-event capture, import failure/retry and backup success/failure. Database: 72/72 scouting checks, 17/17 permissive mutants caught, 573/573 checks across 23 SQL files, with two migration passes.

A stale local output directory inflated one PWA cache measurement. A fresh `npm run build -- --outDir artifacts/scouting-production-check` generated 144 precache entries (1907.64 KiB); a subsequent standard-output build removed an intentional stale-file probe and left only the current assets. This does not establish device cache behavior. No deployment or live data was touched.
