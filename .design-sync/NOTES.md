# design-sync notes — FRC5669 Design System

## What this syncs
The presentation/materials design system at `src/lib/design-system/` (namespace
`FRC5669DesignSystem`, class prefix `frc-`). It is a **module inside the frc-app Vite
app**, not a standalone npm package — there is no separate build, `dist/`, or
`package.json` for it. The bundle is built by pointing the converter's `--entry` at
`src/lib/design-system/index.js`, which esbuild bundles into `_ds_bundle.js` (all ~77
components on `window.FRC5669DesignSystem`) and inlines `styles.css` (tokens + component
CSS, via its `@import` closure) into `_ds_bundle.css`.

## Scope — 78 of 78 (2026-08-24)

**Core (5) + Brand (11) + Data (16) + Surfaces (18) + Forms (2) + Sheets (26) = 78.** The
sheet patterns were the last gap and they are the ones that matter most: a deck is assembled
out of sheets, so until they carried cards the design agent was composing decks from parts
without ever seeing the layer it was supposed to start from.

**`componentSrcMap` and `docsMap` are GENERATED, not hand-typed**, from
`src/lib/design-system/_ds_manifest.json` — the DS's own registry, already enforced by
`npm run ds:audit`. To re-generate (or to narrow the scope), filter the manifest by group:

```python
GROUPS = ['core','brand','data','surfaces','forms','sheets']   # all 78
PREFIX = 'src/lib/design-system/'
src  = {c['name']: PREFIX + c['sourcePath'] for c in man['components'] if c['group'] in GROUPS}
docs = {c['name']: PREFIX + c['prompt']     for c in man['components'] if c['group'] in GROUPS}
```

The generator asserts three things before writing, and all three matter: every path exists,
no already-synced component changed path, and none is dropped. A silent drop is what would
orphan a card in the project. All three passed on the sheets pass.

## The sheets pass (2026-08-24) — built WITHOUT the converter

**The `/design-sync` skill and `.ds-sync/` were not available in the session that did this.**
Both are gitignored, so a fresh clone has nothing to run, and the skill is not in every
session's skill list. Rather than skip the sync, the emit half was reproduced for this one
group. Three committed scripts, and each says at the top what it is:

- `scripts/design-system/ds-sheet-previews.mjs` — writes the 26 `.tsx` previews by
  EXTRACTING each composition from `components/sheets/SheetsDemoCard.jsx`. The demo card is
  the canonical usage of every pattern and already existed; retyping those by hand would
  have created a second copy that drifts. What the specimen route shows and what the design
  agent sees on the card are the same markup by construction.
- `scripts/design-system/ds-sheet-bundle.mjs` — esbuild emit. The SHAPES are not guessed:
  `components/surfaces/Card/Card.html` and `_preview/Card.js` were fetched off the live
  project and mirrored (IIFE under `globalName __dsPreview`, a `ds` shim resolving to
  `window.FRC5669DesignSystem`, a react shim over `window.React`, and the first-line
  `@dsCard` marker the pane indexes from).
- `scripts/design-system/ds-sheet-verify.mjs` — serves the build and renders all 26 cards in
  headless Chromium, because uploading cards nobody looked at is how an empty box ships.

**THE UPLOAD WAS ADDITIVE ON PURPOSE.** `_ds_bundle.js`, `_ds_bundle.css`, `styles.css`,
`_vendor/*`, `README.md` and `_ds_sync.json` were NOT rewritten. The 52 existing cards work
against those files, and replacing them with output from a reimplemented pipeline would risk
52 working cards to add 26. The sheet patterns are already inside the uploaded bundle — the
converter's entry is `index.js`, which re-exports `components/sheets/` — so the new cards
resolve against what is already there. Two consequences to know about:

- **`_ds_sync.json` does not know about the 26.** Its `renderHashes` / `sourceKeys` /
  `sourceHashes` still list 52. The next skill-driven sync will see 26 unknown components and
  re-verify, which is the behaviour the watch-list below already describes as correct.
- **The uploaded bundle predates the host-transparency work** (`bundleSha12 346309e60f98`).
  The sheet cards do not depend on it — no sheet's public API changed — but a deck generated
  against the project still gets the pre-fix `SafetySheet` guard until someone re-runs the
  real converter. That is the one thing worth doing next.

### Card geometry — the reason this was left undone

A card cell is under a thousand pixels wide; a sheet is 1920 x 1440. The previews mount the
real pattern on a real `.frc-stage` at full size and scale the STAGE with a transform, so the
sheet composes at the size it was drawn for and is then made smaller. Nothing is re-laid-out
for the card. Scale 0.48 lands it at exactly 922 x 691, which is the declared card viewport,
so the sheet is full-bleed with no white gutter. `cardMode: "single"` for all 26 — a cell
border and an uppercase story label around a sheet would read as chrome belonging to it.

### The one real defect the render pass caught

The first captures came out **clipped at 415px with a gold chevron band across the sheet**.
Cause: the previews mounted each pattern with `active`, so `[data-deck-active]` armed the
slide transition and the capture froze it mid-wipe. DOM measurement could not see this — the
sheet measured the right size, the right kind and the right character count throughout.

Fixed at the gate rather than by fighting it: the previews mount the pattern **without
`active`**, so no transition rule matches at all and the card shows the base state, which
this system guarantees is the visible end state. Suppressing the animation instead would
have left the band on the sheet, because its `content` is declared inside the same gated
block. The card page re-shows the unarmed sheet in one commented line.

## Key build setup (why the config is shaped this way)
- **No aggregate `index.d.ts`**, so discovery via exports finds nothing → components are
  pinned explicitly in `cfg.componentSrcMap` (the 15). Their props still resolve because
  every component ships a hand-written sibling `<Name>.d.ts` and ts-morph parses the whole
  tree (78 `.d.ts` under the DS — the only `.d.ts` in the repo).
- **`--node-modules ./node_modules`** (repo root). The DS has no own node_modules.
- **`@types/react` was installed with `npm i --no-save`** into the repo-root node_modules
  (package.json / package-lock.json stay clean). Without it, `ComponentPropsWithoutRef`
  etc. resolve to `any` and prop bodies come out empty (`[DTS_REACT]`). On a fresh clone,
  re-run `npm i --no-save @types/react` before building.
