# `tools/e2e/features/` -- the standing feature specs

`npm run test:features` runs every module here against fixture mode
(`src/dev/fixture/`): the real app, every real route and component, an
in-memory Supabase seeded with fictional people, no credential and no network.
It exists because every lane on 2026-10-01 checked its screens with a scratch
harness and then deleted it; each spec here is one of those checks, made
permanent.

```bash
npm run test:features                                   # every feature, 375 and 1440
node tools/e2e/features.mjs --only feedback,announce    # some features
node tools/e2e/features.mjs --port 5412 --verbose       # another port; every PASS line too
```

The runner (`tools/e2e/features.mjs`, documented at its top) boots or reuses a
fixture server for THIS checkout through `tools/e2e/lib.mjs`, and runs each
spec twice -- 375x812 (touch, `isMobile`, an Android Chrome user agent) and
1440x900 -- each time in a fresh browser context in America/Los_Angeles with
Playwright's clock installed at Thursday 2026-10-01 4:00 PM PDT. Every
assertion prints `PASS` or `FAIL` with its measurement (FAIL always, PASS with
`--verbose`), each feature prints `<feature>: N/N passed (375 and 1440)`, and
the run ends `features e2e: N/N passed (375 and 1440)`, exiting non-zero on any
failure. Screenshots of every state land in `artifacts/e2e/features/` and every
result in `artifacts/e2e/features/results.json`. A full run takes about five
minutes on this container.

## What each spec holds

| spec | feature, lane, migration | the claims, each asserted both ways |
| --- | --- | --- |
| `certifications.mjs` | `/certifications`, lane a, 0001 | mig none: only the not-set-up line for all five personas (against the ready page); counts equal an active-and-unexpired count computed from the store, and differ from a count-every-row count exactly where a suspended / revoked / expired / lapsed row sits; "Your certifications" by sign-in email (a row under another email is not yours); parent sees only the linked student and no counts (0 against 6); staff see the sync line and the refused attempt; the page only ever selects |
| `feedback.mjs` | `/feedback` and the widget, lane c, 0002 | export bar first and naming the count; tabs and five filters against the store; detail; markdown in one part and in numbered parts past 50,000 characters; a real zip (CRC-checked here and by `unzip -t`); bulk Done and an Undo restoring status, reviewer and time exactly; mig none: not-set-up line, legacy spellings, 0 bulk moves (against 6); non-admins get one sentence; nav badge and link; the widget sends with no type, keeps "what did you try", shows and sends the build stamp, and takes the insert ladder's rungs; no widget on the check-in paths |
| `announce.mjs` | `/announce`, lane e, 0003 | admin only (mentor and student: 0 composer, 0 reads, 0 function calls); mig none: the card and nothing else; `allowed_mentions` is `parse: []` and exactly the ticked ids as roles tick and untick; `@everyone` never renders as a literal ping; the role editor both ways; an empty role table; the function not deployed, needing setup, and ready (stubbed per page), Send off, off, on; a send carries exactly the ticked ids |
| `permissions.mjs` | `/schedule` and `/roster`, lane f, 0004 | a holder gets "+ New event" and Edit/Delete on exactly their own non-mandatory events; a non-holder gets neither; staff unchanged; holder and staff forms differ as claimed; a holder creates an event; without 0004 the holder's page equals the non-holder's and staff's equals itself; roster grant/revoke writes both ways and unlocks / locks `/schedule`; 44px touch targets at 375, small at 1440 |
| `display-history.mjs` | `/display` and the Team Hours drill-down, lane d | staff names are 44px buttons with the gold focus ring opening a read-only history (exactly one button, Close); Escape and backdrop close it; non-staff: the same board with 0 buttons, 0 tabindex and no history read (0 of N against N of N); `/hours` drill-down with and without staff controls; the adjust panel survives Escape; a matrix cell opens one day; identical in both migration states |
| `my-hours.mjs` | `/my-hours`, lane b1 | on lane b1's isolated seed, lane b1's exact numbers AND the same numbers computed from the store with no app code; the 8 newest sessions with their markers; a positive control (verifying the pending logged row moves Outreach 1h to 3h); on the full merged seed, All Time = the category rows = the season cards; identical in both migration states |
| `dashboard-checkout.mjs` | the dashboard Check Out tile, lane b2 | checked in: status, since, a 44px button, no hint or error; one tap writes exactly one OUT and flips the tile; a stale two-day IN reads Not checked in (positive control); both migration states |

