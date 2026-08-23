# design-sync notes — FRC5669 Design System

## What this syncs
The presentation/materials design system at `src/lib/design-system/` (namespace
`FRC5669DesignSystem`, class prefix `frc-`). It is a **module inside the frc-app Vite
app**, not a standalone npm package — there is no separate build, `dist/`, or
`package.json` for it. The bundle is built by pointing the converter's `--entry` at
`src/lib/design-system/index.js`, which esbuild bundles into `_ds_bundle.js` (all ~77
components on `window.FRC5669DesignSystem`) and inlines `styles.css` (tokens + component
CSS, via its `@import` closure) into `_ds_bundle.css`.

## First-pass scope (this run)
User chose to **scope to a subset first**: only **Core (5)** and **Brand (10)** = 15
components. The other groups (data, surfaces, forms, sheets — ~62 more) are in the JS
bundle but have no cards/.d.ts/.prompt.md emitted yet. Expand on a later sync by adding
their entries to `componentSrcMap` + `docsMap` in config.json (same pattern).

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
- **Fonts**: the DS loads Space Grotesk / Space Mono / Roboto via a **remote Google Fonts
  `@import`** (`tokens/fonts.css`). Reported as `[FONT_REMOTE]` — informational, they load
  at runtime, nothing to ship. This is the DS's one documented external-host exception.

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
- `[FONT_REMOTE]` Space Grotesk / Space Mono — expected (remote font host), not a miss.

## Asset-pending components (IMPORTANT for review)
The DS deliberately ships only the **3 team marks** wired (`Mark-{Gold,White,Black}.svg`).
Every other asset (Type/logotype wordmark, 5669 seal, FIRST program logos, season art) is
intentionally NOT in the repo yet — the components render a **marked empty slot at the
correct minimum size** until the file lands. So these cards show placeholder boxes, which is
the components' true current state, not a broken render:
- **SealMark** — placeholder only (seal SVG pending)
- **Logotype** — placeholder only (Type-*.svg pending)
- **DeckFooter** — rail is complete; the logotype/FIRST logo slots are placeholders
- **ProgramLockup** — program color rules + TEAM 5669 render; FIRST program logo slot is a placeholder
- **SeasonLockup** — Biocore title renders; season-art slot is a placeholder
**MarkGlyph** renders the real wired winged mark (the visual hero of the brand group).

## Upload status — DONE (2026-08-23)
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

## Re-sync risks / watch-list
- **`@types/react` (`--no-save`) and the `.ds-sync` playwright install are gitignored / not
  in package.json** — a fresh clone must re-do both (see above) before build/validate.
- **`componentSrcMap` + `docsMap` are hand-enumerated** (15 entries each). Renaming/moving a
  component file, or expanding scope, means editing both. They rot silently if a path moves.
- **`_ds_sync.json` anchor is now uploaded**, so the next sync diffs against it instead of
  re-verifying all 15 from scratch.
- **The bundle carries all ~77 components but only 15 are documented.** The design agent can
  still reference undocumented exports on the global; that's fine, just unadvertised.
- Grades live in `.design-sync/.cache/review/` (gitignored). They are durable now that the
  uploaded `_ds_sync.json` exists.
- **`templates/` is outside the converter's emit set, and hand-uploading it does NOT
  register either** (tested — see the templates section below). Expanding component scope
  will not change this. Treat the deck shell as a hand-copy artifact.

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