- **`docsMap`** points each component at its hand-written `<Name>.prompt.md` (the DS's real
  brand guides). The auto-matcher only looks for `<Name>.md`, so without docsMap the docs
  are synthesized from the `.d.ts`. `.prompt.md` ends in `.md` so docsMap accepts it.
- **PKG_DIR resolves to the repo root** (the `--entry` walk stops at frc-app/package.json).
  Harmless because the only `.d.ts` in the repo are the DS's. `globalName` and `tokensGlob`
  are set explicitly so nothing keys off the repo-root name.
- **Fonts**: SELF-HOSTED, no external host. `tokens/fonts.css` declares 18 `@font-face` rules
  against `../assets/fonts/*.woff2` (Space Grotesk 400/500/700, Space Mono 400/700, Roboto
  400/700 roman + italic; latin + latin-ext). Every file is sha256-pinned in
  `assets/PROVENANCE.json` and re-checked by `ds:audit`. The converter's esbuild inlines them
  into `_ds_bundle.css` as `data:font/woff2` URIs, so a rendered design makes ZERO font
  requests — `_ds_bundle.css` is ~486 KB as a result, which is the deliberate trade. Licenses
  ship beside the faces (OFL 1.1 for the two Space families, Apache-2.0 for Roboto) because
  the OFL requires it of any redistributed copy.

## Previews
Authored in `.design-sync/previews/<Name>.tsx`, ground-wrapped in
`<div className="frc-deck frc-ground-squadron">` (tokens + dark backdrop live on the ground
class; the preview body is white by default so the wrapper is required). Compositions were
ported from the DS's own `CoreDemoCard.jsx` / `BrandDemoCard.jsx` (the canonical usage).
FirstName previews must be wrapped in `<FirstNameScope audience="internal">`.

**These are COMMITTED, not ignored.** They are build *inputs*, not generated output. The
package shape has no generated preview tier at all (`generatePreviewSource: () => null`), and
the build splits the two directories explicitly — `.design-sync/previews/` is *owned*
(hand-authored, wins over anything generated) while `.cache/previews/` is *generated* and
self-defends with its own `*` .gitignore so "even a sloppy `git add .design-sync` can't commit
the cache". The build's rm guard also refuses to delete anything under `.design-sync/` on the
grounds that user previews live there. Losing them would silently downgrade every card to the
floor-card fallback and change the renderHashes, forcing a spurious re-upload of all 15.
Committed alongside them: `config.json` and this file. Still ignored: `.design-sync/.cache/`,
`.design-sync/learnings/`, `ds-bundle/`, `.ds-sync/`.

## Render check / verification tooling
- No playwright chromium is downloaded. The machine's **system Chrome** is used instead:
  install the `playwright` npm package into `.ds-sync` with
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, and run validate/capture with
  `DS_CHROMIUM_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"`.
- `.d.ts parse check skipped — typescript not in node_modules` on validate is non-blocking
  (ts-morph already validated the `.d.ts` at build). Optional: `npm i typescript` in `.ds-sync`.

## Known render warns
- `[FONT_REMOTE]` — **RETIRED 2026-08-25. It must never appear again.** All four faces are
  self-hosted from `assets/fonts/`. If this warn reappears, a remote `@import` has been
  reintroduced into `tokens/fonts.css` and should be removed, not recorded.
- `[RENDER] <Name>.html: page.goto: Timeout` — **RESOLVED 2026-08-25 at the cause, and the
  45 s margin that used to be required here is GONE.** The staged scripts are stock again;
  do not re-apply it. History, because the number is worth keeping: the remote font `@import`
  hung and only failed `ERR_CONNECTION_RESET` at ~12.4 s while the `load` event waited on it,
  so every card cost ~12.4 s against validate's 15 s budget and a random one lost the race
  each run (it was `SpecTable`). Self-hosting removed the request entirely. Measured after:
  **548–628 ms per card**, ~20x faster, so the stock 15 s budget now has ~25x headroom rather
  than 2.5 s. If a goto timeout ever returns, look for a reintroduced remote request first.
- `[GRID_OVERFLOW]` FocusTable — **RESOLVED 2026-08-25 by applying the remedy**
  (`overrides.FocusTable.cardMode: "column"`), not by recording it. A concurrent session first
  argued this warn was a false alarm on the grounds that `.frc-focus-row` has no intrinsic
  width and reflows. That reasoning was WRONG and is written down here so nobody re-derives it:
  the preview sets `maxWidth: 760`, the product's grid cell is narrower than that, so the story
  really is wider than its cell and really does crop in grid view. The check measured a real
  thing. `cardMode: "column"` is the tool's own named remedy, presentation-only and free —
  when the remedy costs nothing, apply it rather than arguing the check down.

### Scanning rendered text — two traps that both produce false positives

Both bit a real dropped-copy scan on 2026-08-25, and each one demands a fix to code that is
already correct, which is the expensive kind of wrong:

- **Case.** `innerText` returns the RENDERED string, and this system uppercases eyebrows,
  labels, badges and subteam names in CSS. A case-sensitive `includes()` reports
  `slot="eyebrow"` "Monday muster" as dropped while "— MONDAY MUSTER" is plainly on screen.
  Compare case-insensitively.
- **Audience chrome.** `.frc-audience-only-external` is `display: none` on an internal deck and
  `display: revert` on external, so `ClosingSheet`'s `slot="name"` ("Lead sponsors") is present
  and rendered but inside a hidden ancestor. Same trap as `.frc-footer-first`, recorded below.
  A scan must resolve audience chrome before reporting, or it will demand a "fix" that breaks
  the audience rule.

## Asset-pending components (IMPORTANT for review)

Updated 2026-08-24. What is WIRED now: the three team **marks**, the three **logotypes**, and
the **season artwork** (FRC 2027 BIOCORE, from the FIRST season brand downloads page). So
MarkGlyph, Logotype, DeckFooter and SeasonLockup all render real artwork; at the previous
sync three of those were empty boxes.

Still deliberately empty, and their cards correctly show the system's **marked empty slot**:

