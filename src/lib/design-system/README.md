# FRC5669DesignSystem — brand guide

The visual identity system for FRC Team 5669 (Techmen) presentations and materials: weekly meetings, training sessions, strategy and match review, kickoff, outreach, sponsor and judge presentations, and awards material. Authored as React so Claude Design can source it from GitHub.

Specification: `FRC_Design_System.md` v1.1 (2026-08-22). It is authoritative for every color, token, class and rule; this guide is how the system is used and what is in it. `_ds_manifest.json` is the exported registry and the staleness authority.

**Built fresh, never extracted.** `frc-app` predates any token layer, so nothing here was derived from the existing app CSS or components. Migrating the app surfaces onto these tokens is separate work with its own prompts and its own risk; it does not block deck production. This bundle shares nothing with IDEA: its own namespace, its own tokens, no shared stylesheet. A deck physically cannot inherit IDEA green.

**Only one file is ever copied:** `templates/Deck.dc.html`. Everything else is referenced, so a fix reaches every deck that used it.

---

## Part one — content fundamentals

### Copy lives in children

| Home | Canvas-editable | Allowed for |
|---|---|---|
| Element children, child slots | Yes | All running copy. **The default.** |
| Component prop | No | Short fixed chrome only: deck name, figure number, unit label, part index |
| Structural array prop | No | Field zone geometry, chart scales, decision weights, edge lists |

The test for the second and third rows is whether a human would read the string aloud in the room. A scouting row label is copy. A field zone polygon is not.

```jsx
<SpecRow>
  <span slot="label">Free speed</span>
  <span slot="value">16.4 ft/s</span>
</SpecRow>
```

A deck gets edited the morning it runs. Copy in a props array is not reachable from the Claude Design canvas, which is why this is the first rule and not a preference.

### Nothing is hidden at rest

**Click targets may change emphasis. They may never reveal content.** Clicking a scouting row dims its siblings; clicking a field zone raises a callout already drawn at low opacity. Base state shows everything, so print, PDF and reduced-motion output are complete and a student subteam lead never has to know that an unmarked region is clickable.

A hidden answer that should appear on cue is a **build slide**, not a click target: duplicate the section, add the revealed element, strip entrance classes from carried-over elements, give the section no transition so it cuts instantly. Budget four build chains per deck, three states each.

### Voice

Two registers, matching the two grounds.

- **SQUADRON** — briefing, roster, standing orders, quals, mission, muster. Terse and declarative. Addresses the team.
- **FIELD** — match, alliance, cycle, queue, pit, scouting, auto, teleop, endgame. Technical and measured. Uses the game's own vocabulary, never a paraphrase.

Casing: mono labels, eyebrows, badges, buttons and metadata are UPPERCASE with wide tracking; display headings and body copy are sentence case. Numerals are hero material — match times render `M:SS`, team numbers bare, season years `2026-27`.

**No dates in sheet titles.** A date goes stale the moment a meeting moves.

### Density

**Two thirds of sheets carry a visual aid.** A chart, a `FieldDiagram`, a `CalloutDrawing` and a `SpecTable` all count. A sheet without one is a recorded decision with a reason, not a sheet the plan forgot.

### The mentor constraint

Mr. Garza, Mr. Kennedy on weekends, Mr. Pedroza part-time, and student subteam leads all run sessions from these materials. A sophomore presenting a training deck cannot depend on undocumented knowledge of how the artifact behaves. Every rule about complete base state, no hidden content and no undeclared judgment is load-bearing here.

---

## Part two — visual foundations

### The three grounds

A ground is one class on the deck root, legal to override on an individual section. Each scope declares its **complete** semantic alias set as literal values — never a `var()` reference, never only at the root. A `var()` alias declared once at the root freezes that value into every other scope, and a light sheet silently keeps dark values while looking correctly themed. That bug is designed out rather than watched for: `npm run ds:audit` fails if the three alias sets ever differ in name or contain a `var()`, and `/_ds` proves the computed values in a live browser.

