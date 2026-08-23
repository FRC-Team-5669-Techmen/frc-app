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

**Gap found while verifying, NOT fixed here** — see the deck-shell finding below:
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
- **`templates/` is outside the converter's emit set.** Expanding scope will not fix the
  missing deck shell on its own — it has to be added to the upload plan by hand.

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
