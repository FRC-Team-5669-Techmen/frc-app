# Current decision-support browser verification

See `VERIFICATION.md` and `verification/2026-10-21-decisions/` for final `db990e5` results: 1801 feature assertions across two disjoint serial batches, 46 decision-workflow assertions, 28 built-PWA/local API checks and 20 automated accessibility scans. The earlier full-process failures remain retained; their cause is unproven. Native Chromium/touch emulation and synthetic data do not establish actual-phone or human acceptance.

---

# Extended recovery/browser checks — October 21, 2026

Current-source and prior-source runs are separated in `VERIFICATION.md` and `verification/2026-10-21-recovery/`. New checks cover reviewed JSON recovery, native dialog focus, large-event paging and an elapsed-duration offline/reload/reconnect soak. These remain native Chromium with synthetic Auth/fixture data, never physical-device or human acceptance. The results below are the earlier checkpoint and must not replace the current report.

---

# Earlier map checkpoint — October 21, 2026 (historical)

Chromium 154.0.8037.57 ran the real app at 375px touch emulation and 1440px desktop. **1766/1766** assertions across 15 features passed at map commit `7240bcb`. After the filename/provider-key corrections, **150/150** focused scouting assertions passed at application commit `7a1ddca`. Check-in passed **51/51**. No physical-phone claim follows from those widths/user agents.

The built production PWA passes **22/22** with an actual service worker, IndexedDB, expired-session cold entry, disabled browser networking, lost committed HTTP body, page closure/lease recovery, cached map and real local PostgREST/PostgreSQL. Auth issuance is synthetic. The real map adapter receives fictional Nexus data; other functions are not configured. No live provider/Discord request is made.

`npm run scouting:preview:check` also passes all five actual-route tabs, manager/parent boundaries and a fictional map download under DOM/IndexedDB emulation. It establishes portable compilation, not layout or phone behavior.

Retained commands/results are in `verification/2026-10-21-competition/`. Reproduce with `npm run test:features`, `npm run test:checkin`, and the native/PostgREST PWA command in `RELEASE.md`. `STAGING.md` records the separate hosted SQL proof and HTTPS proxy blocker. Hosted Auth/API, actual phones and novice/mentor acceptance remain unverified.

---

## Historical checkpoint record

# Browser verification status

Session date: October 20, 2026 (client calendar, America/Los_Angeles).

**Not verified:** browser layout, touch-target sizes, first-time scout completion time, real iPhone/Android use, and the end-to-end scouting browser workflows. The executable acceptance spec exists; its presence is not a passing result.

## What ran

- `npx vitest run tests/fixture-seed.test.js tests/fixture-routes.test.js`: **30/30 tests passed** after migration 0022 was present. This validates the fixture catalog/seeds and route inventory, not rendered UI or production SQL.
- JavaScript syntax checks passed for `src/dev/fixture/features/scouting.js` and `tools/e2e/features/scouting.mjs`.
- A Chromium launch probe and the actual `tools/e2e/features.mjs --only scouting` command were attempted. The test runner reported **0/1 passed** because it failed before any browser assertions ran.

## Exact environment failure

No Chromium was initially installed. The Playwright CDN downloader returned truncated archives. Downloading the official Chrome for Testing archive directly from Google succeeded, producing Chrome **151.0.7922.34** at `/tmp/scouting-browser/chrome-linux64/chrome`.

Chromium then aborted before opening a page:

```
FATAL:chrome/browser/process_singleton_posix.cc:297
socket() failed: Operation not permitted (1)
```

The execution sandbox disallows Unix sockets. An explicit request to run the local-only launch probe outside that sandbox was automatically rejected by the configured approval policy (`sandbox_approval: false`). No attempt was made to bypass that restriction. No local user browser tabs were opened.

## Rerun in a browser-capable checkout

```bash
npm ci
npx playwright-core install chromium
npm run test:features -- --only scouting
npm run test:checkin
npm run test:features
```

If Chromium is installed elsewhere, set `CHROMIUM_PATH` to its actual executable. The existing test runner supports it.

`tools/e2e/features/scouting.mjs` covers both 375px touch emulation and 1440px desktop rendering. It asserts actual stored fixture records for explicit unknown states, draft recovery, simulated offline capture and reload, account-isolated queues, reconnect/retry deduplication, message delivery failure, comparison preview/cancel/apply, correction conflicts and review, staff/parent gates, and missing migration behavior. It measures visible control heights and horizontal overflow and saves screenshots through the repository harness.

The offline section deliberately overrides browser connectivity while serving the development app locally. It tests queue behavior and browser IndexedDB persistence. It does not prove that an installed production PWA can cold-start without network, or that iOS preserves a backgrounded browser. Fixture RPCs model the interface; SQL/RLS and real external integrations require separate tests.

Real-device usability still requires a person using an actual iPhone and Android device, with recorded completion times, errors, interruptions, and recovery. Automated browser timings must not be reported as student usability measurements.