| Ground | Class | Reads as | Use |
|---|---|---|---|
| SQUADRON | `frc-ground-squadron` | A blued-steel ready room. Rises above Jet Black, because `#000000` is a published brand color and nothing goes darker. Plates rise on rivet-and-seam logic. | Team identity |
| FIELD | `frc-ground-field` | The competition floor: extrusion channel, tread plate, queue tape, LED matrix, top-down grid. Panels recess. | Data and competition content |
| FIELD PAPER | `frc-ground-paper` | The light sheet. | Handouts, pit signage, printed material, contrast inside a dark deck |

**Techmen Gold is illegal on paper.** `#FFE629` on `#E9E7E1` measures about 1.6:1. The paper scope redeclares the accent as bronze ink `#7A6300` at roughly 5.2:1 and flattens glow to zero, since a halo reads as mud on a light sheet.

### The five published team colors

| Token | Value | Role |
|---|---|---|
| `--gold` | `#FFE629` | Techmen Gold. Identity, hero type, hero numerals, LIVE indicator |
| `--black` | `#000000` | Jet Black. SQUADRON page ground |
| `--space` | `#53565F` | Space Gray. Structure, inactive strokes, plate edges |
| `--ash` | `#94989C` | Ash Gray. Metadata, timestamps, secondary labels |
| `--white` | `#FFFFFF` | Prism White. Body copy |

**Gold is never body copy.** It is hero type, hero numerals, active state and the LIVE dot. Gold at projection distance as running text is fatiguing and dilutes the one color that means "this team".

### The red partition

Red is overloaded three ways in an FRC context — FIRST brand red, alliance red, and the universal error signal. It is partitioned, and nothing outside the partition may use a red.

| Token | Value | Rule |
|---|---|---|
| `--alliance-red` | `#ED1C24` | Alliance DATA only. FIELD ground only. Never decoration. |
| `--alliance-blue` | `#0066B3` | Same. |
| `--warn` | `#D98C3F` copper | Shop hazard, safety note, approaching deadline |
| `--fault` | `#B0503C` rust | Error, failed inspection, blocked |
| `--ok` | `#6FA57B` | Pass, certified, complete, cleared |

The alliance pair resolves **only** inside `AllianceSplit`, `ScoutTable`, `MatchBreakdownSheet` and `FieldDiagram`, and only on the FIELD ground. Off FIELD they fall back to structure tones and the RED / BLUE word carries the meaning — which is why every alliance component takes its side label as a required slot. `MatchClock` uses rust at zero rather than alliance red, because a sheet carrying a match clock also carries alliance colors and a red zero state is unreadable there.

**LIVE and REC are a pulsing gold dot, not a red one.** This is the one place the system departs from the convention it inherited.

### Program and season layers

`--program` colors program chrome only — the `ProgramLockup`, program-scoped badges, the footer program rail. It never colors content and never competes with gold for identity. One token serves FRC (`#009CD7`), FTC (`#F57E25`) and the FIRST LEGO League divisions, so the FLL teams need no second bundle.

`--season` is unset by default and falls back to gold. **Setting `--season` and dropping artwork into `SeasonLockup` is the entire annual reskin.** Nothing else changes when the season does, which is the point of isolating it.

### Typography

| Token | Family | Role |
|---|---|---|
| `--font-display` | Space Grotesk Bold | Hero type, sheet titles, hero numerals, wordmark |
| `--font-body` | Space Grotesk Regular / Medium | All running copy |
| `--font-mono` | Space Mono | Chrome, labels, metadata, codes, telemetry, timers |
| `--font-first` | Roboto | FIRST-attributed blocks only |

Space Mono is a **family match, not a substitution**: Space Grotesk was drawn from its letterforms, which is why the system does not reach for a third-party mono. **Roboto is quarantined** — it appears only inside a FIRST-attributed block, never in team copy, and never as a fallback for Space Grotesk.

Scale at 1920: hero 160, display 112, h1 84, h2 64, h3 40, body 28, body-sm 24, label 20, micro 18. **Body copy never renders below an 18pt equivalent**, because these project into a shop bay.

### Surfaces, borders and depth