- **SealMark** — the canonical `5669-Seal.svg` carries `#ffe623`, not the published Techmen
  Gold `#FFE629`. Fetched, checked, and REFUSED; see the `rejected` block in
  `assets/PROVENANCE.json`. The empty slot is the true state, not a broken render.
- **ProgramLockup** and the DeckFooter external zone — no FIRST program artwork in the repo.
- **ImageFrame / CalloutDrawing** — no photography or drawings in the repo.
- **SponsorWall / PartCallout / Cutout** — no sponsor marks or part photography.

Those cards are graded `good` on purpose: an empty slot at the correct minimum size IS what
the component does today, and hiding it would misrepresent the system to the design agent.

## Upload status — sheets ADDED (2026-08-24)

**131 files written, verified by `list_files`:** `components/sheets/<Name>/` x 26, each with
`.jsx` `.d.ts` `.html` `.prompt.md` (104), `_preview/<Name>.js` x 26, and `_ds_needs_recompile`.
Cards index off each card HTML's first-line `@dsCard` marker, so no `register_assets` was
needed. **Nothing else on the project was touched** — `_ds_bundle.js`, `_ds_bundle.css`,
`styles.css`, `_vendor/*`, `README.md`, `_ds_sync.json` and `_adherence.oxlintrc.json` are
byte-unchanged, which is the whole point of the additive plan (see the sheets-pass section).

**All 26 cards were rendered in headless Chromium before upload**, against a bundle built
from HEAD: every one is the right sheet kind, paints 922 x 691, resolves `--bg0` to the
squadron literal, carries real copy, shows the footer rail (HubSheet correctly excepted),
and produces zero guard fault markers and zero console errors. `SafetySheet` renders its
`SafetyNote` and does not trip its guard.

**The manifest may need one browser visit to recompile.** Same as the first sync: the
`_ds_needs_recompile` fence is uploaded, but the platform's self-check runs when the project
page is opened. Open the project once and the 26 sheet cards appear in the pane.

## Upload status — first sync, Core + Brand (2026-08-23)
The login blocker cleared. Project **FRC 5669 Techmen Design System**,
`projectId 0ae827ec-d481-4eb8-a051-772544deb9c4` (pinned in config.json).
**83 files uploaded**, verified by `list_files`: `_ds_bundle.js` / `_ds_bundle.css` /
`styles.css` / `README.md` / `_ds_sync.json` / `_ds_needs_recompile`, `_preview/*.js` (15),
`_vendor/react{,-dom}.js`, and `components/**` (15 x `.jsx` `.d.ts` `.html` `.prompt.md`).
Cards are indexed off each preview HTML's first-line `<!-- @dsCard group="…" -->` marker, so
no `register_assets` call was needed. Scope is still Core + Brand only — data, surfaces,
forms and sheets are deliberately unsynced.

**Deliberately NOT uploaded** (local build/grade artifacts): `.ds-bundle`,
`.ds-build-meta.json` (the emitter comments say so explicitly), `.render-check.json`,
`.review.html`, `.stories-map.json`, `_screenshots/`.

**Gap found while verifying, now CONFIRMED UNFIXABLE through the pipeline** — see the templates section below:
the converter emits no `templates/` directory, so the DS's own
`templates/Deck.dc.html` (registered in `_ds_manifest.json` under `startingPoints`
as "Deck shell — Copy this") never reached the project. Claude Design therefore offers
no Techmen starting point and generates decks from Blank.

## Component findings the sync surfaced (2026-08-25) — FIXED in `slots.jsx` + `Blocker`

Grading the 26 sheet patterns for the first time found **copy that never reached the DOM**.
Two patterns, one root cause, and it is the sharpest form of the `slotted()` hazard recorded
below: the card looks finished and is not, so no amount of DOM measurement catches it —
only looking, or diffing authored copy against rendered text, does.

**Root cause: rendering a slot must CONSUME its name.** `slotted()` painted the system class
onto the author's element and left the `slot` attribute on it. Render that result inside
another component that runs its own `pickSlots` and the still-named element is sorted into a
bucket of the INNER component's vocabulary — one it very likely does not render. The copy is
dropped silently: no error, no empty-slot marker, nothing missing from the props.

- **Fixed generally in `components/slots.jsx`** — `slotted()` now strips `slot` on the way
  out, at both ends (the author element and a host that hoisted the name). This is the fix
  that matters: it covers every call site, including the ones nobody has written yet.
  `SubteamStatus` → `Card` (six subteam notes dropped) needed no edit of its own once this
  landed.
- **`Blocker` → `FocusRow`** additionally re-labels on the way down, because that is a real
  vocabulary translation rather than a leak: `Blocker` speaks state/title/owner, `FocusRow`
  speaks rank/label/value. It uses `cloneThroughHost(slots.title, { slot: 'label' })`, which
  keeps the AUTHOR's element — the thing `slotted()` needs to paint a box on. Wrapping in a
  fresh `<span slot="label">` also renders, but puts the class on the wrapper instead of the
  author's element, so it would silently lose any box property those classes ever gain.

**The rule for composing one component out of another: RE-LABEL BEFORE FORWARDING, out loud.**
A slotted child is addressed to exactly one component. Passing it on unchanged is not a
pass-through, it is a second address that usually does not exist.

**Known residue, deliberately not chased:** a child passed as an ordinary child rather than
through `slotted()` still carries its `slot` attribute into the DOM (`slot="state"`,
`slot="eyebrow"`, `slot="aside"`, `slot="status"` are all visible in a rendered sheet). That
is inert — no rule in the token sheets selects on `[slot]` — and it only becomes a hazard if
such a child is handed to another `pickSlots` component, which is exactly the `Blocker` case
above and is why that one re-labels explicitly.

## Component findings the sync surfaced (2026-08-24) — NOT yet fixed in the DS

Authoring 36 previews put every component under a narrow viewport for the first time. Three
real defects fell out. None is a preview problem; each was worked around in the composition
and the workaround is commented at the top of the preview file.

