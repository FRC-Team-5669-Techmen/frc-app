---
title: "Repo brought into conformance with the workflow standard: CI, tests, history split, prompt ledger, decisions, browser harness"
date: 2026-09-02
branches: [claude/repo-standards-conformance-uk5er7]
commits: []
migrations: []
subsystems: ["CI", "Documentation", "Testing"]
---

This repo had no CI that had ever run a check, no test suite, no numbered
migrations, and its entire engineering history on one line of `CLAUDE.md`. It
now has all four, plus a prompt ledger, a decisions directory and a standing
browser harness. Nothing under `src/`, `supabase/*.sql`, `sql/`,
`supabase/functions/`, `scripts/` or `src/lib/design-system/` was changed; three
findings in those directories are reported at the end and left alone.

## What the audit found that the brief had wrong

Six claims were checked against the tree first. Four held. Two did not, and one
of those changed what had to be built.

**The workflow standard the brief is written against does not exist.**
`docs/standards/IDEA_REPO_WORKFLOW_STANDARD.md` is not in `pina-hash/idea-app`
on `main` or on `integration`, and `docs/standards/REGISTER.md` — which is the
freshness authority for that directory and lists seventeen registered files —
does not name it either. So "section 2" could not be read. Its six items were
taken from the brief's own enumeration, and the **seven sections** `CLAUDE.md`
was reorganised into were inferred from `idea-app`'s own `CLAUDE.md` shape plus
those items: What this repo is, Commands, Architecture, Database, Verification
standard, Working conventions, Known traps. If the real standard names a
different set, this is the file to correct.

**`integrate.yml` does not key on `ci.yml`.** The brief describes the
`idea-app` workflow; what was actually on `main` at `abf7182` was a different
file that fires on `push: claude/**`, runs `npm ci && npm run build`, and on
green **merges the branch into `main` and deletes it**. It is not
CI-conclusion-driven, has no `CI_WORKFLOW_FILE`, and no branch has ever read as
"CI: unknown". It had run **once** — run 33339016542, 2026-08-30, successful,
merging `claude/survey-management-surface-gaku2o` — which is the merge commit at
the tip of `main`.

That mattered immediately rather than academically: **pushing this branch with
that file still on it would have merged this branch into `main` on green**,
which the brief forbids. So `integrate.yml` was rewritten to the `idea-app`
shape in the very first commit, alongside the ledger entry, before anything else
was pushed. A `push`-triggered workflow evaluates the file **at the pushed
commit**, so the rewritten copy is what governs this branch; the old copy on
`main` never fires for it.

The four claims that held: no `tests/`, no numbered migrations, `CLAUDE.md` at
128 lines with the history on one of them, and no `test` script in
`package.json`.

## The history split

`CLAUDE.md` line 128 was **109,839 bytes** — the "Last reviewed:" paragraph,
carrying about fifty bundles back to 2026-06-18, newest first, chained with
"Earlier the same day". It is now fifty files under `docs/history/`, byte for
byte, and `npm run history:verify` reassembles them and compares against a
frozen copy plus a pinned sha256.

Three details are worth the next reader's time:

- **The cuts are byte offsets, not a re-typing.** `_tools/split-source.mjs`
  carries a table of fifty `at:` offsets and asserts every one lands on a
  ` Earlier` that opens a bundle before writing anything. Concatenating the
  bodies in `record_order` reproduces the paragraph exactly:
  109,839 bytes, sha256 `b85db0a6…`, byte-identical against the frozen source.
- **Dates come from the commits, not from the paragraph.** The "Earlier the same
  day" chain was written relative to a header date and disagrees with the commit
  date in several places, so each entry's `date` was read from `git log` for the
  commit it describes. The clone had to be un-shallowed (54 commits to 180) to
  reach them.
- **Two numbers, deliberately.** The filename's `NN` is chronological
  (`record-01` is the oldest), so the directory reads oldest to newest. The
  front matter's `record_order` is the paragraph position (1 = newest), which is
  what the verifier reassembles on. They run in opposite directions and both are
  needed.

**Verified by breaking it, three ways, restoring byte-identically each time**
(md5 confirmed): one character dropped from one body → caught, naming byte
89741 and quoting both sides; a `record_order` duplicated → caught as
non-contiguous AND as a reassembly mismatch; the frozen source edited → caught
by the pinned hash. Exit code 1 on a broken split, 0 restored.

## The test suite

`npm test` is vitest, 112 tests in 7 files, all passing. It is seeded from the
pure logic that already had assertions written somewhere — and every one was
**rebuilt rather than referenced**, because the harnesses that originally ran
them were deleted.

- `hours-utils.test.js` (28) — the cap, the IN/OUT pairing, category
  attribution, the season and category breakdown.
- `anomaly-pairing.test.js` (16) — extracts the SHIPPED `unclosedInIds` out of
  `MemberHoursAdmin.jsx` by brace-matching and evaluates it, rather than pasting
  a copy that would pass forever while the real one drifted.
