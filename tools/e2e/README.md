# `tools/e2e` -- end-to-end tools on fixture mode

Both tools run the REAL app in a real Chromium against fixture mode
(`src/dev/fixture/`, `vite --mode fixture`): every route, every component,
an in-memory Supabase seeded with fictional people. No credential, no network,
and they run from a clean checkout.

```bash
npm run test:checkin                       # the standing check-in / check-out E2E
node tools/e2e/checkin.mjs --port 5402     # on another port
node tools/e2e/checkin.mjs --verbose       # every step, PASS or FAIL, with its measurement

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
freshly reseeded store, signed in as the fixture student.

The clock is Playwright's, installed at a fixed Thursday afternoon in LA
(2026-10-01 4:00 PM PDT, the shop open) and fast-forwarded 61 s between taps,
past the 60 s duplicate window. The context runs in `America/Los_Angeles`.

| step | what is driven | asserted on screen | asserted in the store |
| --- | --- | --- | --- |
| a | `/checkin?loc=shop-main` at the shop (34.041550, -118.086826, accuracy 10), tap Confirm | `CHECKED IN` | exactly 1 new `in`, category `build`, `geo_ok` true, location `shop-main`, method `nfc` |
| b | `/dashboard`, tap Check Out | tile `Checked in` with a Check Out button, then `Not checked in`, button gone | exactly 1 new `out` |
| c1 | `/checkin` again the same day, confirm | `CHECKED IN` | exactly 1 new `in` |
| c2 | `/checkin` again (the open check-out bug report) | `CHECKED OUT`, never the check-in confirm screen | exactly 1 new `out`; today reads `in,out,in,out` |
| d | `/checkin` inside 60 s | `ALREADY OUT` | 0 writes, **against** c2's write by the same page outside the window |
| e1 | 2 km north of the shop, confirm; then back at the shop, confirm again | `Not at the shop`, then `CHECKED IN` | 0 writes, **against** 1 `in` from the same screen in range |
| e2 | location permission denied, confirm; then granted, confirm again | `Location denied`, then `CHECKED IN` | 0 writes, **against** 1 `in` once granted |
| e3 | the `exempt` persona with location denied | `CHECKED IN` | 1 `in` with `geo_ok` false, **against** the non-exempt student refused (0 writes) in the same context |
| f1 | `/checkin-volunteer?loc=fll-room` at the FLL room (34.042134, -118.086326) | `VOLUNTEER · CHECKED IN` | exactly 1 `in`, category `volunteer`, `geo_ok` true |
| f2 | `/checkin-volunteer` again, later | `VOLUNTEER · CHECKED OUT` | exactly 1 `out` |
| g | signed out, `/checkin?loc=shop-main` | lands on `/login` | `sessionStorage.pendingCheckin` = `/checkin?loc=shop-main`, 0 writes, **against** signing in returning the visitor to that exact check-in |
| z | the whole run | -- | 0 unexpected console errors |

It prints exactly one summary line, `checkin e2e: N/N passed (375 and 1440)`,
exits non-zero on any failure, and writes one screenshot per step (and per
refusal) to `artifacts/e2e/<width>-<step>.png` plus `artifacts/e2e/checkin-results.json`.

Things learned getting it to measure, each a trap for the next harness:

- **Location permission goes through CDP, scoped to the context.**
  `context.clearPermissions()` leaves the next `getCurrentPosition` pending
  forever (a prompt nobody can answer headless), and every later request then
  times out; `Browser.setPermission` without the context id lands on the
  default context and changes nothing. With the id, `denied` answers
  `PERMISSION_DENIED` at once, which is what a student who tapped Block gets.
- **Every "writes nothing" row has its positive control in the same step**, so
  a page that stopped writing altogether cannot pass the refusal rows.
- **Text is read from `textContent`**, never `innerText`: the check-in screens
  uppercase with CSS in places and with literal capitals in others.

### Known failures, as of this file

**c2 and f2 fail in this harness, at both widths: one NFC tap writes TWO
`out` events.** Measured (`__fx.calls`): two `profiles` upserts, two
`attendance_events` selects and two inserts, all within ~5 ms of one page load.
`CheckinPage`'s and `VolunteerCheckinPage`'s on-load `useEffect` decides "the
last event today is an IN, so check out" and inserts, with no guard against
running twice; React StrictMode (`main.jsx`) runs every effect twice in
development, both runs read the same last event before either insert lands,
and both insert. A production bundle runs the effect once, so this does not
reach students today -- but the effect is not idempotent, which is the exact
property StrictMode exists to flag (two near-simultaneous loads of the page,
say a double NFC read, would race the same way). The usual fix is an `active` flag set false in the effect's cleanup and
checked before the insert. Those files belong to the check-in lane; the
assertion stays strict here.

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
