# Current browser verification — October 21, 2026

Installed **Chromium 154.0.8037.57** runs in the resumed cloud environment. The historical socket blocker below no longer applies.

- `npm run test:features`: **1749/1749**, all **15** features, at 375px touch emulation and 1440px desktop.
- Scouting within that run: **129/129**, including all eight training missions, first-pass/review history, export, actor isolation, conflicts and 44px control/overflow checks.
- `npm run test:checkin -- --port 5402`: **51/51**.
- `tools/e2e/scouting-pwa.mjs`: **19/19** against a real production build, service worker, IndexedDB, Supabase JS, local PostgREST and PostgreSQL 17.6. Actual browser network disable, expired-session cold start, installed start URL, truncated committed HTTP response and page closure before receipt are exercised. Auth issuance is synthetic; functions have a not-configured stub, and no provider/Discord request is made.

The final clean-install focused repeats are retained with the logs. These are native browser results, not physical iPhone/Android or first-time student usability. Complete real-device/mentor/source gates before claiming competition readiness.

Reproduce:

```sh
npm ci
npm run test:features
npm run test:checkin
# PostgreSQL and PostgREST must be installed for the disposable integration test:
POSTGREST_BIN=/path/to/postgrest node tools/sql-harness/run.mjs --tests none --node tools/e2e/scouting-pwa.mjs
```

The fixture suite models API behavior and keeps the development server reachable during its simulated offline sections. The built-PWA test separately disables real browser networking. Neither uses hosted Supabase Auth, actual external providers, NFC hardware, an installed phone PWA or a human scout. See `VERIFICATION.md` and `verification/README.md` for executed results.

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