`tools/e2e/checkin.mjs` (`npm run test:checkin`) owns the `/checkin` and
`/checkin-volunteer` paths; nothing here drives them except to prove the
feedback widget is absent from them (as a checked-out member, writing nothing).

## Rules every spec follows

- **Both directions, with both counts.** An absence is asserted against a
  presence on the same fixture, and the measurement names both numbers.
- **Numbers that depend on the seeds come from the store.** Several lanes'
  seeds land on the same personas (Sam carries the core seed's history, lane
  b1's sessions and lane b2's open check-in), so a lane's hard-coded count is
  only checked where its own seed is isolated, and an oracle computed from
  `__fx.rows(...)` is checked everywhere.
- **The test owns its precondition.** Where the merged seed breaks a lane's
  fixture (the defects below), the spec repairs exactly that in the store,
  says so in a `precondition` line, and the defect is reported, not hidden.
- **textContent, raw.** `t.text()` collapses whitespace; read raw
  `textContent` when whitespace is the claim (the announce payload JSON).
- **No `waitForTimeout` as a wait for the app.** `t.settle()` waits until the
  fixture call log has been quiet for 400 ms.

## Traps found writing these (each measured)

- **A fullPage screenshot drops touch emulation** (playwright-core 1.62.1,
  Chromium 141): before it `(pointer: coarse)` matches and
  `navigator.maxTouchPoints` is 1; after it, `(pointer: fine)` and 0 for the
  rest of that page, across reloads. The schedule's 44px touch buttons then
  measure 25px. `t.shot()` re-enables touch through a CDP session it KEEPS
  open (an Emulation override dies with the session that set it), and every
  phone tap-target check fails outright if it sees a fine pointer.
  `tools/e2e/checkin.mjs` and `shoot.mjs` take fullPage shots on the phone
  context and do not restore it.
- **React StrictMode runs every load effect twice in dev**, so a page reads
  each table twice; a "the page reads exactly X" claim is about which tables,
  not how many selects.
- **The core seed's generated sessions interleave with a feature's rows.** The
  core generator only avoids its own sessions, so Riley's ordinary build
  sessions land inside lane d's 12.5 h and auto-closed sessions and absorb
  them (paired in time order, the later IN wins).

## Known fixture defects, as of this file (owned by `src/dev/fixture/`)

1. `features/a.js` keys the student personas' holder rows by fallback emails
   (`student@fixture.techmen.test`), not the personas' sign-in emails, so
   "Your certifications" reads 0 held for Sam on the seed as shipped. Fix:
   `DEFAULT_EMAILS = { student: 'student.one@boscotech.edu', student2: 'student.two@boscotech.edu' }`.
2. `features/c.js` declares no `alters` for 0002, so with 0002 "applied" the
   fixture still refuses a null `feedback.category` (23502) and the widget's
   type rung runs when it should not. Fix: add
   `alters: { feedback: { category: { nullable: true }, status: { values: STORED_STATUSES } } }`.
3. `features/d.js` seeds Riley's history at times the core seed's build
   generator also uses. Fix: seed lane d's history on a member the core
   generator does not touch (a fictional active student profile added by
   `d.js` itself), or offset each session to an hour no core session uses.
4. `features/e.js` declares no `discord-announce` stand-in, so the fixture's
   generic `{ ok: true, skipped: true }` answers and the page reads "answered
   but did not say it is ready". Fix: `functions: { 'discord-announce': () =>
   ({ data: null, error: null, status: 404 }) }` (not deployed).
5. `features/e.js` gives `discord_announce_roles` no column defaults, so a role
   added through the editor is stored with no `active` at all (the live column
   is `not null default true`). Fix: declare the table's columns with their
   defaults in `creates.columns` (`id` uuid, `active: { default: true, type:
   'boolean' }`, `sort_order: { default: 0 }`, `created_at` now, and the rest),
   which also makes the table strict.

## Adding a spec

Write `tools/e2e/features/<name>.mjs` exporting `default { async run(t) }`,
add `<name>` to `FEATURES` in `tools/e2e/features.mjs`, and use the harness:
`t.open(route, { persona, mig, reset, ready })`, `t.as(state)`,
`t.check(label, ok, measurement)`, `t.eq(label, actual, expected)`,
`t.count/visibleCount/text/texts/rows/calls/e2e()`, `t.press(target)`,
`t.noHScroll()`, `t.tapTargets(selector, label)`, `t.shot(name)`,
`t.newPage({ stubs })`. Shared oracles live in `_util.mjs`.
