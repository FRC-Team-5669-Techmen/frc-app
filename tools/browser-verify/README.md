# `tools/browser-verify` -- the repeatable visual pass

Every bundle in this repo for months verified its work by writing a headless
Chromium harness, driving the real components against a stubbed `./supabase`,
reporting numbers, and then **deleting the harness**. The numbers are in
`docs/history/` -- 78/78, 54 checks, 62/62, 44/44, 33/34 -- and not one of them
can be re-run today. A measurement that cannot be repeated is a claim about the
past.

This is the standing version. A session either runs this and reports numbers, or
names precisely what stopped it.

```bash
npm run verify:browser                     # every listed route, both widths
npm run verify:browser -- --probe          # what this container's browser can actually do
npm run verify:browser -- --selftest       # negative controls; exits 1 if a check is broken
npm run verify:browser -- --route _ds --width 1440
npm run verify:browser -- --break overflow # inject a defect into the REAL page
npm run verify:browser -- --json out.json --verbose
npm run verify:browser -- --strict         # exit 1 on any measurement outside threshold
```

## What this container actually has

Measured 2026-09-02, not assumed. Re-run `--probe` rather than trusting this
table.

| Question | Answer |
| --- | --- |
| Chromium present? | **Yes** -- `141.0.7390.37` at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` |
| Does `chromium.executablePath()` find it? | **No.** playwright-core 1.62.1 answers `/opt/pw-browsers/chromium-1234/chrome-linux64/chrome`, which does not exist |
| So how is it found? | The **third** candidate in `browser.mjs`'s resolution chain, an explicit path. The chain is load-bearing, not padding |
| Real layout? | **Yes** -- a 100px box measures 100 |
| Screenshots? | **Yes** -- a 4832-byte PNG from the probe |
| `requestAnimationFrame`, `IntersectionObserver`, `ResizeObserver` | All fire. Re-check with `--probe` |
| Canvas `getImageData` readback, `color-mix()` parsing | Work -- every contrast number depends on this |

**The version skew is the thing to know.** Playwright pins a chromium build per
release: 1.62.1 wants build **1234**, the image ships **1194**, and the
directory name changed too (`chrome-linux64` against `chrome-linux`). Do not
"fix" this by upgrading `playwright-core` -- the download it would then want is
not reachable from here, and the failure mode moves from a fallback that works
to an install step that cannot.

## What it covers, and what it cannot

**It drives ONE route, and that is the honest state of this repo rather than a
starting set.** `/_ds`, the design-system specimen, is the only route in this
app that renders without a real Supabase session: it is dev-only, touches no
table, and is let through both auth gates by a path check scoped to it.

Everything else -- `/dashboard`, `/jobs`, `/hours`, `/schedule`,
`/verify-hours`, `/surveys`, `/feedback` -- sits behind a real Google or OTP
sign-in against the live project. There is no `/dev` route family here and no
committed fixture-mounting harness. **Growing this list means building that
first**: a dev-only route family that mounts real components with fixture data,
or a committed stub-alias mode. That is the next step, and it is named here
rather than half-started.

**A route is only as good as the state it mounts in.** `/_ds` renders inside the
app shell, so it inherits `theme.css` and the app's `:root` tokens. That is not
a defect to work around -- it is the real condition the design system has to
survive, and one spec asserts exactly it (`--bg0` is not declared at `:root`
while the deck still resolves `#FFE629`).

**External requests are blocked and the count is reported.** `.env.dsspec`
points the Supabase client at `127.0.0.1:54329`, a port nothing listens on, so a
page that reached the network would not be deterministic anyway.

## Known findings

**As of 2026-09-02, the whole run reports exactly ONE measurement outside
threshold, and it is not this harness's to fix.**