- `hours-resolve.test.js` (16) — the null-means-nothing-entered model that makes
  "no pre-filled timestamp" structural rather than a habit.
- `discord-calendar-sync.test.js` (12) — the no-double-post property, driven
  against the real engine that deploys.
- `vocabulary-drift.test.js` (12) — `src/subteams.js` and `src/categories.js`
  against the CHECK constraints in the SQL files.
- `workflows.test.js` (23) — the workflow files, checked for what a YAML parser
  cannot see. Written after the push described below, not before it.
- `legacy-suites.test.js` (5) — runs the untouched
  `scripts/discord/calendar-sync.test.mjs` as a child process and asserts its
  pass count, so the pre-existing 19-case suite is gated by `npm test` too.

**Every file carries at least one positive control**, and they are not
decoration. `anomaly-pairing`'s mutates the extracted function in memory to
delete the orphan-IN branch and requires three ledgers to break — without it,
every assertion in that file would pass against a function returning an empty
set. `legacy-suites`' copies the legacy suite into a temp directory, injects a
failing case, and requires exactly one failure, then asserts the real file on
disk is unchanged.

**One test measured the wrong thing and it is recorded at the test rather than
quietly fixed.** A bare `/category\s+in\s*\(...\)/` over
`categories_reduce_event_kind.sql` matched the **re-tagging UPDATE** — `where
category in ('fundraising', 'mentoring')` — and reported the two retired
categories as the constraint's vocabulary. It failed loudly, which is the only
reason it was caught: a file whose UPDATE happened to list the same four values
would have passed while asserting nothing. The pattern is anchored on
`add constraint … check (…)` now, with a second control proving it no longer
matches the update.

## The browser harness

`tools/browser-verify/` replaces the write-it-then-delete-it pattern that
produced every measurement in `docs/history/` and left none of them repeatable.

**It drives one route, `/_ds`, and that is the honest state of this repo** — the
only route that renders without a real Supabase session. Everything else is
behind a real Google or OTP sign-in, and there is no `/dev` route family here to
stand in for one. Building that is named in the harness README as the next step
rather than half-started.

**36 negative controls, 0 broken.** Eighteen pairs, each check put to a fixture
built to break it and one built to pass it.

**Five live `--break` controls on the real page**, each moving the measurement it
targets and leaving the rest: `overflow` → 3094.7px overhang; `console-error` →
1 error with 9 still correctly ignored; `fault` → 5 markers against 4;
`invisible` → 841 roots present, **0 visible**, naming the ancestor. The fifth,
`tiny-taps`, **moves nothing, correctly** — the spec declares no tap-target
check — and is kept in the table because a preset that does nothing and a check
the route does not run look identical from the summary line.

**Two defects were found by running it, and both were the instrument's:**

1. The spec asserted the header contains `/_ds` and `dev only`, and reported both
   **missing from a node plainly containing them**. `textContains` was reading
   `innerText`, which applies `text-transform`: the header renders
   `V1.1.0 · /_DS · DEV ONLY`. It reads `textContent` now. The design system's
   own standards record this identical defect, which is how it was recognised.
2. The spec waited 60 seconds for zero pending verdicts and reported the route
   broken. `TransitionLab` is **interactive** — its caption says "Press each
   button" and its verdict is `null` (pending) until animation events have been
   recorded. The route was fine; the harness had never pressed anything. It
   presses all four now, with `force: true` because the predicate is satisfiable
   by a previous button's log entry and three of the four would otherwise never
   fire while the report said "clicked".

**Final run: 14 measurements, 1 outside threshold**, and that one is not this
harness's (see findings below).

## CI, and the two workflows around it

`ci.yml` runs the five checks the brief names — build, `npm test`, `ds:audit`,
`discord:calendar:test`, `history:verify` — each with `continue-on-error` so one
push reports every failure rather than only the first, and a final step that
fails the job. No secret is read; two placeholder Supabase values are committed
on purpose and point at a port nothing listens on. There is no `svelte-check`
because there is no Svelte, no TypeScript and no linter here: **the build is the
type gate** and the workflow says so.

Its `schedule` (04:30 UTC daily) and `workflow_dispatch` both test `integration`
for a specific reason: a push made by `integrate.yml` with the default
`GITHUB_TOKEN` does not trigger another workflow run, so `integration`
accumulates merges and never gets a CI run of its own. Every commit on it was
green on its source branch, but the **merge result** is a tree no run has seen.

`deploy.yml` is the only place `main` moves by machine, and only after a person
types `DEPLOY`. The sentence they are confirming is deliberately not "are you
sure" — it is the one fact no check here can establish: **that every SQL file
this deploy depends on has already been run in the SQL editor.** Its job summary
also states that the service worker serves the previous build to an already-open
tab until a reload, because that is the first thing to check when somebody says
a fix did not ship.