- Hairlines separate, plates give depth: 1px at rest, 2px on framed drawings, `--line-strong` for active.
- Radii stay small: 2px chips and badges, 3px buttons and inputs, 4px cards and panels. Nothing is pill-round except a circular state token.
- SQUADRON plates **rise** — top highlight, bottom shade, short drop, optional rivet seam. Never a soft grey drop shadow alone.
- FIELD panels **recess** — an inset well, because FIELD reads as looking into an instrument.
- **Glow is rationed** to hero type and hero numerals. Never body copy, never every heading, never on paper.
- Chevrons are SQUADRON's rule element and replace the generic divider there.
- **Deck chrome never shows a neutral white.** Canvas, letterbox and thumbnail frames follow the active ground's `bg0` and `edge`, so a transition never flashes white.

### Motion

Four slide transitions, because four is enough and a longer list becomes a menu of presentation-software defaults.

| Slide role | Transition |
|---|---|
| Content, general | `frc-slide-shutter` — blade wipe, gold rim on the leading edge |
| Data, telemetry, match, chart | `frc-slide-boot` — HUD de-blur |
| Section divider, statement, quote | `frc-slide-banner` — angled chevron pass |
| Quiet beat | `frc-slide-cut` — 0.45s |
| Build state | none |

Generic push, zoom, straight wipe and iris are deliberately absent. Element entrances (`frc-in-*`, budget six per sheet), image reveals (`frc-img-*`), ambient loops (`frc-bg-pan`, `scanlines`, `pulse`, `drift`, `shimmer`, max one per sheet) and stagger (`frc-d1`–`frc-d8`) round it out.

**Every animation is gated behind `prefers-reduced-motion: no-preference` inside the library.** Do not add a second gate and do not remove the first. Nothing runs until the element sits inside `[data-deck-active]` or a `.frc-run` container, and **base styles are the visible end state**.

Ambient texture layers are a separate library from the loops: the layers are what a sheet's atmosphere is built from, the loops animate a layer that is already there. SQUADRON has `patch`, `stencil`, `chevron`, `stars`, `rivet`, `bloom`; FIELD has `extrusion`, `tread`, `hazard`, `matrix`, `fieldgrid`, `bracket`, `bloom`; PAPER has `grid`, `hatch`, `foldline` and no bloom, since a halo does not exist on paper.

### Image treatments

Three, chosen by what the image **is**, not by where it sits.

| Content | Component |
|---|---|
| Photograph, screenshot, CAD render, drawing — opaque edge to edge | `ImageFrame` |
| Photograph that should dissolve into the sheet | `ImageFrame` with `bleed` |
| Transparent PNG: part, tool, mark, sponsor logo, award | `Cutout` with `fit="contain"` |

Hand-rolled filter, gradient, mask and scanline stacks are prohibited in all three cases. A transparent PNG never goes inside `ImageFrame` — the frame fills the alpha region with its backplate and grades it as a rectangle, which is exactly the discolored box around the subject. Never bleed a screenshot; the hard edge is what tells the room it is looking at a screen. Sponsor logos are always `Cutout` with `ground="none"`. **QR codes are the one exemption:** bare on a light plate at full contrast, no tint, no grade, no brackets, because the code has to resolve from a phone at the back of a shop bay.

The `ImageFrame` backplate reads from `--surface-viewport`, so a ground retints it and no component hardcodes it. `tokens/image-slot.css` suppresses the platform's own grey wash on `image-slot::part(frame)` **in the stylesheet**, never by patching a copied `image-slot.js`.

Standing photography direction for equipment and robot photographs: dark or neutral background, single light source upper left, shot straight on, subject isolated, consistent framing across a set.

### Format

4:3, 1920 × 1440 by default; 16:9 at 1920 × 1080 is an opt-in. 4:3 gives less horizontal room, so two-column comparisons need tighter copy. Persistent chrome on every sheet except the hub: part name bottom left, logical sheet number bottom right, per-part progress rail along the bottom edge. `data-label` and `data-screen-label` on every section for the thumbnail rail. The footer numbers the **logical** sheet, so a build chain reads the same number across all its states.

---

## Part three — the FIRST usage rules

These come from the FIRST guidelines, which open with "standards are strictly enforced". They are implemented as components and audit checks rather than as things a presenter has to remember.