1. **`SampleGrid` renders `slot="caption"` as a grid CELL.** `SampleGrid` puts
   `slotted(slots.caption, 'frc-spec-caption')` inside `.frc-samples`, which is the grid
   itself — so a caption takes cell one, every sample shifts one position, and the last one
   wraps to a second row. `cols={4}` with four samples became a 3+1 layout. The DS's own
   `SurfacesDemoCard` never passes a caption, which is why this was never seen. Fix belongs
   in `SampleGrid.jsx`: the caption needs to sit outside the grid element, the way
   `SpecTable` and `BarChart` do it.
2. **`QuoteBlock` runs `attr` and `role` together.** Both land in one `<figcaption>` as
   adjacent inline spans with nothing between them: "MR. GARZA" + "LEAD MENTOR, ELEVEN
   SEASONS" reads as one run-on line. `.frc-quote-role` has a colour but no separator and no
   display rule. Worked around by writing the role as a block element (`<div slot="role">`).
3. **`ResultBanner` runs `title` and `note` together for the same reason.** The slot helper
   deliberately KEEPS the author's element and only paints the class onto it, so
   `<span slot="title">` stays inline and the note follows on the same line —
   "Qualification 42RED ALLIANCE". Worked around by writing `<h3 slot="title">`.

(2) and (3) share a root cause worth stating plainly: **`slotted()` keeping the author's
element means the element choice is load-bearing API**, and nothing in the `.prompt.md` files
says so. Either the components should force a block element for these slots, or the prompts
should say which slots need one. Until then the previews demonstrate the right choice, which
is the next best thing since the design agent imitates the previews.

## Authoring previews for THIS DS — the viewport rule

The card capture viewport is far narrower and shorter than the 1920x1440 stage these
components were drawn for, so the DS's own demo-card compositions do NOT port over verbatim.
Measured limits, all found by grading and fixing:

- **Stacked items: three.** Four `TimelineItem`s, four `Step`s, five `Callout`s and six
  compact `RoleCard`s all clipped at the bottom of the cell.
- **Hero numerals: two per row.** `MatchClock` is `--fs-hero` (160px); four across collided
  into each other. `StatBlock`/`BuildCountdown` at three across are fine.
- **`ProcessPipeline`: four steps.** It lays out on one row by design; the fifth crops off
  the right edge.
- **`GanttChart` bar copy: two words.** The bar is only as wide as its span, so a phrase
  truncates. The row label carries the noun.
- **Empty slots: no caption, and no `file=` on a small slot.** The marker prints
  `Empty slot - expected <file>` and a long filename is taller than a sponsor tier slot; a
  caption under a small slot lands ON the marker. Drop `file=` and the marker is the short
  `Empty cutout slot`.
- **Never a dash as a numeric placeholder.** An em-dash at `--fs-hero` in the display face
  renders as a solid bar and reads as a rendering fault. `AllianceSplit` shows a live score
  with no `outcome` instead.

`cfg.overrides` now carries `cardMode: "column"` for **30** components — every one the
`[GRID_OVERFLOW]` check flagged. Charts, tables, banners and multi-column grids all render
wider than a grid cell and need full card width.

## Run 2026-08-25 — 79 uploaded, anchor moved 346309e60f98 -> ea92ff4e4264

One driver run, exit 0, all four stages green, zero warn lines, zero unmerged
learnings. Partition: **52 verified-by-upload, 0 changed, 27 new, 0 removed**,
plus **FocusTable as an artifact-churn canary with stable sources**. The 27 are
the 26 sheet patterns (which the old anchor never recorded) and DeckSteps.

**The font tax is gone and it is worth recording what it was worth.** 79 card
renders in **50 s**, mean **0.64 s/card**, max gap 1 s, **zero cards >=12 s**.
The previous run measured ~13 s per card because the remote Google Fonts
`@import` never let `networkidle` settle. If a card ever takes 12 s again, look
for a reintroduced remote request before suspecting a flake.

**Every card rendered in real Space Grotesk / Space Mono for the first time.**
The fallback measured ~16% wider, so the risk was line-break regressions. Two
mechanical sweeps over all 26 sheets found the real face made things BETTER or
neutral, never worse:

- Rail collisions / sheet overflow: **1 of 26** (MatchBreakdownSheet, below).
- Text clipped by its own container: **1 of 26**, and it is the documented
  SponsorSheet empty-slot marker (21 px), unchanged by the font.

Visible improvements, from looking: CoverSheet's hero now sets on ONE line
("Build season starts Saturday") where the fallback broke it across two;
AwardPlate's "Industrial Design Award" went three lines -> two; ClosingSheet's
lede went two lines -> one; SplitSheet's body three -> two.

### Standing defects, all pre-existing, none introduced by the fonts

1. **MatchBreakdownSheet's bottom Callout overlaps the footer rail.** Measured
   before: 34 px scaled / ~71 px unscaled. Measured now with real metrics:
   **36 px scaled / ~75 px unscaled** — marginally WORSE, and its body paints
   under the rail. It is the only sheet of 26 with any collision. NOT redesigned
   in this run, by instruction.
2. **ResultBanner runs `title` into `note`** ("Quarterfinal 2RED ALLIANCE").
   Visible on AwardSheet. The real face neither fixed nor worsened it.
3. **QuoteBlock runs `attr` into `role`** ("SENIOR, CLASS OF 2026DRIVE COACH").
   Visible on QuoteSheet. Same status.

(2) and (3) share the root cause already recorded above: `slotted()` keeps the
author's element, so the element choice is load-bearing API. They are cosmetic
run-ons, not dropped copy — distinct from the two defects fixed this pass.

### Confirmed on the PROJECT, not locally

The two cards that had been wrong on the project since the sheets pass:

- **BlockerSheet** — all four rows now read badge + blocker text + owner
  ("BLOCKED Router table down, four parts queued Fabrication", ...).
- **SubteamStatusSheet** — all six cards carry their status line.

0 page errors, 0 guard fault markers, computed font `"Space Grotesk"`.

**A LIMIT WORTH KNOWING FOR NEXT TIME:** `_ds_bundle.js` is 372 KiB and
`_ds_bundle.css` is 488 KiB, both over `DesignSync(get_file)`'s 256 KiB cap, so
the project's bundle CANNOT be fetched back and re-rendered byte-for-byte. The
chain actually verified was: the project's own `_ds_sync.json` reports
`bundleSha12 ea92ff4e4264`; `sha256(local _ds_bundle.js)[:12]` equals that; the
project's own card HTML and `_preview/*.js` were fetched and carry the fixed
composition; those render the copy against that bundle. The one unverified link
is that the project's stored bundle bytes hash to what its own anchor claims.

