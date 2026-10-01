# `tools/e2e` -- end-to-end tools on fixture mode

Both tools run the REAL app in a real Chromium against fixture mode
(`src/dev/fixture/`, `vite --mode fixture`): every route, every component,
an in-memory Supabase seeded with fictional people. No credential, no network,
and they run from a clean checkout.

```bash
npm run test:checkin                       # the standing check-in / check-out E2E
node tools/e2e/checkin.mjs --port 5402     # on another port
node tools/e2e/checkin.mjs --verbose       # every step, PASS or FAIL, with its measurement
node tools/e2e/checkin.mjs --only M        # just the across-midnight presence step, both widths

node tools/e2e/shoot.mjs --persona admin --mig all --widths 375,1440 \
  --routes /dashboard,/hours --out artifacts/shots/my-check
node tools/e2e/shoot.mjs --persona student --routes all --widths 375 --out artifacts/shots/student
node tools/e2e/shoot.mjs --persona admin --routes all --root-class shapes-on --url http://127.0.0.1:5401

node tools/e2e/gen-fixture-schema.mjs --host /tmp --port 54330 --db <a db with the frozen SQL applied>
```

Each tool boots `vite --mode fixture` on its port (default 5401, `--port` or
`FIXTURE_PORT`) and stops it afterwards, or reuses a fixture server already
answering there, but ONLY one serving this same checkout: the fixture dev
server answers `/__fixture/root` with its checkout path, and anything else on
the port (another worktree's fixture server, a plain dev server) is refused
with an error naming both trees, never driven. Several worktrees share the
default port, and a check-in run that silently tested another tree's code
would report that tree's result as this one's. `shoot.mjs --url` is an
explicit choice and is not checked. Output goes to `artifacts/` (gitignored). The browser is the
container's Chromium, found through `tools/browser-verify/browser.mjs`'s
resolution chain (that file explains why `chromium.executablePath()` is not
trusted here). Every non-loopback request is blocked and counted.

## `checkin.mjs` -- `npm run test:checkin`

The rule it exists for: **check-in and check-out may not regress.** Students
use them on their phones at the start and end of every session, so this runs
after every workstream, at **375x812** (touch, `isMobile`, an Android Chrome
user agent -- the platform Web NFC exists on) and at **1440x900**, each from a
freshly reseeded store, signed in as the fixture student. Setup then clears
today's attendance for the two personas it drives (Sam and Casey), because a
feature fixture may seed them a session (the check-out lane seeds Sam checked
in 2h45m ago); the run prints how many rows that took with `--verbose`.

**A tag tap is a NEW TAB.** An NFC tag hands the phone's browser a URL, which
opens as a fresh navigation with no history state. The tag routes key on that:
a history entry already carrying their marker is the page shown AGAIN (a back
gesture, a reload, a restored tab) and must never write on its own, because
the silent write on re-show was the 2026-09-08 check-out bug
(`src/attendanceState.js`, `isRevisit`). The first version of this file tapped
with `page.goto()` in the same tab; Chromium turns a same-URL navigation into a
reload that KEEPS `history.state`, so every repeat "tap" was a revisit and the
run read 8/24 against a correct app. Fresh taps now open a new tab in the same
context, which shares localStorage (the fixture store and the device's
last-tap record) as a phone's browser does; sessionStorage is per tab, which is
why the signed-out bounce (g) stays in one tab. The earlier tab is closed once
the new one has booted, unless a step keeps it, because this headless Chromium
cannot put a tab in the background (below). The revisit paths have their own steps, R7 included (the
same tab reused for a repeat tap), so neither model can change silently.

The clock is Playwright's, installed on the context (every tab shares it) at a
fixed Thursday afternoon in LA (2026-10-01 4:00 PM PDT, the shop open) and
fast-forwarded 61 s between taps, past the 60 s duplicate window. The context
runs in `America/Los_Angeles`. Rows are read from the persisted store
(`localStorage.__fx_db`), which every tab writes through. Every step that
writes waits 400 ms before counting, so a second write (StrictMode runs every
effect twice in dev) has time to land and fail the "exactly one" assertion.

| step | what is driven | asserted on screen | asserted in the store |
| --- | --- | --- | --- |
| a | new tab `/checkin?loc=shop-main` at the shop (34.041550, -118.086826, accuracy 10), tap Confirm | `CHECKED IN` | exactly 1 new `in`, category `build`, `geo_ok` true, location `shop-main`, method `nfc` |
| b | new tab `/dashboard`, tap Check Out | tile `Checked in` with a Check Out button, then `Not checked in`, button gone | exactly 1 new `out` |
| c1 | new tab `/checkin` again the same day, confirm | `CHECKED IN` | exactly 1 new `in` |
| c2 | new tab `/checkin` again (the open check-out bug report) | `CHECKED OUT`, never the check-in confirm screen | exactly 1 new `out`; today reads `in,out,in,out` |
| d | new tab `/checkin` inside 60 s | `ALREADY OUT` | 0 writes, **against** c2's write by the same tag outside the window |
| e1 | 2 km north of the shop, confirm; then back at the shop, confirm again | `Not at the shop`, then `CHECKED IN` | 0 writes, **against** 1 `in` from the same screen in range |
| e2 | location permission denied, confirm; then granted, confirm again | `Location denied`, then `CHECKED IN` | 0 writes, **against** 1 `in` once granted |
| e3 | the `exempt` persona with location denied | `CHECKED IN` | 1 `in` with `geo_ok` false, **against** the non-exempt student refused (0 writes) in the same context |
| f1 | new tab `/checkin-volunteer?loc=fll-room` at the FLL room (34.042134, -118.086326) | `VOLUNTEER · CHECKED IN` | exactly 1 `in`, category `volunteer`, `geo_ok` true |
| f2 | new tab `/checkin-volunteer` again, later | `VOLUNTEER · CHECKED OUT` | exactly 1 `out` |
| R1 | check in, tap VIEW STATUS, wait for the dashboard, 61 s, `goBack()` (the reported back-swipe) | `Checked in since <the IN's time>` and a Check out button, never `CHECKED OUT` | 0 writes, **against** 1 `out` from that Check out tap |
| R2 | `reload()` of a check-in receipt inside 60 s, then after 61 s | `ALREADY IN`, then `Checked in since` | 0 writes both times, **against** 1 `out` from a fresh tap in a new tab from the same state |
| R3 | a `CHECKED OUT` receipt hidden 2 min, then shown | still `CHECKED OUT`, never the check-in prompt | 0 writes and at least 1 re-read; **control** in the same step: another tab checks in, the receipt hidden 2 min again now shows `Checked in since` (0 writes by it) |
| R5 | a `CHECKED IN` receipt hidden 2 min, then shown | still `CHECKED IN` | 0 writes and at least 1 re-read |
| R6 | R5's control: tab A shows `CHECKED IN`, a fresh tap in tab B checks out, A hidden 2 min then shown | B `CHECKED OUT`; A `Tap to confirm your check-in` | B: 1 `out`; A: 0 writes |
| R7 | the same URL again in the SAME tab (a browser that reuses the tab for a repeat tap) | `Checked in since`, never `CHECKED OUT` | 0 writes, **against** 1 `out` from one tap: the known cost of the fix (one tap instead of zero on such a phone), pinned so it cannot change silently |
| R8 | a check-in receipt brought back while `claim_profile` (re-run by App on the `SIGNED_IN` every tab return emits) fails once (`__fx.failNext`) | receipt still `CHECKED IN`, no access gate (`.gate-wrap`) | 0 writes, the failure confirmed as what the call answered; **control** in the same step: a real `false` from the same call shows the gate, and the real `true` after it brings back `Checked in since` (0 writes) |
| V1 | the FLL tag over an open BUILD session | `Tap to switch to volunteer hours`, `You have a normal session open`; after the tap `VOLUNTEER · CHECKED IN` and `Switched from a normal session to volunteer.` | arrival: 0 writes; the tap: an `out` then an `in` (category `volunteer`, `geo_ok` true) |
| V2 | `reload()` of V1's volunteer receipt after 61 s | `Volunteering since` and a Check out button | 0 writes, **against** 1 `out` (category `volunteer`) from that tap |
| V3 | volunteer check-in, VIEW STATUS, `goBack()` | `Volunteering since` | 0 writes, **against** 1 `out` from a fresh volunteer tap in a new tab, no confirm |
| g | signed out, `/checkin?loc=shop-main` (one tab throughout) | lands on `/login` | `sessionStorage.pendingCheckin` = `/checkin?loc=shop-main`, 0 writes, **against** signing in returning the visitor to that exact check-in |
| M | its own context at **12:30 AM** LA: Sam's only recent event is an IN at 11:40 PM; then the same row moved to 1:40 PM the day before | tile `Checked in`, Sam `pb-present` on `/display` (as the mentor), the Team pulse count; then `Not checked in`, `pb-absent` | the board and the glance counts each move by exactly 1 between the two (the board and the glance read from `presenceSinceISO()`; from local midnight they dropped Sam while his tile said Checked in) |
| z | the whole run, every tab | -- | 0 unexpected console errors |

It prints exactly one summary line, `checkin e2e: N/N passed (375 and 1440)`,
exits non-zero on any failure, and writes one screenshot per step (and per
refusal) to `artifacts/e2e/<width>-<step>.png` plus `artifacts/e2e/checkin-results.json`.

**Mutation proof (2026-10-01).** Each group of steps was run against a mutant
and went red, then the file was restored from a copy and checked by sha256:
both tag pages passing `revisit: false` (the pre-fix behaviour) fails R1, R2,
R3, R7, V2 and V3 at both widths, every one by checking the member out with no
tap; `PresenceBoard.jsx` reading attendance from `startOfTodayISO()` fails M
("the board shows Sam absent while the tile reads Checked in"); `useGlance.js`
reading it from `todayISO` fails M ("the glance count moved by 0"); `App.jsx`
setting approval straight from `claimed === true` again fails R8 (the access
gate replaces the receipt).

Things learned getting it to measure, each a trap for the next harness:

- **A tab cannot be put in the background in this headless Chromium.** Measured
  on Chromium 141: a second tab in the same window (`Target.createTarget`,
  foreground or background), a minimized window (`Browser.setWindowBounds`), a
  frozen page (`Page.setWebLifecycleState`) and focus emulation all leave every
  tab reading `visible` with no event, and the protocol has no visibility
  override. `lib.mjs` `setTabVisibility` therefore shadows
  `document.visibilityState` / `document.hidden` on the page and dispatches
  `visibilitychange`, which is exactly what the app reads; it does not model
  Chrome throttling the hidden tab's timers.
- **Wait for the destination, not its URL.** React Router moves the URL first
  and renders a lazy route inside a transition, keeping the old page MOUNTED
  until the chunk arrives; a `goBack()` before then returns to a page that
  never left (measured on V3: the receipt simply stayed, 0 writes).
- **Every fixture tab holds its own copy of the store.** `client.js` follows
  the `storage` event so a write in one tab reaches the others, as one database
  would; without it, a tab left open re-reads its own stale copy.
- **Open the next tab BEFORE closing the last one.** Chromium can drop a
  localStorage write made just before its tab closes, and the next tab then
  boots from the copy before it. Measured with the app as writer and reader:
  closing first lost the write 1 time in 60 (twice, both at the 16th tab);
  opening first, 0 in 60. It surfaced as M failing about 1 run in 9 at 1440
  ("planted MISSING" in the next tab's store), never in the app.
- **A read-only RPC must not persist.** The fixture engine used to save the
  whole tab store after EVERY successful RPC, so a tab that merely called
  `claim_profile` wrote its copy back over a newer one. It now persists only
  when the call changed the store (`tests/fixture-client.test.js`, rpc
  persistence). With both fixes M passed 20 runs of 20, against 4 failures in
  35 before.
- **A tab coming back re-runs App's `claim_profile`.** supabase-js 2.106 emits
  `SIGNED_IN` on every hidden-to-visible transition (auth-js
  `_onVisibilityChanged` -> `_recoverAndRefresh`), and the fixture client now
  does the same, so R3, R5, R6 and R8 exercise that path as a phone does.
- **Location permission goes through CDP, scoped to the context.**
  `context.clearPermissions()` leaves the next `getCurrentPosition` pending
  forever (a prompt nobody can answer headless), and every later request then
  times out; `Browser.setPermission` without the context id lands on the
  default context and changes nothing. With the id, `denied` answers
  `PERMISSION_DENIED` at once, which is what a student who tapped Block gets.
  The session is browser-level, so it outlives the tabs.
- **Every "writes nothing" row has its positive control in the same step**, so
  a page that stopped writing altogether cannot pass the refusal rows.
- **Text is read from `textContent`**, never `innerText`: the check-in screens
  uppercase with CSS in places and with literal capitals in others.

## `shoot.mjs` -- screenshots for any later workstream

```
--persona admin|mentor|student|student2|exempt|parent|pending|signedout   (default admin)
--mig all|none|0001,0003                                                 (default all)
--widths 375,1440                                                        (default 375,1440)
--routes all | /a,/b                                                     (default all: src/dev/fixture/routes.js)
--out artifacts/shots/<name>
--url http://127.0.0.1:PORT      reuse a running fixture server
--root-class NAME                add a class to <html> before each shot (init script + again before the shot)
--no-reset                       keep the store instead of reseeding once per width
```

Full-page PNGs named `<persona>-<width>-<route>.png` (a page too tall to
capture whole falls back to the viewport and says so), plus `shots.json`. Per
route it prints the final path (a redirect is reported, not hidden), console
errors, the **error answers the fixture gave the page** (`__fx.calls`: a
missing column, an RPC that does not exist, a constraint), and whether the
page rendered a non-empty main area -- the `textContent` of `#root` outside
the nav bar and the feedback launcher, plus whether the error boundary is up.
The store is reset once per width before the first route, so a route that
writes when opened (`/checkin`) starts from the same store at every width.

## `gen-fixture-schema.mjs`

Regenerates `src/dev/fixture/schema.js` from a Postgres that has every frozen
`supabase/*.sql` file applied (`psql` on PATH). Re-run only when the frozen SQL
changes; the output is committed, so nothing needs a database at run time.

## The production-build proof

Fixture mode must never reach students. The proof, which is how this lane's
claim was measured and how anyone can re-measure it:

1. `npm run build` and compare `dist/` file lists with a build of the commit
   before fixture mode -- the set must not grow by a fixture chunk.
2. `grep -rl techmen-fixture-client dist/` -- the marker string in
   `src/dev/fixture/client.js` -- must find nothing.
3. Serve `dist/` (`npx vite preview --port 5401 --strictPort`), open
   `/_fixture`, and the page must be the same `404 — not found` element as
   `/_ds`.
