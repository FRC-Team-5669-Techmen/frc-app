# Scouting verification — October 21, 2026

The implemented system is on `codex/scouting-2026-evidence`, [draft PR #4](https://github.com/FRC-Team-5669-Techmen/frc-app/pull/4). It is **locally verified, not accepted for immediate competition release**. Production has no scouting schema or scouting Edge Functions installed. No live database change, main push or real Discord notification occurred.

## Current executed results

| Check | Actual result and scope |
| --- | --- |
| Clean installation | npm 10.9.9 and npm 11.9.0 each install 538 packages; repaired missing nested esbuild entries without changing an existing pinned version |
| Combined unit/DOM suite | **940/940**, **63 files**, including original regressions and scouting cases |
| Production build | Passed; **145** precache entries, about **1.9 MiB** (local 1917.55 KiB; CI 1917.67 KiB) |
| Full Chromium feature regression | **1749/1749**, **15 features**, at 375px touch emulation and 1440px desktop |
| Scouting within that browser suite | **129/129**, including all eight practice missions, durable export and frozen/reviewed footage history |
| Check-in regression | **51/51**, 375px and 1440px |
| Native PostgreSQL 16.10 and 17.6 | Migrations applied twice; **573/573** checks across **23** rollback suites on each engine; **72** checks are scouting |
| Permissive database mutations | **17/17 caught** on each native engine |
| Separate-connection races | **7/7** on each native engine: same-operation receipt, exact counts, stale correction, retained winning history, logical observation uniqueness and single delivery reservation |
| Built PWA/API recovery | **19/19** on native Chromium, actual service worker/IndexedDB/Supabase JS, local PostgREST 13.0.7 and PostgreSQL 17.6; synthetic Auth issuance |
| Connector generation/check | Current; **174** functions called, **172** reachable, **23** tools, **zero** direct client table writes |
| Design audit | Passed: 36 aliases × 3 grounds, 79 components, 315 files |
| Existing calendar regression | **19/19** (test engine; no real sends) |
| History preservation | All **50** original entries byte/SHA-identical |
| Independent arithmetic | **13** hand-oracle assertions; synthetic fixtures |
| Portable review | Actual route/all five tabs, mentor planner, parent denial; zero script errors under DOM/IndexedDB emulation |
| GitHub Actions | [CI run 39578534065](https://github.com/FRC-Team-5669-Techmen/frc-app/actions/runs/39578534065) **passed** on Node 22.23.3/npm 10.9.9 at code commit `32b6b98`; actual logs confirm 940 tests and all five CI gates |

Current cloud runtime: Node 24.19.0/npm 11.9.0 and Chromium 154.0.8037.57 on Debian 13. Native server tooling is outside application dependencies. See [retained logs and assertion records](verification/README.md) and [browser status](browser-status.md) for commands and boundaries. A final focused scouting/PWA repeat after the repaired clean install is recorded beside these results.

## What each capability is actually verified against

| Capability / evidence lead | Independent expectation | Executed proof |
| --- | --- | --- |
| W1: pit claims and match verification | A1 hand fixture: 2/3 decisive matches, separate unseen/N/A/disputed data; corrected evidence replaces a trial | Math oracle, model/DOM tests, native SQL validation and Chromium explicit answer persistence |
| W2: Scout This and footage | A2 identity, authorship, prior-event provenance, one logical record and reviewed stale correction | Schedule/storage/provenance tests, native RLS/mutations/races and Chromium assignment/conflict workflows; real footage accuracy remains unverified |
| W3: stands-to-pit communication | A3 save independent of delivery, immutable thread/revision and one reservation | DOM/fixture flows, mocked dispatcher/API failures, native RLS and two-connection reservation tests. No live Discord delivery or full map-geometry parity claimed |
| W4: lists, filters and aggregation | A4 hand medians/support/DNP/unknown examples; explicit Techmen formula | Independent arithmetic/model tests, native author ownership and browser list workflows |
| W5: comparison preview/apply | A5 fixed selected-slot permutation, unchanged cancel and stale-write refusal | Oracle/model tests, Chromium stored-record assertions and native version checks |
| Offline recovery | Original operation/actor/body survive interruption; no second logical observation | Native races and actual built-PWA network disable, expiry, truncated committed response, page closure, lease recovery and reconnect |
| Beginner practice | All eight workflows can save/restore/export; first pass remains distinct from correction; no automatic certification | Chromium completes all missions with simulated partner acknowledgments, reloads workbook history and inspects the exported JSON; actual student proficiency is NOT tested |

TideScout workflow timestamps remain secondary leads, not observed original audiovisual behavior. Proposed Techmen formulas and deviations are in [EVIDENCE.md](EVIDENCE.md), [CONTRACT.md](CONTRACT.md) and [acceptance-oracles.md](acceptance-oracles.md).

## Defects found and corrected in this continuation

- Restored textarea/select names were unstable: explicit accessible names now survive reload and value changes.
- A cached event briefly said all work was synced before its queue loaded: event/queue opening now waits for durable queue state.
- Built offline deep links failed, and an expired session could trap startup: scoped service-worker navigation plus prepared local entry now recovers the event and installed start URL.
- A prepared identity alone could show the previous account offline: the gateway also matches the current locally stored session member and responds to sign-out/cross-tab changes.
- A page closed before its receipt left a `syncing` operation waiting indefinitely: an expiry timer automatically retries the original operation after restart.
- Practice could retain completion after a requirement was withdrawn, and first-pass footage could be overwritten: completion invalidates appropriately and the workbook freezes/appends evidence.
- npm 11 had tolerated an invalid nested esbuild resolution; npm 10 CI rejected it. The lockfile now includes the missing platform entries, and clean installs plus GitHub CI pass.

The PWA harness first failed cold navigation (2/3). The expanded browser run exposed the offline account mismatch (127/129). These are corrected failures, not passing evidence. Retained final checks show their positive and negative controls.

## Specific release blockers and fidelity gaps

1. **Production not installed.** A metadata-only query on the connected `frc-app` project found zero scouting tables/functions; neither scouting Edge Function is deployed. PostgreSQL reports 17.6. This is live catalog evidence, not live RLS/workflow acceptance. Applying SQL/deploying production/sending real Discord messages remains outside current authorization. Git pushes may produce automatic Vercel review previews; a successful preview build does not install services.
2. **Physical devices and beginners unavailable.** No real iPhone/Android backgrounding/storage test, first-time student completion time/error measurement or mentor proficiency assessment was executed. [FIELD_ACCEPTANCE.csv](FIELD_ACCEPTANCE.csv) remains NOT_RUN for those gates. The [180-minute training plan and rubric](TRAINING.md) are facilitation guidance, not measured practice or a passing threshold.
3. **Reference/recording access incomplete.** Original video frames/audio, an independently annotated real-match corpus and authorized current TideScout source/application/export comparison are absent. The newly discovered first-party technical binder is a documented lead, not a recovered current app contract. Latest-version parity cannot be asserted.
4. **Live integrations unverified.** Hosted Auth/PostgREST configuration, deployed Edge Functions, representative provider responses, actual channel/bot permissions and real delivery were not exercised. Local Auth issuance is synthetic, external failures are mocked and native cron/network/storage use repository stand-ins. Nexus map geometry and reviewed Discord role-ping mapping remain fidelity gaps; sourced pit addresses and respectful questions/replies are implemented.

The branch preserves the existing app, branding, roles, events, connector and check-in path. Private original inputs remain outside public commits. See [RELEASE.md](RELEASE.md) for concrete setup/recovery instructions and [RESUME.md](RESUME.md) for continuation. No completion claim here substitutes for the remaining external acceptance.

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