### Fonts ship INLINED, which is why `fonts/` is empty

The converter inlines the 18 self-hosted woff2 as `url(data:font/woff2;base64,…)`
inside `_ds_bundle.css` (488 KiB, up from 95 KiB), reachable from `styles.css`.
So `ds-bundle/fonts/` having zero files is CORRECT, not a miss — and there are
zero `http` references left anywhere in the shipped CSS. Do not go hunting for a
`fonts/` directory next run.

## Run 2026-08-25b — slot-element work uploaded, anchor ea92ff4e4264 -> d74b887ca268

One driver, exit 0, four stages green, zero warn lines, zero unmerged learnings.
Run **without `--remote`** on purpose: the previous run proved that a healthy
anchor lets grades carry, and those grades had been minted against the wrong
fonts. No anchor plus a cleared `.cache/review` means the partition CANNOT
carry anything — 79 added, **79 pendingGrade**, all re-graded by looking.

Cards: 79 in **50 s**, mean **0.65 s**, max 1 s, **zero >=12 s**. No remote
import returned.

### The finding this run produced, and it was mine

The geometry sweep against the build I had verified locally came back with
**52 changed boxes, all in MatchBreakdownSheet** — a ~19px lift of everything
below the match clock. Cause: after running the before/after diff I patched
`.frc-clock-phase` into the `:where()` UA reset to satisfy ds:audit check 31,
and never re-measured. The check caught a real gap; the patch that answered it
went unmeasured. **Re-run the geometry sweep after ANY late patch, including
one made to satisfy the audit.**

The movement is correct on the merits and was accepted: `.frc-clock` declares
`display: grid; gap: var(--space-2)`, so the user-agent `<p>` margin was
stacking on top of a gap the component already provides, and it only applied
where the slot fell back to a `<p>` — the same element-dependence being
removed. Side effect worth recording: MatchBreakdownSheet's standing
callout/rail overlap improved from **36px to 16px**.

Everything else matched the intended 11-box diff exactly.

### Confirmed on the project

AwardSheet and QuoteSheet were rendered from the project's own preview bytes.
The uploaded QuoteSheet preview writes `<span slot="attr">` and
`<span slot="role">` — plain adjacent spans, the exact composition that used to
run together — and they now render on separate lines (role 14px below attr).
AwardSheet: title block, note 27px below, on both banners. 0 page errors,
0 guard faults.

**Same fetch limit as last run:** `_ds_bundle.js` (386 KiB) and
`_ds_bundle.css` (494 KiB) exceed `get_file`'s 256 KiB cap, and this build emits
NO separate `tokens/` directory — the 75 pinned display rules and the `:where()`
reset are inlined into `_ds_bundle.css`. So the project's stylesheet cannot be
fetched back and re-read. The chain verified: project previews fetched and
rendered, against the local bundle whose sha256 prefix is `d74b887ca268` and
which is the exact file this plan uploaded.

## Re-sync risks / watch-list (refreshed 2026-08-24)

- **A bundled-skill update re-verifies everything.** This run found `keyRecipe` had moved
  5 → 7, so the driver fell back to the render-hash partition and reported 16 changed / 36
  new / 0 unchanged — i.e. nothing carried forward. That is correct behaviour, not a fault;
  just budget for a full grading pass whenever `.ds-sync/` is re-staged from a newer skill.
- **`@types/react` (`npm i --no-save`) and the `.ds-sync` playwright install are still not in
  package.json.** A fresh clone must re-do both. Chrome is used via `DS_CHROMIUM_PATH`; no
  chromium is downloaded.
- **`componentSrcMap`/`docsMap` no longer rot** — regenerate them from `_ds_manifest.json`
  (recipe in the Scope section). If a component is renamed, ds:audit catches the manifest
  first, then the regenerate picks it up.
- **`.design-sync/conventions.md` now exists and is the `readmeHeader`.** It is
  human-editable and belongs to its authors: a later sync VALIDATES its names against the
  fresh build and reports drift, and must not rewrite it.
- **The 26 sheet patterns are synced as of 2026-08-24** — see the sheets-pass section above.
  What is still outstanding there is the BUNDLE: it predates the host-transparency work, and
  refreshing it needs the real converter.
- **`templates/` still cannot be emitted** — unchanged, see that section below.

## First-deck verification (2026-08-23)
Generated one deck in Claude Design against the uploaded system — project
`837b5a2c-ad3d-4140-b791-e495e78c20ea`, "Biocore Kickoff", 3 sheets + a 4th DIAGNOSTIC sheet
added afterwards that measures and prints its own live computed values. The preview iframe is
cross-origin to claude.ai and its serve URL is token-gated, so the deck was made to report on
itself rather than being scripted from outside. Raw lines it rendered:

    deckRoot.className = frc-deck
    getComputedStyle(deckRoot)['--gold'] = #FFE629
    frc-ground-squadron -> --accent = #FFE629 | --bg0 = #000000 | --glow = 0 0 18px rgba(255,230,41,0.45), 0 0 48px rgba(255,230,41,0.18)
    frc-ground-field    -> --accent = #FFE629 | --bg0 = #0E1013 | --glow = 0 0 18px rgba(255,230,41,0.40), 0 0 48px rgba(255,230,41,0.14)
    frc-ground-paper    -> --accent = #7A6300 | --bg0 = #E9E7E1 | --glow = none
    document.querySelector('.frc-deck') non-null = true

