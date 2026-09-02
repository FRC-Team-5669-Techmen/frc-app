# `tools/browser-verify/routes/` -- one file per route spec

This directory holds the individual route specs `../routes.mjs` assembles into
the array `run.mjs` drives. It exists for the same reason `docs/history/` does,
and the mechanism is the same: a single shared array is a write point two
branches touch on every unrelated pair of features.

## Adding a route

Create `<slug>.mjs`, where `<slug>` is your route's own `path` with the leading
`/` stripped, lowercased, and every run of non-alphanumeric characters
collapsed to a single `-`. `/_ds` becomes `_ds.mjs`; `/hours?view=matrix` would
become `hours-view-matrix.mjs`. The loader computes the same slug from your
spec's `path` and REFUSES to load the file if the two disagree, so a typo in a
filename is a load-time error rather than a route silently never running.

This is collision-free BY CONSTRUCTION, not by convention: your route answers on
a URL nothing else in the app does, so your filename cannot collide with another
lane's. Do not derive a filename from a counter, a date, or your branch name --
any of those is a value two parallel sessions could pick identically, which is
the shared write point this split removes.

**A leading `_` marks infrastructure** (`_shared.mjs`), which the loader skips.

**`/_ds`'s spec is `ds.mjs`, not `_ds.mjs`, and the two rules agree rather than
collide.** `slugify` replaces every run of non-alphanumeric characters with a
`-` and then strips leading and trailing dashes, so `/_ds` slugifies to `ds`.
Named `_ds.mjs` the file is silently skipped as infrastructure and the route
simply never runs -- which is exactly what happened the first time this
directory was written, and the symptom was `0 spec(s)` rather than an error.
Named `ds.mjs` it loads, and the filename check would have caught the mistake
had the skip not pre-empted it. If a route stops running, check the underscore
first.

## The spec shape

- `path` -- the route to visit. Doubles as this file's own name (see above).
- `label` -- what the surface is, in words.
- `aliasOf` -- present when this spec measures a different STATE of a route
  another spec already names; `urlFor` visits `aliasOf` instead of `path`.
- `prepare` -- `[{ click, until, force? } | { waitFor, timeoutMs? } | { evaluate }]`,
  reaching the state the spec means to measure. **Every step is a measurement**,
  printed above the numbers it gates, and a failed step reddens the run.
- `presence` -- `[{ selector, label, expectPresent, maxPresent?, expectVisible?, maxVisible? }]`.
  `expectPresent: 0` gets a ceiling of 0 automatically; see the check.
- `contrast` -- `[{ selector, label, min }]`, measured by painting.
- `tapTargets` -- `[{ selector, label, min, floor }]`.
- `textContains` -- `[{ selector, label, must, mustNot }]`.
- `orderResult` -- `[{ evaluate, expected, label }]`, for a claim about a value
  the page computes rather than about what is on screen.
- `verdicts` -- `true` or `{ minTotal, maxPending }`, for a route that renders
  its own `.ds-verdict` panel.
- `faultMarkers` -- `{ expected, label }`, the `.frc-fault` count.
- `ignoreConsole` -- explicit patterns, named individually. Never a blanket.
- `settleMs` -- override the post-prepare settle for this route.

## A route is only as good as the state it mounts in

`/_ds` renders inside the app shell, so it inherits `theme.css` and the app's
own `:root` tokens. That is not a defect to work around -- it is the real
condition the design system has to survive, and one of the specs asserts exactly
that (`--bg0` is not declared at `:root`, while the deck still resolves gold).
Check what is above a route before trusting any colour or geometry number from it.
