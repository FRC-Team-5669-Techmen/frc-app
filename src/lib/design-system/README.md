# FRC5669DesignSystem

The visual identity system for FRC Team 5669 (Techmen) decks and materials, authored as React so Claude Design can source it from GitHub. Specification: `FRC_Design_System.md` v1.1 (2026-08-22). It is authoritative for every color, token, class and rule.

**Built fresh, never extracted.** `frc-app` predates any token layer, so nothing here was derived from the existing app CSS or components. Migrating the app surfaces onto these tokens is separate work with its own prompts and its own risk; it does not block deck production. This bundle shares nothing with IDEA: its own namespace, its own tokens, no shared stylesheet.

## Layout

```
styles.css                 the single entry — imports only, defines no token
tokens/                    fonts · colors · typography · effects · surfaces · motion · deck-motion · image-slot
                           · data · surface-components · forms   (fixed import order)
tokens.js                  literal mirror of the token layer (proofs + manifest)
assets.js                  expected asset paths, URLs (null until supplied), minimum sizes
components/core/           Button, Eyebrow, Divider, ChevronRail, TeamWordmark   (+ icons.jsx, CoreDemoCard.jsx)
components/brand/          SealMark, MarkGlyph, Logotype, DeckFooter, ProgramLockup, SeasonLockup,
                           FirstName, HudFrame, PlatePanel, StencilTitle         (+ AssetSlot.jsx, BrandDemoCard.jsx)
components/data/           Badge, Chip, SubteamBadge, Field, StatBlock, Readout, SpecTable/SpecRow,
                           FocusTable/FocusRow, BarChart/Bar, GanttChart/GanttBar, DecisionMatrix,
                           Timeline/TimelineItem, MatchClock, BuildCountdown, ScoutTable/ScoutRow,
                           AllianceSplit                                          (+ DataDemoCard.jsx)
components/surfaces/       Card, Callout, SafetyNote, ImageFrame, Cutout, StepCard/Step,
                           ProcessPipeline/PipelineStep, CompareSplit/CompareRow, SampleGrid/Sample,
                           JumpGrid/JumpCard, CalloutDrawing/CalloutPin, QuoteBlock, RoleCard,
                           PartCallout, FieldDiagram, SponsorWall/SponsorTier, AwardPlate,
                           ResultBanner                                           (+ SurfacesDemoCard.jsx)
components/forms/          Input, Select                                          (+ FormsDemoCard.jsx)
components/slots.jsx       child-slot helpers — copy lives in children, never in a props array
templates/Deck.dc.html     the shell — THE ONLY FILE ANYONE COPIES
specimen/                  the /_ds route (dev only) and its browser proofs
_ds_manifest.json          the exported registry and the staleness authority
index.js                   namespace entry: FRC5669DesignSystem
```

Every component ships a `.jsx`, a `.d.ts` and a `.prompt.md`; each group directory carries one demo card.

## Rules the code enforces

- **Ground scopes are complete and literal.** `.frc-ground-squadron`, `.frc-ground-field` and `.frc-ground-paper` each declare the same 36 semantic aliases as literal values — never `var()`, never only at the root. `npm run ds:audit` fails on drift; `/_ds` proves the computed values in the browser.
- **Gold is illegal on paper.** The paper scope redeclares the accent as bronze ink `#7A6300` and flattens glow to zero.
- **Never invent a color.** The audit allows hex / rgb literals only in `tokens/colors.css`, and only from the published set.
- **Every animation is gated** behind `prefers-reduced-motion: no-preference` and runs only inside `[data-deck-active]` or `.frc-run`. Base styles are the visible end state.
- **FirstName** renders the FIRST name per the FIRST guidelines and refuses plural and possessive forms.
- **Deck chrome never shows a neutral white.** Canvas, letterbox, footer and thumbnail frames follow the active ground `bg0` / `edge`.
- **No emoji.** Icons are Lucide, inlined 24×24 stroked SVG on `currentColor`.
- **Copy lives in children.** Every list-shaped component takes its rows as child components and names further strings with a plain `slot` attribute, because copy in a props array is not editable on the Claude Design canvas. Only structure stays an array prop: `DecisionMatrix` weights and scores, `FieldDiagram` zone geometry, chart scales.
- **Three image treatments, chosen by what the image IS.** `ImageFrame` for opaque content (its backplate reads `--surface-viewport`, so a ground retints it — never a literal in the component); `ImageFrame bleed` feathers one edge and drops the rim and brackets, and **throws on a screenshot**; `Cutout` for anything with an alpha channel — no backplate, no brackets, grading is a filter chain on the subject, `fit` is always `contain`, and every sponsor mark is `ground="none"`.
- **The platform backplate is suppressed in the stylesheet.** `tokens/image-slot.css` overrides `image-slot::part(frame)`, never a copied `image-slot.js` inside a deck folder, because a re-copy takes that patch with it.
- **The red partition is contained.** `--alliance-red` and `--alliance-blue` are alliance data and resolve only inside `.frc-ground-field`, only in `AllianceSplit`, `ScoutTable` and `FieldDiagram`. `MatchClock` uses rust at zero for the same reason.
- **SubteamBadge reads `src/subteams.js`.** One vocabulary, imported rather than copied, with no per-value color map.

## Using it

```jsx
import { FRC5669DesignSystem, Button, StencilTitle } from 'src/lib/design-system/index.js'
```

Importing the entry loads `styles.css`. Put `frc-deck` plus a ground class on the root of anything that uses the system; tokens are scoped there, not on `:root`, so the bundle cannot collide with the host app.

## Verification

- `npm run ds:audit` — static audit (alias sets, literal-only values, published colors only, import order, motion gate, manifest accuracy, no emoji).
- `/_ds` in `npm run dev` — live proofs: alias resolution in all three grounds, no rendered gold on paper, all four transitions, every animation gated, static end state, no neutral white in chrome, every component root mounted from source, the `ImageFrame` backplate retinting per ground, `bleed` dropping the rim and brackets, an empty slot staying legible with the platform wash suppressed (measured against a route-only stub of the platform element), a real transparent PNG drawing no rectangle in `Cutout` on any ground, the match clock at full duration / copper / rust, the alliance partition contained, and the enforced refusals throwing.

## Assets not yet held

See `assets/README.md` for the exact filenames and paths. Until they land every mark-bearing component renders a clearly marked empty slot at the correct minimum size. No substitute is drawn.