1. **Shell class: `.frc-deck` yes, ground class on the root NO.** The generated root carries
   `frc-deck` alone; the three ground classes were put on the `<section>` sheets instead.
   Nothing rendered unstyled, because `tokens/colors.css` splits the two scopes: the raw
   palette is declared on `:where(.frc-deck, .frc-ground-*)` — which is why `--gold` resolved
   on a root with no ground — while the 36 semantic aliases are declared ONLY on the three
   `.frc-ground-*` classes. Every sheet carried a ground, and the deck-stage script reads
   `--bg0`/`--edge` off the ACTIVE SHEET, not the root, so the letterbox painted correctly too.
   The latent risk is real but narrow: content placed directly in the deck root, or a sheet
   that omits its ground class, gets the palette and no aliases.
   **Diagnosis — the template fix, not the `:root` fix.** Moving tokens to `:root` is the
   wrong move and would undo a deliberate decision: the app's `src/theme.css` defines `--gold`,
   `--fault` and `--font-mono` too, the scoping exists to keep them apart, and the measured
   values prove the scope resolves correctly. The defect is upstream of the tokens — the deck
   was generated from Blank because `templates/Deck.dc.html` (whose root reads
   `frc-deck frc-ground-squadron frc-audience-internal frc-letterbox`) was never uploaded.
   Fix by adding `templates/` to the upload plan so the registered startingPoint exists.
   NOT changed here, per instruction to report before changing.
2. **`--gold` = `#FFE629`.** Exact published Techmen Gold, resolved on the deck root. No
   fallback, no browser default.
3. **Ground switching reswatches.** Squadron/field/paper each returned their own literals from
   a live probe. Paper behaves as specified: accent drops to bronze `#7A6300`, `--glow` is
   `none`, and value inverts (`--bg0 #E9E7E1`). Visible in the deck too — sheet 1 (squadron)
   is near-black, sheet 2 (field) is a distinctly lighter slate.
4. **Copy IS editable on the canvas.** In Edit mode, selecting the StencilTitle and the Eyebrow
   each exposed a `Text > Content` field holding the child string. Both were retyped
   ("EDIT PROOF 5669" / "EYEBROW EDIT OK"), both updated live and kept their component styling
   (gold + glow on the title, gold dash + mono caps on the eyebrow). The edits were then
   discarded. The copy-placement rule in `FRC_Design_System.md` holds, so the 26 sheet
   patterns are not built on a false assumption.

`--ink` printed empty in all three grounds — correct, not a failure: this DS has no `--ink`
token, foreground is `--fg` / `--fg-dim` / `--fg-hero`.

## Fail-safe default ground (2026-08-23)
`tokens/colors.css` keeps the split it always had — raw palette on
`:where(.frc-deck, .frc-ground-*)`, the 36 semantic aliases on the ground classes — but
`.frc-deck` now SHARES the SQUADRON block instead of resolving nothing. One literal
declaration, not a duplicated set. FIELD and PAPER still override by inheritance.

The bug this closes is partial resolution, which is worse than total failure: a groundless
root still painted `--gold` from the palette, so it looked almost right.

Source order is load-bearing and is now checked. On a single element carrying `.frc-deck`
AND a ground class the two selectors tie on specificity, so the later block wins — the
shared block must stay above field and paper.