1. **The marks are used as supplied.** No recoloring, rotating, skewing, cropping, containing shape, added border or added text. A gold FIRST logo does not exist and may not be produced. On dark grounds the full-color reverse or one-color reverse artwork is used.
2. **Pieces do not stand alone.** The FIRST wordmark and the interlocking triangle-circle-square icon may not be the only representation of the logo; wherever either appears, the complete logo appears nearby. This is why neither can become deck chrome on its own.
3. **The name in text.** `FIRST` is always all capitals and italic, never bolded except inside fully bolded text, never plural or possessive, and carries a superscript registered symbol on first use in both a heading and body copy — `FIRST® Robotics Competition`, `FIRST® LEGO® League`. `FirstName` enforces all of it, tracks first use per channel, and **refuses** a plural or possessive form.
4. **Team identification accompanies the marks.** The footer rail carries `5669` on every sheet, which satisfies this everywhere. The hub is the one sheet with no rail, and so the one sheet with no FIRST mark.
5. **Never on a busy background.** The FIRST logo zone sits on a flat plate and ambient layers are clipped out of the whole rail band.
6. **Minimum sizes.** Horizontal 30px, vertical 60px digital; program logos 60px horizontal and 120px vertical. The rail enforces a floor so a scaled-down export cannot violate them.

**Two brands sitting adjacent is the designed outcome.** Team gold and FIRST blue cannot be harmonized, because harmonizing would require recoloring a mark. The system separates them by zone: FIRST chrome lives in the footer rail and the cover lockup, team identity lives everywhere else.

### The marks

**Seal** on covers, closing sheets, and anything printed or worn. **Logotype** in the footer rail. **Mark alone** only where the rail already carries the logotype on the same sheet. None of the three may be edited, distorted, recolored outside the three published versions, or reconfigured.

### Audience chrome

`.frc-audience-internal` (default) carries the seal, `5669`, deck name, sheet number and part rail, with a FIRST attribution line at reduced opacity on the cover and closing sheets. `.frc-audience-external` adds a `ProgramLockup` on the cover, a persistent FIRST horizontal logo zone in the rail, and a sponsor rail on the closing sheet; `FirstName` enforcement becomes mandatory. Both are classes on the deck root, legal to override on one section — an external cover over internal working sheets is a supported composition, not a workaround.

---

## Part four — iconography

**Lucide**, inlined as 24×24 stroked SVG at stroke-width 1.3–2, round caps and joins, colored via `currentColor` so an icon inherits surrounding color and glow. No icon dependency is added; the paths are the Lucide originals.

**Unicode geometric glyphs** for tiny arrows and states — ▲ ▸ ▾ ▼ ✓ · — set in the mono face.

**No emoji anywhere.** Status is spoken in words on colored pills, and the audit fails on an emoji codepoint anywhere in the bundle.

---

## Part five — the manifest

```
SKILL.md                   Agent-Skill front matter, so the system is usable from Claude Code
README.md                  this brand guide
_ds_manifest.json          the exported registry and the staleness authority
index.js                   namespace entry: FRC5669DesignSystem
styles.css                 the single entry — imports only, defines no token
tokens.js                  literal mirror of the token layer (proofs + manifest)
assets.js                  expected asset paths, URLs (null until supplied), minimum sizes
tokens/                    fonts · colors · typography · effects · surfaces · motion · deck-motion
                           · image-slot · data · surface-components · forms · sheets   (fixed order)
components/core/           Button, Eyebrow, Divider, ChevronRail, TeamWordmark
components/brand/          SealMark, MarkGlyph, Logotype, DeckFooter, ProgramLockup, SeasonLockup,
                           FirstName, HudFrame, PlatePanel, StencilTitle
components/data/           Badge, Chip, SubteamBadge, Field, StatBlock, Readout, SpecTable/SpecRow,
                           FocusTable/FocusRow, BarChart/Bar, GanttChart/GanttBar, DecisionMatrix,
                           Timeline/TimelineItem, MatchClock, BuildCountdown, ScoutTable/ScoutRow,
                           AllianceSplit
components/surfaces/       Card, Callout, SafetyNote, ImageFrame, Cutout, StepCard/Step,
                           ProcessPipeline/PipelineStep, CompareSplit/CompareRow, SampleGrid/Sample,
                           JumpGrid/JumpCard, CalloutDrawing/CalloutPin, QuoteBlock, RoleCard,
                           PartCallout, FieldDiagram, SponsorWall/SponsorTier, AwardPlate, ResultBanner
components/forms/          Input, Select
components/sheets/         the twenty-six sheet patterns (+ Sheet, the internal frame)
components/slots.jsx       child-slot helpers — copy lives in children, never in a props array
templates/Deck.dc.html     the shell — THE ONLY FILE ANYONE COPIES
templates/Specimen.dc.html the reference deck — REFERENCE ONLY, never a starting point
specimen/                  the /_ds route (dev only) and its browser proofs
assets/                    marks and logos — NOT in the repo yet; see assets/README.md
```

