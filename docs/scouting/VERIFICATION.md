# Active continuation verification — October 21, 2026

This section supersedes the historical access blockers below. Review branch `codex/scouting-2026-evidence` is pushed and [draft PR #4](https://github.com/FRC-Team-5669-Techmen/frc-app/pull/4) is open. The checkpoint tree exactly matched bundled commit `b7c27bb`; remote main remains `9bb3a07`. No private source handoff is committed.

Executed in this continuation so far:

- Initial baseline: 934/934 unit/DOM tests, production build, connector/design/calendar/history and 13 independent synthetic math assertions passed.
- Real Chromium fixture scouting after accessibility/queue fixes: **104/104**, 375px touch emulation and 1440px desktop; check-in regression **51/51**. These are browser results with a fictional backend, not phones or live services.
- Native PostgreSQL **16.10**: migrations applied twice; **573/573** checks across **23** SQL suites, including **72/72** scouting checks; **17/17** permissive mutants caught. New separate-connection races: **7/7** assertions passed.
- Built production PWA → Supabase JS → local **PostgREST 13.0.7** → native PostgreSQL: **17/17** assertions passed. Synthetic local Auth tokens/refresh endpoint. Actual browser network disable, cold deep link and installed start URL, expired-session local capture, native IndexedDB reload, deliberately truncated HTTP response after commit, retry deduplication, parent/direct-write denial and connector HTTP preview/commit/denial. No fixture RPC implementation is used by this check.
- Offline-recovery milestone: **937/937** unit/DOM tests in **62** files; production build (**145** precache entries, **1912.00 KiB**), connector registry, design audit, 19/19 calendar checks and lossless 50-entry history check passed. Subsequent changes require fresh final verification.

The built-PWA test first failed cold navigation (2/3 passed). The retained harness then passed after a scouting navigation fallback and a device-local prepared identity entry were implemented. Textarea/select names and initial queue loading were also corrected from browser failures. These failures are recorded as defects found, not passing verification.

Still external/unverified: hosted Supabase Auth/deployment/configuration, deployed Edge Functions, representative provider responses, authorized real Discord delivery, physical iPhone/Android backgrounding/storage behavior, beginner task measurements, independent real-match annotations and original reference audio/frames. Production use is not yet accepted. No production deployment, live database change, main push or real notification occurred.

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