**Measured in headless Chrome** (`playwright-core` + the machine's Chrome), comparing every
computed value against `tokens.js` rather than a hand-typed list. Six states, all PASS:
content directly in a groundless `.frc-deck` root; a `.frc-sheet` with no ground class; a
field sheet; a paper sheet; one element carrying `.frc-deck` AND `.frc-ground-paper`; and an
element nested deep under a paper sheet. All six resolve 36/36 with 0 mismatches.
**Positive control:** with the `.frc-deck,` line removed, the first two states resolve
**0/36** while `--gold` still resolves `#FFE629` — exactly the almost-right state.

**ds-audit check 14** enforces it, in four parts: (a) `.frc-deck` shares the squadron block
and no other selector duplicates the 36; (b) field and paper stay after it in source order;
(c) each of the four reachable states resolves the full set, with the deck-root state derived
from the actual selector rather than assumed; (d) every `var(--x)` in the token sheets that
has no fallback is declared somewhere (declarations collected across all token sheets, since
typography declares the scale surfaces.css consumes). Four negative controls all caught.

## templates/ cannot be emitted — confirmed, not forced (2026-08-23)
**The converter has no template concept at all.** Not a missing setting: the complete
`cfg.*` surface is shape, pkg, globalName, entry, srcDir, tokensGlob, cssEntry,
componentSrcMap, docsMap, docsDir, guidelinesGlob, extraEntries, extraFonts, tokensPkg,
overrides, libOverrides, replaces, provider, storyImports, storybookStatic,
storybookConfigDir, titleMap, dtsPropsFor, tsconfig — and the words "template" and
"startingPoint" appear nowhere in the build, validate or resync sources.

**The platform does support templates**, and the shape is known from the IDEA design system
in the same account, whose four templates work: one `templates/<slug>/` directory each,
holding the entry file, its support scripts, its images and a `.thumbnail`, registered in the
platform-compiled `_ds_manifest.json` under **`templates[]`** as
`{name, description, folder, entryPath, thumbnail:{path, kind:"captured"}}`.

**`startingPoints` is not the platform's key.** IDEA's compiled manifest has
`startingPoints: []` while all four of its templates work. So the `startingPoints` entry in
our own `_ds_manifest.json` matches nothing upstream — it is our local vocabulary, read only
by ds-audit. That was the quiet part of this gap.

**Hand-upload was tested and does not register.** `templates/deck/Deck.dc.html` was uploaded
through the DesignSync write path. The file landed (confirmed by `list_files`), the
`_ds_needs_recompile` fence was consumed — so the self-check DID run — and the recompiled
manifest still reported `templates: []`, `startingPoints: []`, `hasThumbnailHtml: false`,
`source: design-sync-cli`. No template appeared in CHOOSE A TEMPLATE, and the design system
page grew no Templates nav section (IDEA's has one). The probe file was then deleted.

A working template folder would additionally need a captured `.thumbnail`, a root
`thumbnail.html`, and a copy of `support.js` — which is the platform's own dc-runtime,
emitted per design project and marked "GENERATED … do not edit". Vendoring that into the
bundle is a real decision, not a packaging tweak, so it was not done.

**Docs corrected rather than the pipeline forced**: the `templatesNotEmitted` block in
`_ds_manifest.json`, the header of `templates/Deck.dc.html`, and both README claims now say
the deck shell is a hand-copy artifact that Claude Design never sees.

### What the Blank path actually loses
Measured by reading the generated `Biocore Kickoff.dc.html` source directly through the
app's own GetFile RPC. Present or absent, each named:

- **4:3 1920x1440 stage — ABSENT.** The generated stage carries `data-aspect="16:9"`; the
  source contains `1920` and `1080` and no `1440` anywhere.
- **Letterbox — ABSENT.** The string `letterbox` does not occur in the file: no
  `.frc-letterbox` class, no fixed-inset rule, no centering wrapper.
- **Footer rail — PRESENT.** Not from the template: the deck uses the `DeckFooter`
  *component* on 3 of its 4 sheets, which emits `.frc-footer` at run time. This is why the
  rail, the 5669, the deck name and the sheet counter all rendered correctly. (The 4th sheet
  is the DIAGNOSTIC sheet added during verification, which has no footer by design.)
- **Deck-stage script — ABSENT as written; partially re-created.** `frcDeckStage` is not in
  the file and neither is `getComputedStyle(sheets[current])`. The deck wrote its own smaller
  stage logic: it has `keydown` and `resize` handlers, a scale transform, and it does read
  `--bg0` — but it never reads `--edge`, and with no letterbox there is nothing to paint. So
  the specific behaviour the template exists for, *painting canvas and letterbox from the
  active ground so a transition never flashes white*, is absent.
- Also absent: the audience class (`frc-audience-*` occurs 0 times) and the thumbnail rail
  (`T` key), which the template ships.

The root-class finding from the first verification is unchanged and consistent: root
`className` is exactly `frc-deck`, grounds live on the sheets.

## DeckStage, and the shell demoted to reference (2026-08-23)
The deck shell is no longer a starting point, so its stage script had nowhere to
live. It is now **`components/brand/DeckStage.jsx`** — the one component in the system
that is behaviour rather than appearance. Every deck mounts it **exactly once**.

It paints the canvas, the letterbox and the thumbnail frames from the **ACTIVE sheet's**
`--bg0` and `--edge`, and repaints on every sheet change. `--edge` is the whole job: the
generated deck rolled its own stage logic and read `--bg0` but never `--edge`, which is
precisely the white flash a transition exposes. Reading the tones off the active *sheet*
rather than the deck root is what stops a paper sheet sitting in a black letterbox.

It does not own the deck root. It finds the root by walking up from its own marker node
and READS what is there; six states trip the guard and render the shared rust marker
(throwing only under harness mode): no `.frc-deck` ancestor, no `.frc-stage`, no
`data-aspect`, no ground class, no audience class, a second instance. The middle four are
exactly what a deck generated from Blank lands in.

**One scoping rule that is not in the brief and was added deliberately:** the DOCUMENT
canvas is painted only when the deck owns the viewport, which is what `.frc-letterbox` on
the root declares. Without it a demo card or a proof would repaint the whole host page.
An embedded deck paints itself and leaves the page alone.

### Verified at /_ds
A new **DeckStage** section mounts three correct decks (one per ground) and all four
broken states, and measures rather than asserts. On a clean load: **4 markers, 0 thrown**,
verdict PASS.

    squadron  --edge rgb(0,0,0)       -> canvas rgb(0,0,0)       match | --bg0 rgb(0,0,0)       -> stage match
    field     --edge rgb(5,7,10)      -> canvas rgb(5,7,10)      match | --bg0 rgb(14,16,19)    -> stage match
    paper     --edge rgb(220,217,209) -> canvas rgb(220,217,209) match | --bg0 rgb(233,231,225) -> stage match

FIELD and PAPER are the load-bearing rows: on both, `--edge` differs from `--bg0`, so a
match proves `--edge` is genuinely read rather than `--bg0` reused. On SQUADRON the two are
both black, which is why that row alone would prove nothing.

Each broken state showed its marker with the right rule: no `data-aspect`, no ground class,
no audience class, two instances. Flipping the harness toggle produced **4 throws, 0
markers**, with the three correct decks still driving — the same component doing both, per
the Invariant guards rule.

Repaint-on-change was measured live in the Brand demo card's miniature deck: stepping
squadron -> paper moved the canvas from `rgb(0,0,0)` to `rgb(220,217,209)`, the stage to
`rgb(233,231,225)`, the thumbnail rail to the paper edge, and the current-thumb marker to
index 1 — while the host page background stayed `rgb(10,11,13)`, untouched, which is the
viewport-ownership rule working.

Wiring count is now **93 component roots mounted from source**, DeckStage among them, and
`DeckStage` roots visibly rendered = **0**.

**A harness-ordering bug was found and fixed rather than worked around.** The harness flag
is a single module global that `RefusalsSection` also owns. A guard trips inside its own
layout effect and re-renders before any passive effect of the section around it, so the
broken decks were throwing on first paint no matter where the flag was set. The section now
sets the flag in a passive effect (which runs after `RefusalsSection`) and mounts the broken
decks only once it has settled. Setting it during render was tried first and was not enough —
that is recorded because the next person will reach for it too.

### Docs corrected
`_ds_manifest.json` no longer carries **`startingPoints`** at all: the platform reads
`templates[]`, and that key described a route into Claude Design that does not exist. Both
templates are now `copied: false` **and** `startingPoint: false`. The headers of
`templates/Deck.dc.html` and `templates/Specimen.dc.html`, `README.md`, `SKILL.md` and
`CLAUDE.md` now say the same thing: neither file is a starting point, no template can reach
Claude Design from a repo-sourced design system, and a deck starts from Blank and assembles
out of the library.

`ds-audit` follows: check 11 became "neither template is a starting point and the manifest
carries no startingPoints key", and a new **check 15** requires DeckStage to be registered,
to read both `--bg0` and `--edge`, to import the shared guard, and requires its prompt to
state the mount-once rule. Seven negative controls, all caught.

## Governing docs committed, letterbox CSS gap closed, resync to 16, deck check 43 passed (2026-08-23)

**Governing docs are now in the repo.** `docs/FRC_Design_System.md` v1.6 and
`docs/FRC_CLAUDE_DESIGN_STANDARDS.md` v1.5 are committed under `src/lib/design-system/docs/`
and referenced from `README.md`, `SKILL.md` and `CLAUDE.md`. The reason, stated in both
files' own changelogs: a prior session built `DeckStage` without them because an attachment
did not arrive, and a repo file at HEAD cannot fail to arrive the way an attachment can.

### Reconciliation against v1.6 / v1.5

**Found and fixed — a real gap, not a documentation nit.** `.frc-letterbox` and
`.frc-thumbs-dock` had their CSS rules (`position: fixed; inset: 0; overflow: hidden`, and
the absolute-positioned `.frc-stage` override) declared **only** inside the two templates'
own inline `<style>` blocks — never in `tokens/deck-motion.css` or anywhere else that ships
in `styles.css`. Since nothing is copied any more, a deck assembled from Blank that set
`.frc-letterbox` on its root per the routing header would get a class `DeckStage` reads
correctly but that does **nothing visually** — no fixed positioning, no viewport clipping,
no absolute-positioned stage to scale into. `DeckStage` would still paint colors onto
`document.documentElement`/`body`, but the deck itself would sit in normal document flow at
its native 1920×1440 size rather than being pinned and scaled to the viewport.

**Fixed** by moving both rules into `tokens/deck-motion.css`, beside the `.frc-stage` and
`.frc-thumbs` rules that already live there, and removing the now-redundant copies from both
templates (whose headers already claimed "every token, class and animation comes from
../styles.css — nothing below is a token", which is now true rather than contradicted).
**Verified in headless Chrome** against the bundled `styles.css` closure: a `.frc-deck
frc-letterbox` root resolves `position: fixed` / `inset: 0` / `overflow: hidden`, and its
child `.frc-stage` resolves `position: absolute`, `top: 0`, `left: 0` — matching the values
the template used to hardcode.

**No other disagreement found.** `DeckStage`'s six guard states were already correct against
both v1.6's summary sentence and standards check 43: it does **not** guard on a missing
`.frc-letterbox` (deliberately — its absence is legal for an embedded deck), matching
"the one `DeckStage` cannot guard on" in both documents exactly. The four states the design
doc's summary sentence names (missing aspect/ground/audience, a second instance) are a subset
of the six actually implemented; the other two (no `.frc-deck` ancestor, no `.frc-stage`) are
structural prerequisites the summary sentence doesn't itemize, not a contradiction.

**Cosmetic reconciliation**: `DeckStage`'s position in `_ds_manifest.json`'s `components[]`
and in `components/brand/index.js` was moved to sit right after `DeckFooter`, matching the
brand group's listed order in `FRC_Design_System.md` v1.6 (`SealMark, MarkGlyph, Logotype,
DeckFooter, DeckStage, ProgramLockup, …`). No functional effect — no audit check reads order.

### Resync — Core + Brand, now 16

`DeckStage` added to `.design-sync/config.json`'s `componentSrcMap`/`docsMap`, and
`.design-sync/previews/DeckStage.tsx` authored (two variants, `Squadron` and `Paper` — the
pair that proves `DeckStage` paints from the *sheet's* ground, not the root's, since `--edge`
and `--bg0` differ visibly between them). Rebuilt: **16/16 components, 16/16 previews render
cleanly** (`package-validate.mjs`). The `brand__DeckStage.png` render check screenshot shows
exactly what it should: a black squadron cell and a light paper cell side by side, each
showing the *stage* fill (`--bg0`) distinct from the *canvas* — proving the static preview
renders the paint correctly even without interaction.

Uploaded (88 files: 83 prior + `_preview/DeckStage.js` + `components/brand/DeckStage/{.jsx,
.d.ts,.html,.prompt.md}`). The manifest did **not** recompile from the upload alone — same
behavior as the first sync — recompiling required opening the project page in a browser once,
which is what runs the platform's client-side self-check. After that: `_ds_manifest.json`
reports **16 components** including `DeckStage`, **16 cards**, `source: design-sync-cli`.

### Deck generated, check 43 measured — all five present

Routing header written per the standards v1.5 skeleton, with one deliberate addition flagged
below. Deck: 2 sheets, SQUADRON, internal, `DeckFooter` on both, `DeckStage` mounted once.

**Flag on the routing header text itself.** The doc's own routing-header code block lists
only four explicit "set on the root" bullets — aspect, ground class, audience class, "mount
DeckStage once" — with `.frc-letterbox` mentioned only in prose under the DeckStage bullet
("… so canvas **and letterbox** paint from the active ground"), not as its own bulleted class
to set. But check 43 treats `.frc-letterbox` as a fifth, independent, required item on the
root. Since a prompt built strictly from the quoted four-bullet block would not reliably
produce the class, the prompt used here added a fifth explicit bullet — `Letterbox class:
.frc-letterbox` — to make it unambiguous and directly satisfy check 43's letter. This is a
loose end in the routing-header *text* worth tightening in a future revision of the standard,
not a defect in `DeckStage` or in the audit.

**Measured, not assumed** — verified against the raw `.dc.html` source via the project's own
`GetFile` RPC first, then against LIVE computed values from a temporary diagnostic sheet
mounted in the actual generated deck (removed from nothing — it stays in this one-off
verification deck, which ships to no one):

    frc-deck frc-ground-squadron frc-audience-internal frc-letterbox   (deck root className, verbatim)
    1920px                                                              (.frc-stage computed width)
    1440px                                                              (.frc-stage computed height)
    4:3                                                                 (.frc-stage data-aspect)
    true                                                                (.frc-letterbox === deck root)
    1                                                                   ([data-frc="DeckStage"] count)

All five check-43 items: **PRESENT.**
- Aspect 4:3, 1920×1440, not the 16:9 platform default — **present**, live-measured.
- A ground class — **present** (`frc-ground-squadron`).
- An audience class — **present** (`frc-audience-internal`).
- `.frc-letterbox` — **present**, and correctly IS the deck root (not a separate wrapper).
- `DeckStage` mounted exactly once — **present** (source shows exactly one
  `<x-import component-from-global-scope="FRC5669DesignSystem.DeckStage">`; live count = 1).

This clears the last blocker recorded against syncing the remaining 62 components. Data,
Surfaces, Forms and Sheets remain unsynced by instruction — nothing beyond Core + Brand was
touched this session.