Every component ships a `.jsx`, a `.d.ts` and a `.prompt.md`; each group directory carries one demo card.

### The sheets group

This is the architectural core. **Every sheet in every deck is one of these**; a deck sheet built from raw markup is a defect. They are components rather than template files on purpose: a template is a copied file that forks on first use and receives no later fix, while a fix to a sheet pattern reaches every deck that ever used it.

**Generic, usable on any ground** — `CoverSheet` `AgendaSheet` `SectionSheet` `StatementSheet` `QuoteSheet` `HubSheet` `ClosingSheet` `SplitSheet` `GallerySheet` `ProcedureSheet` `ComparisonSheet` `DataSheet` `TimelineSheet` `ScheduleSheet`

**FRC-specific** — `SubteamStatusSheet` `BlockerSheet` `TargetsSheet` `SafetySheet` `RosterSheet` `MatchBreakdownSheet` `ScoutingSheet` `FieldSheet` `BOMSheet` `AwardSheet` `SponsorSheet` `SeasonSheet`

Every pattern inherits its ground and audience from the deck, composes the core, brand, data, surfaces and forms components rather than hand-rolling markup, takes all its copy as children and child slots, and carries a default transition matching its role that a deck can override per instance.

## Using it

```jsx
import { FRC5669DesignSystem, CoverSheet, SplitSheet, ImageFrame } from 'src/lib/design-system/index.js'
```

Importing the entry loads `styles.css`. Put `frc-deck` plus a ground class on the root of anything that uses the system; tokens are scoped there, not on `:root`, so the bundle cannot collide with the host app.

---

## Rules the code enforces

- **Ground scopes are complete and literal.** All three declare the same 36 semantic aliases as literal values.
- **Gold is illegal on paper.** The paper scope redeclares the accent as bronze ink and flattens glow to zero.
- **Never invent a color.** Hex / rgb literals appear only in `tokens/colors.css`, and only from the published set.
- **Every animation is gated** behind `prefers-reduced-motion: no-preference`, and runs only inside `[data-deck-active]` or `.frc-run`.
- **Copy lives in children.** Only structure stays an array prop.
- **Sheet patterns never name a ground** and never take an audience prop — the audit fails on either.
- **Every sheet defaults to one of the four transitions**, and there is no fifth.
- **The specimen is never a starting point** — the audit fails if it is ever listed as one.
- **Components refuse rather than degrade:** `ImageFrame` on a bled screenshot, `Cutout` on `fit="cover"`, `SponsorTier` on a framed sponsor mark, `SafetySheet` without a `SafetyNote`, `FirstName` on a plural or possessive.
- **No emoji.** Icons are Lucide, inlined SVG on `currentColor`.

## Verification

- `npm run ds:audit` — the static audit: alias sets, literal-only values, published colors only, import order, motion gate, manifest accuracy, no emoji, sheet-pattern ground and transition rules, and the specimen's status.
- `/_ds` in `npm run dev` — the live proofs. It mounts the **real** components, never a copy of their markup, because a harness that re-implements what it measures passes every check forever including after the real surface breaks. It proves alias resolution in all three grounds, no rendered gold on paper, all four transitions, gate coverage, the static end state, deck chrome, the image treatments, the cutout rectangle rule, the match clock states, alliance containment, the enforced refusals, and every sheet pattern stepped through all three grounds and both audience modes with its own ground, audience and ambient switchers.

## Assets not yet held

See `assets/README.md` for the exact filenames and paths. Until they land, every mark-bearing component renders a clearly marked empty slot at the correct minimum size. No substitute is drawn and nothing resembling a mark is generated.