- **`/_ds` `sheets` renders a FAIL verdict: all 26 patterns show "0 slots, 0
  chars".** `specimen/proofs.js countSlots()` queries
  `sheet.querySelectorAll('[slot]')` and gates on `slots.length > 0`, but
  `components/slots.jsx` renders every slot with `slot: undefined` (commit
  `8b2c41b`, "rendering a slot consumes its name"), so the attribute is gone
  from the DOM by the time the proof looks. **The copy itself renders** -- the
  same rows report 32, 16, 29 text elements -- so this is a stale proof rather
  than lost copy. `CLAUDE.md` records "361 slotted copy elements holding 6831
  characters" from the pass that wrote it, which is the measurement this
  replaced. It lives in `src/lib/design-system/`, which the bundle that wrote
  this harness may not touch, so it is reported and left red. A threshold
  quietly widened to accommodate it would hide the day it becomes real.

**This paragraph is a snapshot and it drifts.** The run is the authority. A
session measuring a different number corrects this section in the same change
and says which finding moved.

## The checks

Every check returns a **measured value**. None returns a bare pass/fail: a
number is auditable by the next reader and a green tick is not.

| Check | Measures |
| --- | --- |
| `horizontal-scroll` | `scrollWidth - clientWidth`, plus the widest offending elements and their overhang |
| `presence` | **present**, **visible** and **aria-hidden** -- three different questions -- with a reason for every invisible node |
| `contrast` | WCAG ratio against the **real rendered ground**, naming which ancestor supplied it |
| `tap-target` | Each control's box, the smallest dimension, counts under 44px and under the 24px floor, and a centre hit-test |
| `text-contains` | Required and forbidden strings in a subtree, read from `textContent` |
| `order-result` | An array the page computes, compared element for element |
| `ds-verdicts` | The `/_ds` panel's own conclusions: PASS, FAIL, and **still pending** |
| `fault-markers` | `.frc-fault` count against the number the route expects |
| `console-errors` | Console errors and uncaught exceptions, with explicitly named ignores |

Details that are deliberate, each learned from a measurement that was wrong
first:

- **Visibility walks ANCESTORS for opacity.** `opacity` is not inherited, so a
  child of an `opacity: 0` parent computes opacity 1 and would report itself
  visible while painted nowhere. The reason string names the ancestor.
  `--break invisible` proves it on the real page: 841 component roots present,
  **0 visible**, from four wrapper selectors.
- **`expectPresent: 0` gets a ceiling of 0 automatically.** Written as a floor,
  an absence row asserts `present >= 0`, which holds for any number of nodes --
  so a row reading "this must not be here" comes back green with it there.
  There is no legitimate `>= 0`, so nothing is taken away by refusing to offer
  one.
- **Contrast is measured by PAINTING**, not by parsing computed strings: a regex
  skips `color-mix()` and `color(srgb ...)` silently and then reports the plate
  instead of the real ground. Alpha on the text is composited over that ground
  before the ratio is taken.
- **`text-contains` reads `textContent`, never `innerText`.** `innerText` is the
  RENDERED text and applies `text-transform`. Measured here: `/_ds`'s header is
  `v1.1.0 . /_ds . dev only` in the source and `V1.1.0 . /_DS . DEV ONLY`
  rendered, so the first version of that spec reported the string "missing" from
  a node plainly containing it. The design system's own standards record the
  identical defect.
- **PENDING is not passing.** A `/_ds` proof that never resolved renders `…`,
  which looks harmless and means the measurement did not happen. It is counted
  and gated separately.
- **A control inside a `<label>` is measured at the label**, which is what a
  finger hits, and both boxes are printed.
- **The centre hit-test is recorded but changes no verdict.**
  `elementFromPoint` answers null outside the viewport and this harness never
  scrolls, so a control far down a long page reads `centreHitsSelf: false`. It
  is an artefact; the gate is geometry. Do not "fix" it by scrolling first --
  that moves the boxes the check exists to report.

## Reaching a state: `prepare`, and why every step is a measurement

