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
| `feedback.mjs` | `/feedback` and the widget, lane c, 0002 | export bar first and naming the count; tabs and five filters against the store; detail; markdown in one part and in numbered parts past 50,000 characters; a real zip (CRC-checked here and by `unzip -t`); bulk Done and an Undo restoring status, reviewer and time exactly; every console checkbox ticks in gold; mig none: not-set-up line, legacy spellings, 0 bulk moves (against 6); non-admins get one sentence; nav badge and link; the widget sends with no type, keeps "what did you try", shows and sends the build stamp, and takes the insert ladder's rungs; no widget on the check-in paths |
| `announce.mjs` | `/announce`, lane e, 0003 | admin only (mentor and student: 0 composer, 0 reads, 0 function calls); mig none: the card and nothing else; `allowed_mentions` is `parse: []` and exactly the ticked ids as roles tick and untick; `@everyone` never renders as a literal ping; the role editor both ways, a new role stored `active` true by the column default; an empty role table; the fixture's own 404 reads not deployed; the function not deployed, still answering, needing setup, and ready (stubbed per page), Send off, off, off, on, and the confirm step never says it "answered" while it is still being asked; a send carries exactly the ticked ids |
| `permissions.mjs` | `/schedule` and `/roster`, lane f, 0004 | a holder gets "+ New event" and Edit/Delete on exactly their own non-mandatory events; a non-holder gets neither; staff unchanged; holder and staff forms differ as claimed; a holder creates an event; without 0004 the holder's page equals the non-holder's and staff's equals itself; roster grant/revoke writes both ways and unlocks / locks `/schedule`; 44px touch targets at 375, small at 1440 |
| `display-history.mjs` | `/display` and the Team Hours drill-down, lane d | staff names are 44px buttons with the gold focus ring opening a read-only history (exactly one button, Close); Escape and backdrop close it; non-staff: the same board with 0 buttons, 0 tabindex and no history read (0 of N against N of N); `/hours` drill-down with and without staff controls; a press 1.5px inside "+ Manual session"'s edge opens the adjust panel without closing the history; the panel survives Escape; a matrix cell opens one day; identical in both migration states |
| `my-hours.mjs` | `/my-hours`, lane b1 | on lane b1's isolated seed, lane b1's exact numbers (This Week 7h at the fixed clock included) AND the same numbers computed from the store with no app code; the 8 newest sessions with their markers; a positive control (verifying the pending logged row moves Outreach 1h to 3h); on the full merged seed, All Time = the category rows = the season cards; identical in both migration states |
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
  A precondition asserts the STATE it needs, never that the defect is still
  there: fixing the fixture must change its measurement and nothing it
  asserts. (Measured: a first version asserted "7 rows re-keyed" and "more
  than 0 rows removed", and went 330/336 the moment `a.js` and `d.js` were
  fixed the way this file asks.) Where a seed's subject can move, the spec
  finds it rather than assuming it -- lane d's member is the owner of the
  one OUT at `side-door`.
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
  `tools/e2e/checkin.mjs` restores it the same way after every fullPage shot
  and reports a `z-touch` result at 375 (coarse after every shot); `shoot.mjs`
  takes fullPage shots on the phone context and does not restore it.
- **React StrictMode runs every load effect twice in dev**, so a page reads
  each table twice; a "the page reads exactly X" claim is about which tables,
  not how many selects.
- **The core seed's generated sessions interleave with a feature's rows.** The
  core generator only avoids its own sessions, so when lane d seeded Riley,
  Riley's ordinary build sessions landed inside lane d's 12.5 h and
  auto-closed sessions and absorbed them (paired in time order, the later IN
  wins). A feature whose rows must pair as written seeds its own member.

## Fixture defects found writing these (owned by `src/dev/fixture/`)

1. FIXED (lane fin): `features/a.js` keyed the student personas' holder rows
   by fallback emails, so "Your certifications" read 0 held for Sam on the seed
   as shipped. It now uses the personas' sign-in emails;
   `certifications.mjs` checks 2 held on the seed as shipped, and
   `tests/fixture-fin.test.js` holds it.
2. OPEN: `features/c.js` declares no `alters` for 0002, so with 0002 "applied"
   the fixture still refuses a null `feedback.category` (23502) and the
   widget's type rung runs when it should not. Fix: add
   `alters: { feedback: { category: { nullable: true }, status: { values: STORED_STATUSES } } }`.
3. FIXED (lane fin): `features/d.js` seeded Riley's history at times the core
   seed's build generator also uses. It now seeds its own member (Emerson
   Vale, `D_IDS.member`), keeping the one OUT at `side-door`, so
   `display-history.mjs`'s precondition removes 0 core rows.
4. FIXED (lane fin): `features/e.js` declared no `discord-announce`
   stand-in, so the page read "answered but did not say it is ready". It now
   answers the gateway's 404 (not deployed), which `announce.mjs` checks.
5. FIXED (lane fin): `features/e.js` gave `discord_announce_roles` no column
   defaults, so a role added through the editor was stored with no `active`.
   It now declares the table's columns (`active` default true, `sort_order`
   default 0; `id` and `created_at` from the engine), which also makes the
   table strict. `created_by` (`auth.uid()` live) and `updated_at` (`now()`
   live) default to null: a feature column default is a constant in the
   contract. `announce.mjs` checks the stored `active`.

## Adding a spec

Write `tools/e2e/features/<name>.mjs` exporting `default { async run(t) }`,
add `<name>` to `FEATURES` in `tools/e2e/features.mjs`, and use the harness:
`t.open(route, { persona, mig, reset, ready })`, `t.as(state)`,
`t.check(label, ok, measurement)`, `t.eq(label, actual, expected)`,
`t.count/visibleCount/text/texts/rows/calls/e2e()`, `t.press(target)`,
`t.noHScroll()`, `t.tapTargets(selector, label)`, `t.shot(name)`,
`t.newPage({ stubs })`. Shared oracles live in `_util.mjs`.