**Parsing is not validation, and pushing proved it.** All three workflows parsed
under PyYAML, were committed, and were pushed. GitHub then produced a run named
`.github/workflows/deploy.yml` -- **the file's path, not its `name:`** --
triggered by `push`, on a workflow that declares only `workflow_dispatch`,
completed as `failure`, with no job and no log. That is what an invalid workflow
file looks like from outside, and none of those signals says "invalid" in words.

The cause was a shell comment inside a `run:` block containing an **empty
expression interpolation**, written to illustrate the injection risk it was
warning about. GitHub evaluates expressions inside `run:` regardless of the `#`
in front of them, an empty one does not parse, and the file was rejected whole.
The identical sentence in `integrate.yml` sits in a YAML comment rather than in
shell text, never reaches the expression parser, and was fine -- which is
exactly the distinction a person re-reading their own diff does not make.

`tests/workflows.test.js` now catches it, along with the invariants these
workflows have to hold: `integrate.yml` can never write to the deploy branch and
keys on a CI file that exists whose `name:` its `workflow_run` trigger waits on;
`deploy.yml` is dispatch-only with a required confirmation; no workflow
force-pushes; `ci.yml` runs five gates that are all real npm scripts and fails
the job on each one's `outcome`. 23 tests, six of them positive controls that
drive the scanner over synthetic workflows carrying the defects it claims to
find -- including a check that a shell `${VAR:-default}` is NOT mistaken for an
interpolation, since every summary step in this repo uses one. **Verified by
restoring the real defect and watching the suite go red, then restoring the file
byte-identically (md5 confirmed).**

**CI has now run green on this branch, twice, on a real runner.** Run 1
(`7ee4234`) and run 2 (`fb0705b`) both succeeded with all five gates —
`npm run build`, `npm test`, `ds:audit`, `discord:calendar:test`,
`history:verify` — which is the first time any check has run in CI in this
repository. `main` is untouched at `abf7182` throughout, and `integrate.yml`
correctly did not fire: it is `workflow_run`-triggered now, and the old
push-triggered copy on `main` does not govern a branch that carries its own.

What a correct first run looks like from here: once this branch reaches `main`,
the next green `claude/**` branch is merged by `integrate.yml` into a newly
created `integration` — which will be the first thing it has ever merged.
`deploy.yml` cannot be exercised at all until it is on `main`, since
`workflow_dispatch` only offers workflows present on the default branch. A
correct first run is: CI goes green on this branch; `integrate.yml` does NOT
fire for it (the copy on `main` is still the old one, and it only reacts to a
`push`, which this branch's own copy governs); and once the new `integrate.yml`
reaches `main`, the next green `claude/**` branch is merged into a newly created
`integration` — which will be the first thing it has ever merged.

## Three findings, reported and not fixed

All three are outside this bundle's owned paths.

1. **`/_ds` renders a FAIL verdict, live, right now.** The `sheets` section
   reports all 26 patterns at "0 slots, 0 chars". `specimen/proofs.js
   countSlots()` queries `sheet.querySelectorAll('[slot]')` and gates on
   `length > 0`, but `components/slots.jsx` renders every slot with
   `slot: undefined` (commit `8b2c41b`, "rendering a slot consumes its name"),
   so the attribute is gone before the proof looks. **The copy renders** — the
   same rows report 32, 16 and 29 text elements — so this is a stale proof, not
   lost copy. `CLAUDE.md` records "361 slotted copy elements holding 6831
   characters" from the pass that wrote it. It is in `src/lib/design-system/`.
2. **`npm run ds:capture` cannot run in a cloud container.** It launches with
   `channel: 'chrome'` and fails with `Chromium distribution 'chrome' is not
   found at /opt/google/chrome/chrome`; only the playwright build is present.
   One line — an `executablePath` fallback — would fix it, in
   `scripts/design-system/`, which this bundle does not own.
3. **`chromium.executablePath()` points at a build that does not exist here.**
   playwright-core 1.62.1 wants chromium 1234; the image ships 1194, under a
   differently-named directory (`chrome-linux` against `chrome-linux64`). Not a
   defect in anything — a version skew the harness's resolution chain absorbs,
   recorded because "browser not found" otherwise reads like a missing tool.

## Not done, deliberately

No SQL was written and `supabase/migrations/` ships empty apart from its README.
No file under `src/`, `supabase/*.sql`, `sql/`, `supabase/functions/` or
`scripts/` was touched. `tools/idea-status.py` was not copied here — `CLAUDE.md`
carries the fetch-and-run invocation instead, since a second copy of a tool that
clones the sibling repo is a copy that goes stale. `ds:audit:controls` was not
run: it refuses a dirty tree, and the tree has been dirty throughout.

**Nothing ran against the live Supabase project — no credentials exist in this
container** — so every claim here about RLS, about applied migrations, or about
a signed-in surface is unverified and is not made.