**Paint is not interactivity, and no window marker separates them.** `waitForApp`
waits for painted content and then for the DOM to stop changing; anything that
clicks uses `clickUntil`, which repeats the click until a predicate holds and
**reports the attempt count**.

Prepare steps are `prepare-click`, `prepare-wait` and `prepare-eval` rows in the
report, counted in the summary and gating `--strict`, rather than prose printed
above the results. A step that fails silently makes every number after it an
honest reading of a state the run never reached, which is the most expensive
kind of green there is.

- **`attempts === 0` is a finding.** `clickUntil` evaluates the predicate BEFORE
  clicking and short-circuits on "already satisfied", so a predicate satisfiable
  by the page's RESTING state means the click never physically fired while the
  report still says "clicked". Either write a predicate only the click can
  produce, or pass **`force: true`**, which guarantees the click fires and
  annotates the row so the next reader learns it from the line.
- **`waitFor` returning at 0ms is NOT a finding.** Waiting is not supposed to
  cause anything, so a state that had already arrived is the step working.
- **`/_ds`'s transition lab is interactive, and this is why the spec presses
  four buttons.** `TransitionLab` renders `<Verdict state={allRan ? true :
  null}>` -- pending until animationstart/animationend have been recorded from
  the real sheet elements -- and its caption says "Press each button". The first
  version of that spec waited 60 seconds for zero pending verdicts and reported
  the route broken. The route was fine; the harness had never pressed anything.
  Driving the four buttons is also the only way this pass proves the transitions
  run at all rather than reading a panel that someone else populated.

## Negative controls -- the part that makes the numbers mean anything

A check that has never failed has not been tested.

```bash
npm run verify:browser -- --selftest    # 36 controls, 18 pairs. Exits 1 if any check is broken
```

`--selftest` puts every check to a PAIR of self-contained fixtures, one built to
break it and one built to pass it, and prints both measured values. It exits
non-zero if a check comes back green on the broken fixture or red on the sound
one, because unlike the measuring run there IS a right answer. Fixtures rather
than a mutation of `src/` on purpose: a mutation proves a check once in a tree
that then has to be restored byte-identically; this proves it on every run and
touches nothing.

**Measured 2026-09-02: 36 controls, 0 broken.**

`--break <preset>` is the complementary **live** control: it injects a defect
into the real page before measuring, so a session can prove a check bites on the
surface in front of it rather than only on a fixture. Measured on `/_ds` at
1440px, each moving exactly the measurement it targets and leaving the rest
alone:

| Preset | Effect on the run |
| --- | --- |
| `overflow` | `horizontal-scroll` red: **3094.7px** overhang, offenders named |
| `console-error` | `console-errors` red: **1 error**, 9 still correctly ignored |
| `fault` | `fault-markers` red: **5** against the expected 4 |
| `invisible` | all three `presence` rows red: 841 present, **0 visible**, naming the ancestor |
| `tiny-taps` | **moves nothing, correctly** -- the `/_ds` spec declares no `tapTargets` check, and a preset can only move a measurement the route actually takes |

That last row is worth keeping rather than deleting: a preset that appears to do
nothing is either a broken control or a check the route does not run, and those
two look identical from the summary line.

## Why this is outside `npm test` and outside CI

It boots a vite dev server and drives a real browser, and its default exit code
is 0 **even with findings** -- it is a measuring instrument, not a gate.
`--strict` turns it into one. Wiring it into CI as written would mean choosing
thresholds for numbers that legitimately drift, and the first time one drifted
the check would be widened rather than read.

`npm run ds:capture` is a separate, related tool and is likewise absent from CI:
it launches with `channel: 'chrome'`, the machine's installed Google Chrome, and
**fails in this container** (`Chromium distribution 'chrome' is not found at
/opt/google/chrome/chrome`) because only the playwright build is present. It
lives in `scripts/design-system/`, which this bundle does not own, so it was
measured and reported rather than repointed.
