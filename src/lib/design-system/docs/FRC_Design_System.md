# FRC Team 5669 Design System
**Version 1.6 - 2026-08-23**

The visual identity system for FRC Team 5669 (Techmen) presentations and materials. Covers weekly meetings, training sessions, strategy and match review, kickoff, outreach, sponsor and judge presentations, and awards material.

This document owns brand, tokens, type, motion, and the component manifest. Scoping and prompting are owned by `FRC_CLAUDE_DESIGN_STANDARDS.md`. The two are separate on purpose so a rule lives in exactly one place.

## Where the system lives

`frc-app` at `src/lib/design-system/`, authored as React by Claude Code and sourced by Claude Design from GitHub. `_ds_manifest.json` in that directory is the exported registry and the staleness authority.

It lives there rather than inside Claude Design because Claude Design's output format is React either way: authoring in React removes a translation step, and `frc-app` is a Vite React app, so the deck components and the app components can be the same components. A change to Techmen gold, to `SubteamBadge`, or to `RoleCard` then lands once and reaches the app, the check-in screens, and every deck built afterward.

IDEA could not do this. `idea-app` is SvelteKit, so Claude Design could not read components from it, and its 56 React components were re-authored from a written description of Svelte ones. Nothing structural ties them together, which is why the IDEA templates drift from the components they were built on.

**The system was built fresh, never extracted from existing `frc-app` code.** `frc-app` predates any token layer, so extraction would have produced a description of its current CSS rather than a specification. Migrating the existing app surfaces onto these tokens is separate work with its own prompts and its own risk, and it does not block deck production.

Only one file is ever copied: `templates/Deck.dc.html`. Everything else is referenced, so a fix reaches every deck that used it.

---

**This is not IDEA.** The IDEA design system's own brand guide states that FRC and FLL decks carry their own brands and are never recolored into the course sequence. This is a sibling bundle with its own namespace, its own tokens, and no shared stylesheet. A deck physically cannot inherit IDEA green.

What is inherited is architecture, not appearance: a token layer as the single source of color, a ground scope system, a four-transition motion library, the three-treatment image discipline, the copy-in-children rule, and the standing rule that base styles are the visible end state.

---

## Brand sources

Three authorities, in this precedence order when they conflict.

1. **FIRST Branding & Design Guidelines** (`firstbrandguidelines.pdf` in project knowledge). Opens with "standards are strictly enforced." Governs every use of the FIRST and FIRST Robotics Competition marks and the FIRST name in text. Not negotiable and not stylable.
2. **FRC Team 5669 Branding** (https://frcteam5669.com/outreach/branding). Governs the team mark, logotype, seal, five brand colors, and Space Grotesk. States plainly that the logos are not to be edited, changed, distorted, recolored, or reconfigured.
3. **This document.** Governs everything the first two leave open, which is most of the system.

Where FIRST and the team brand collide, FIRST wins. Where the team brand and this document collide, the team brand wins.

---

## The marks

**Team seal.** A faceted helmet with a T faceplate over wide feathered wings, set inside a gear ring carrying `5669` above and `TECHMEN` below with flanking stars. It is the richest of the three marks and the source of the SQUADRON ground's entire vocabulary.

**Logo mark.** The winged helmet alone, no ring, no lettering. Available Gold, White, and Black.

**Logotype.** The mark locked up with the `TECHMEN` wordmark. Available Gold, White, and Black.

Spacing guides for the mark and the logotype are published on the branding page and are followed exactly. None of the three may be edited, distorted, recolored outside the three published versions, or reconfigured.

**Which mark where.** Seal on covers, closing sheets, and anything that will be printed or worn. **Logotype in the footer rail.** Mark alone only where the footer rail already carries the logotype on the same sheet.

The logotype is the footer default rather than the seal, and this is a correction to v1.0, which said seal in one section and logotype in another. The logotype is horizontal and survives rail scale; the seal is dense, circular, and carries `5669` and `TECHMEN` inside its own ring, which duplicates the team number the rail already sets in type. `mark="seal"` stays available for a rail on a cover or closing sheet where the surrounding sheet is not already carrying one.

---

## Grounds

Three surface scopes. A ground is set once with a class on the deck root and may be overridden on an individual section. Every scope declares its **complete** semantic alias set as literal values, never as a `var()` reference, because custom-property substitution resolves where a property is declared and a `var()` alias declared in `:root` silently freezes the root's value into every other scope. This is the single most expensive bug in a themed token layer and it is designed out rather than watched for.

### SQUADRON, `.frc-ground-squadron`

The default. Carries team identity. Serves anything about the team rather than about a competition.

The ramp inverts the usual logic: it rises above true black rather than sinking below a page color, because Jet Black `#000000` is a published brand color and nothing is permitted to go darker than it.

```
--sq-bg0    #000000    page. Jet Black, brand color
--sq-bg1    #0B0C0E    cards, panels
--sq-bg2    #141619    inputs, header bars, recessed wells
--sq-plate  #1E2126    raised plate, hero panels
--sq-edge   #000000    deck chrome, letterbox, thumbnail frame
--sq-line   rgba(148,152,156,0.22)    hairline at rest
--sq-line-strong  rgba(255,230,41,0.50)    hairline, active
```

Reads as a blued-steel ready room. Plates sit above the black on a rivet-and-seam logic, gold is a stencil or a struck emblem, and structure is Space Gray.

### FIELD, `.frc-ground-field`

The working ground for anything carrying data or competition content. Cool graphite, deliberately separate in hue from SQUADRON so the two never read as the same deck under projection.

```
--fl-bg0    #0E1013
--fl-bg1    #16191E
--fl-bg2    #1E222A
--fl-plate  #272C35
--fl-edge   #05070A
--fl-line   rgba(148,152,156,0.20)
--fl-line-strong  rgba(0,156,215,0.45)
```

Reads as the competition floor: extrusion channel, tread plate, queue tape, an LED matrix, a top-down field grid.

### FIELD PAPER, `.frc-ground-paper`

The light sheet, for handouts, pit signage, printed event material, and value contrast inside a dark deck.

```
--fl-paper      #E9E7E1    sheet
--fl-paper-2    #DCD9D1    recessed
--fl-ink        #14161A    body copy
--fl-ink-dim    #55595F    metadata
--fl-line-ink   rgba(20,22,26,0.22)
--fl-gold-ink   #7A6300    accent
```

**Techmen Gold is illegal on the paper ground.** `#FFE629` against `#E9E7E1` measures about 1.6:1. The paper scope redeclares the accent as bronze ink `#7A6300` at roughly 5.2:1. Glow is flattened to zero on paper, since a halo reads as mud on a light sheet.

---

## Color roles

The five published team colors, with their roles fixed.

```
--gold    #FFE629    Techmen Gold. Identity, hero type, hero numerals, LIVE indicator
--black   #000000    Jet Black. SQUADRON page ground
--space   #53565F    Space Gray. Structure, inactive strokes, plate edges
--ash     #94989C    Ash Gray. Metadata, timestamps, secondary labels
--white   #FFFFFF    Prism White. Body copy
```

**Gold is never body copy.** It is hero type, hero numerals, active state, and the LIVE dot. Gold on the SQUADRON ground measures about 16:1 and is excellent; gold used as running text at projection distance is fatiguing and dilutes the one color that means "this team."

### The red partition

Red is overloaded three ways in an FRC context: FIRST brand red, alliance red, and the universal error signal. It is partitioned, and nothing outside the partition may use a red.

```
--alliance-red   #ED1C24    FIELD ground only. Alliance data only. Never decoration
--alliance-blue  #0066B3    FIELD ground only. Alliance data only. Never decoration
--warn           #D98C3F    copper. Shop hazard, safety note, approaching deadline
--fault          #B0503C    rust. Error, failed inspection, blocked
--ok             #6FA57B    pass, certified, complete, cleared
```

**LIVE and REC are a pulsing gold dot, not a red one.** This is the one place the system deliberately departs from the convention it inherited, because a red status dot on a sheet that also carries alliance red is unreadable.

`--alliance-red` and `--alliance-blue` are the FIRST palette values and are used unmodified. They appear only inside `AllianceSplit`, `ScoutTable`, `MatchBreakdownSheet`, and `FieldDiagram`. A deck on the SQUADRON ground has no legal use for either.

**Alliance containment is enforced structurally, not by hex.** The two values are declared as local variables only under `.frc-ground-field` and only by those four components. Off FIELD they fall back to structure tones and the RED and BLUE word labels carry the meaning, which is why those tag slots are not optional.

**Known value collision: FIRST LEGO League red is published as the same hex as alliance red.** After substitution, a computed style cannot distinguish FLL program chrome from alliance data. This is harmless in practice and is resolved by program rather than by color: the FLL Robot Game has no alliances, so an FLL deck has no legal alliance use, and an FRC deck never sets `--program` to an FLL value. Any automated containment check must therefore be program-aware. A hex-only scan will report the `ProgramLockup` rail as a leak, and that report is a false positive to be surfaced as a documented collision, never silenced.

### Program layer

One token, so the same system serves the FLL teams and any future FTC team without a second bundle.

```
--program   #009CD7    FIRST Robotics Competition, Process Blue
            #F57E25    FIRST Tech Challenge
            #ED1C24 / #00A651 / #662D91 / #231F20    FIRST LEGO League and divisions
```

`--program` colors program chrome only: the `ProgramLockup`, program-scoped badges, and the footer program rail. It never colors content and never competes with gold for identity.

### Season layer

FRC reskins every January. `--season` is unset by default and falls back to gold. The 2026-27 season is FIRST CANOPY; FLL BIOGLOW released August 4, 2026, FTC BIOBUZZ opens September 12, 2026, and FRC BIOCORE reveals January 9, 2027.

Setting `--season` plus dropping artwork into `SeasonLockup` is the entire annual reskin. Nothing else in the system changes when the season does, which is the point of isolating it.

---

## Typography

Four families, all from Google Fonts.

| Token | Family | Role |
|---|---|---|
| `--font-display` | Space Grotesk Bold | Hero type, sheet titles, hero numerals, wordmark |
| `--font-body` | Space Grotesk Regular / Medium | All running copy |
| `--font-mono` | Space Mono | Chrome, labels, metadata, codes, telemetry, timers |
| `--font-first` | Roboto | FIRST-attributed blocks only |

Space Grotesk is mandated by the team brand at Bold 50px heading, Bold 40px sub, Bold 25px sub-sub, Regular 17px body. Those ratios inform the type scale rather than being copied literally, since the brand page specifies a website and this system specifies a 1920px projection surface.

**Space Mono is a family match, not a substitution.** Space Grotesk was drawn from Space Mono's letterforms, so the mono chrome and the display face share a skeleton. This is why the system does not reach for a third-party mono.

**Roboto is quarantined.** It appears only inside a FIRST-attributed block, never in team copy, and never as a fallback for Space Grotesk.

Body copy never renders below an 18pt equivalent, since these project into a shop bay.

---

## FIRST usage rules, enforced by the system

These come straight from the FIRST guidelines and are implemented as components and audit checks rather than as things a presenter has to remember.

1. **The marks are used as supplied.** No recoloring, rotating, skewing, cropping, containing shape, added border, or added text. A gold FIRST logo does not exist and may not be produced. On dark grounds the full-color reverse or one-color reverse artwork is used.
2. **Pieces do not stand alone.** The FIRST wordmark and the interlocking triangle-circle-square icon may not be the only representation of the logo. Wherever either appears, the complete vertical or horizontal logo appears nearby. This is why neither can become deck chrome on its own.
3. **The name in text.** `FIRST` is always all capitals and italic, never bolded except inside fully bolded text, never plural or possessive, and carries a superscript registered symbol on first use in both a heading and body copy. Program names follow the same rule: `FIRST® Robotics Competition`, `FIRST® LEGO® League`. The `FirstName` component enforces all of it and tracks first use per deck.
4. **Team identification accompanies the marks.** Permitted use for a registered team requires the team name or number in conjunction with the logo. The footer rail carries `5669` on every sheet, which satisfies this everywhere.
5. **Never on a busy background.** The FIRST logo zone in the footer rail sits on a flat plate with no ambient texture behind it. Ambient layers are clipped out of that zone.
6. **Minimum sizes.** Horizontal 30px, vertical 60px digital. The program logos are 60px horizontal and 120px vertical digital. At 1920px these are trivially met, but the footer rail enforces a floor so a scaled-down export cannot violate them.

**Two brands sitting adjacent is the designed outcome.** Team gold and FIRST blue cannot be harmonized, because harmonizing would require recoloring a mark. The system separates them by zone rather than blending them: FIRST chrome lives in the footer rail and the cover lockup, team identity lives everywhere else.

---

## Audience chrome

A class on the deck root, legal to override on an individual section so hybrid decks are a supported case rather than a workaround.

**`.frc-audience-internal`** (default). Footer rail carries the seal, `5669`, deck name, sheet number, and part rail. A FIRST attribution line sits at reduced opacity on the cover and closing sheets only.

**`.frc-audience-external`**. Adds a `ProgramLockup` on the cover, a persistent FIRST full-color-reverse horizontal logo zone in the footer rail, and a sponsor rail on the closing sheet. `FirstName` enforcement is mandatory rather than advisory.

An external cover over internal working sheets is a legal composition. Set the deck root internal and put `.frc-audience-external` on the cover and closing sections.

---

## Motion

Four slide transitions. There are four because four is enough and because a longer list becomes a menu of presentation-software defaults.

| Slide role | Transition |
|---|---|
| Content, general | `frc-slide-shutter` (blade wipe, gold rim riding the leading edge) |
| Data, telemetry, match, chart | `frc-slide-boot` (HUD de-blur) |
| Section divider, statement, quote | `frc-slide-banner` (angled chevron pass) |
| Quiet beat, deliberate stillness | `frc-slide-cut` (0.45s) |
| Build state | none |

Generic push, zoom, straight wipe, and iris are deliberately absent and are not to be reintroduced by hand.

**Element entrances:** `frc-in-rise | drop | left | right | fade | blur | tracking | stamp | zoom | strike | flicker`. Default budget six per sheet.

**Image reveals:** `frc-img-wipe | wipe-down | iris | chamfer | zoom | kenburns`.

**Ambient loops:** `frc-bg-pan | scanlines | pulse | drift | shimmer`. Maximum one per sheet, and not on every sheet.

**Stagger:** `frc-d1` through `frc-d8`, plus 0.1s each.

Every animation is gated behind `prefers-reduced-motion: no-preference` inside the library. Do not add a second gate and do not remove the first.

**Base styles are the visible end state.** Nothing animates until the element sits inside `[data-deck-active]` or a `.frc-run` container. This is what keeps print, PDF, and reduced-motion output complete, and it is why hide-until-clicked is prohibited.

### Ambient texture layers

Static layers from the surfaces stylesheet, stacked as `<div class="frc-ambient frc-ambient-NAME">`, opacity scaled by a `--tex` knob from 0 to 2. Separate library from the loops above: the layers are what a sheet's atmosphere is built from, the loops animate a layer that is already there.

**SQUADRON:** `patch` (embroidered weave), `stencil`, `chevron`, `stars` (very low), `rivet` (panel seams), `bloom`.

**FIELD:** `extrusion` (aluminum channel), `tread`, `hazard` (queue and safety tape), `matrix` (LED), `fieldgrid` (top-down), `bracket`, `bloom`.

**PAPER:** `grid`, `hatch`, `foldline`. No bloom, since a halo does not exist on paper.

---

## Surfaces, borders, and depth

- **Hairlines separate, plates give depth.** 1px at rest in `--*-line`, 2px on framed drawings, `--*-line-strong` for active and emphasis.
- **Radii stay small.** 2px chips and badges, 3px buttons and inputs, 4px cards and panels. Nothing is pill-round except a circular state token.
- **SQUADRON plates rise.** A plate reads as bolted metal above the black: top highlight, bottom shade, short drop, optional rivet seam. Never a soft grey drop shadow alone.
- **FIELD panels recess.** Inset well treatment, since the FIELD ground reads as looking into an instrument rather than at a bolted plate.
- **Glow is rationed.** Hero type and hero numerals only. Never body copy, never every heading, never on paper.
- **Chevrons are SQUADRON's rule element** and replace the generic divider on that ground.
- **Deck chrome never shows a neutral white.** Canvas, letterbox, and thumbnail frames follow the active ground's `bg0` and `edge` so transitions never flash white.

---

## Iconography

**Lucide**, inlined as 24x24 stroked SVG at stroke-width 1.3 to 2, round caps and joins, colored via `currentColor` so an icon inherits surrounding color and glow. Same source IDEA uses, and a substitution-free match.

**Unicode geometric glyphs** for tiny arrows and states: ▲ ▸ ▾ ▼ ✓ ·, set in the mono face.

**No emoji anywhere.** Status is spoken in words on colored pills.

---

## Voice

Two registers, matching the two grounds.

**SQUADRON:** briefing, roster, standing orders, quals, mission, muster. Terse and declarative. Addresses the team directly.

**FIELD:** match, alliance, cycle, queue, pit, scouting, auto, teleop, endgame. Technical and measured. Uses the game's own vocabulary, never a paraphrase of it.

Casing follows two rules throughout. Mono labels, eyebrows, badges, buttons, and metadata are UPPERCASE with wide tracking. Display headings and body copy are sentence case.

Numerals are hero material. Match times render `M:SS`, team numbers render bare, season years render `2026-27`.

---

## Component manifest

Six groups, under `src/lib/design-system/components/`. Every component ships a `.jsx`, a `.d.ts`, and a `.prompt.md`, and every group directory carries one demo card. `_ds_manifest.json` is the source of truth for what exists; this list is the intended set and the manifest is the real one.

**core/** `Button`, `Eyebrow`, `Divider`, `ChevronRail`, `TeamWordmark`

**brand/** `SealMark`, `MarkGlyph`, `Logotype`, `DeckFooter`, `DeckStage`, `ProgramLockup`, `SeasonLockup`, `FirstName`, `HudFrame`, `PlatePanel`, `StencilTitle`

`DeckStage` is behavior rather than appearance. It mounts once per deck, paints canvas, letterbox, and thumbnail frames from the active sheet's `bg0` and `edge`, and warns visibly if the deck root is missing its aspect, ground, or audience class, or if a second instance mounts. It exists because the shell that used to do this cannot be delivered.

Document canvas painting is scoped behind `.frc-letterbox` on the deck root, which is what declares that the deck owns the viewport. An embedded deck correctly omits it and paints only its own frame rather than its host page. A full-viewport deck must carry it: `DeckStage` cannot guard on a class whose absence is legal, so a missing letterbox is caught by audit check 43 or not at all.

**data/** `Badge`, `Chip`, `Field`, `StatBlock`, `Readout`, `SpecTable` / `SpecRow`, `FocusTable` / `FocusRow`, `BarChart` / `Bar`, `GanttChart` / `GanttBar`, `DecisionMatrix`, `Timeline` / `TimelineItem`, `MatchClock`, `BuildCountdown`, `ScoutTable` / `ScoutRow`, `AllianceSplit`, `SubteamBadge`

**surfaces/** `Card`, `Callout`, `SafetyNote`, `ImageFrame`, `Cutout`, `StepCard` / `Step`, `ProcessPipeline` / `PipelineStep`, `CompareSplit` / `CompareRow`, `SampleGrid` / `Sample`, `JumpGrid` / `JumpCard`, `CalloutDrawing` / `CalloutPin`, `QuoteBlock`, `RoleCard`, `PartCallout`, `FieldDiagram`, `SponsorWall`, `AwardPlate`, `ResultBanner`

**forms/** `Input`, `Select`

**sheets/** Twenty-six full-sheet patterns. This group is what makes hybrid decks composable and what makes a design system update reach every deck that ever used a pattern. See below.

### The sheets group

Generic, usable on any ground: `CoverSheet`, `AgendaSheet`, `SectionSheet`, `StatementSheet`, `QuoteSheet`, `HubSheet`, `ClosingSheet`, `SplitSheet`, `GallerySheet`, `ProcedureSheet`, `ComparisonSheet`, `DataSheet`, `TimelineSheet`, `ScheduleSheet`.

FRC-specific: `SubteamStatusSheet`, `BlockerSheet`, `TargetsSheet`, `SafetySheet`, `RosterSheet`, `MatchBreakdownSheet`, `ScoutingSheet`, `FieldSheet`, `BOMSheet`, `AwardSheet`, `SponsorSheet`, `SeasonSheet`.

Every sheet pattern takes its ground and audience from the deck rather than declaring one, so the same pattern renders correctly on SQUADRON, FIELD, and PAPER without a variant.

### There is no shell

`templates/Deck.dc.html` exists in the repo and will never reach Claude Design. The CLI converter has no template concept, and the platform registers templates under a `templates[]` key that the converter does not write. A design system built in Claude Design can contribute templates; one authored in a repo and synced cannot. That is the cost of the repo path, and it is worth paying for everything else the repo path buys.

The shell carried four things. Each is reassigned to an artifact class that actually arrives:

| Was in the shell | Now carried by |
|---|---|
| 4:3 1920 x 1440 aspect | The prompt's routing header, verified by audit |
| Ground class on the root | The prompt's routing header, verified by audit |
| Audience class on the root | The prompt's routing header, verified by audit |
| Stage painting canvas and letterbox from the active ground | `DeckStage`, a component |
| Footer rail | `DeckFooter`, already a component |

The footer rail is the proof of the approach. It survived a generated deck untouched, with the rail, `5669`, deck name, and counter all rendering, because it was a component rather than template markup.

**So nothing is copied. Everything is referenced.** The shell was the last remnant of the template model this system was built to avoid, and losing it makes the architecture more consistent rather than less. A deck now starts from Blank and assembles entirely out of the library.

`templates/Deck.dc.html` and `templates/Specimen.dc.html` stay in the repo as readable reference. Neither is a starting point, because there are none.

The specimen demonstrates every sheet pattern in the library, and ships twice: as `templates/Specimen.dc.html`, which is repo reference only and never reaches Claude Design, and as a dev-guarded route in `frc-app` that mounts the real components so every interaction can be browser-verified. The route mounts the components themselves, never a copy of their markup, because a harness that re-implements what it measures passes every check forever including after the real surface breaks. **It is reference, never a starting point.** Copying it produces a fork carrying twenty-six sheets nobody asked for, which is the failure this architecture exists to prevent.

---

## Copy placement

Copy lives in **element children and component child slots** by default, because that is what is editable directly on the Claude Design canvas. Text passed as a component prop is not editable there. Text in a `data-props` script block is worse, since reaching it means scrolling past the whole deck.

| Home | Canvas-editable | Allowed for |
|---|---|---|
| Element children, child slots | Yes | All running copy. The default |
| Component prop | No | Short fixed chrome only: deck name, figure number, unit label, eyebrow |
| `data-props` script | No | Structural data only: field zone geometry, chart series, weights, edge lists |

Anything in the second or third row is declared as locked copy in the prompt with its reason. Structural data is not copy: the test is whether a human would read the string aloud in the room. A scouting row label is copy, a field zone polygon is not.

---

## Image treatments

Three treatments, chosen by what the image **is**, not by where it sits.

| Content | Treatment | Component |
|---|---|---|
| Photograph, screenshot, CAD render, drawing, opaque edge to edge | Framed | `ImageFrame` |
| Photograph that should dissolve into the sheet | Bleed | `ImageFrame` with `bleed` |
| Transparent PNG: part, tool, mark, sponsor logo, award | Cutout | `Cutout` with `fit="contain"` |

Hand-rolled filter, gradient, mask, and scanline stacks are prohibited in all three cases.

**A transparent PNG never goes inside `ImageFrame`.** The frame fills the alpha region with its backplate and grades it with a rectangular tint, which is exactly the discolored box around the subject.

**Never bleed a screenshot.** A feathered interface capture reads as a rendering fault, and the hard edge is what tells the room it is looking at a screen.

**Sponsor logos are always `Cutout` with `ground="none"`,** since a sponsor mark is a floating mark and a contact shadow under a corporate logo reads as an error.

**QR codes are the one exemption.** Bare on a light plate at full contrast, no tint, no grade, no bleed, no scanline, no brackets, because the code has to resolve from a phone at the back of a shop bay.

**Density floor: two thirds of sheets carry a visual aid.** A charts, a `FieldDiagram`, a `CalloutDrawing`, and a `SpecTable` all count. A sheet without one is a recorded decision with a reason, not a sheet the plan forgot.

**Standing photography direction** for equipment and robot photographs: dark or neutral background, single light source upper left, shot straight on, subject isolated, consistent framing across a set.

---

## Invariant guards

Several rules in this document are enforced in component code rather than left to prose: `ImageFrame` rejects `bleed` on a screenshot, `Cutout` rejects `fit="cover"`, `SponsorTier` rejects a mark that is not a `Cutout` with `ground="none"`, `SafetySheet` rejects a body with no `SafetyNote`, and `FirstName` rejects plural and possessive forms.

**Every guard renders a visible rust fault marker at run time and throws only inside the dev harness.** A guard that throws during a presentation takes the whole deck down in front of the room, and it does so on the external decks that matter most, which is the opposite of what the guard is for. A visible marker fails loudly enough to be caught and cheaply enough to be survived.

The marker is not a soft landing. Audit check 40 requires zero fault markers in any deck called finished, so the guard's real job is done at audit time and its run-time behavior only decides how badly a miss hurts.

## Interaction

**Click targets may change emphasis. They may never reveal content.** Base state shows everything. Clicking a scouting row dims its siblings; clicking a field zone raises a callout already rendered at low opacity.

This is not a preference. The motion library guarantees base styles are the visible end state so print, PDF, and reduced-motion always show content. Hide-until-clicked breaks that guarantee, loses material on export, and hands a student subteam lead a deck whose content depends on knowing an unmarked region is clickable.

A hidden answer that should appear on cue is a **build slide**, not a click target: duplicate the section, add the revealed element, strip entrance classes from carried-over elements, and give the section no transition class so it cuts instantly. Budget four build chains per deck, three states each.

---

## The mentor constraint

The FRC equivalent of the Cosso constraint is stronger, not weaker. Mr. Garza, Mr. Kennedy on weekends, Mr. Pedroza part-time, and student subteam leads all run sessions from these materials. A sophomore presenting a training deck cannot depend on undocumented knowledge of how the artifact behaves.

Every rule about complete base state, no hidden content, and no undeclared judgment carries over verbatim and is load-bearing here.

---

## Format

- **4:3, 1920 x 1440 by default.** 16:9 at 1920 x 1080 is an opt-in stated in the routing header. A generated deck defaults to 16:9, so 4:3 is only ever present because the prompt asked for it and the audit confirmed it. There is no shell to inherit it from. 4:3 gives less horizontal room, so two-column comparisons need tighter copy.
- Persistent chrome on every sheet except the hub: part name bottom left in the mono face at reduced opacity, logical sheet number bottom right, per-part progress rail along the bottom edge.
- `data-label` and `data-screen-label` on every section for the thumbnail rail.
- Footer numbers the **logical** sheet, so a build chain reads the same number across all its states.
- No dates in sheet titles. Dates go stale the moment a meeting moves.

---

## Assets

**Every brand asset is fetched from its canonical source and hashed on arrival.** `assets/PROVENANCE.json` records source URL and sha256 for each file, and the audit re-hashes them. An asset is never adopted from elsewhere in the repo on the assumption that a copy already in use must be correct.

**Derived artwork is verified by measurement, not by hash.** A favicon, a PWA icon, or any raster rendered down from a mark has no canonical file to compare against. It is checked by decoding the image and confirming the brand color is present as an exact value in the unantialiased pixels, and that no off-brand near-gold dominates. `PROVENANCE.json` records these as derived, with the measurement rather than a source hash.

**The provenance check covers mirrors, not just the bundle.** Any copy of a mark elsewhere in the repo is hashed against the canonical file by the same audit, because a mark that is correct in `src/lib/design-system/assets/` and recolored in `public/` is the exact failure that occurred. Hash comparison must be made platform-independent first: `.gitattributes` pins `*.svg -text` and `*.png binary`, since `core.autocrlf` rewrites bytes on Windows checkout and the same commit would otherwise pass on one machine and fail on another.

This is not procedural caution. `public/assets/logos/Mark-Gold.svg`, in use on the `frc-app` splash screen, carries `#D4AF37` where the canonical mark carries `#FFE629`. A recolored team mark violates the team's own branding rule, and it survived undetected because it looked plausible and nobody re-fetched the original. A hash comparison finds that in one second; an eyeball never does.

The following are still outstanding.

### Held and verified
- `Mark-Gold.svg`, `Mark-White.svg`, `Mark-Black.svg`, fetched canonical and hashed

### Outstanding

**From https://frcteam5669.com/outreach/branding:**
- `Type-Gold.svg`, `Type-White.svg`, `Type-Black.svg`
- `5669-Seal.svg`
- `Mark-Guides.svg`, `Type-Guides.svg` (spacing references)

**From https://www.firstinspires.org/about/brand:**
- FIRST horizontal logo, full-color reverse, EPS or PNG
- FIRST vertical logo, full-color reverse, EPS or PNG
- FIRST Robotics Competition program logo, icon horizontal and icon vertical, full-color reverse
- FIRST LEGO League program logo and division lockups, if the FLL teams adopt this system

Dark-background lockups are only published as EPS and PNG, because the white requires a transparent background. PNG is the format to pull for deck use.

**Team-supplied:**
- Sponsor logos as transparent PNG, one per sponsor, tiered
- Robot photography per the standing photography direction
- Field and pit photography from the most recent season

---

## Changelog

- **1.6 (2026-08-23)** - Documented that `DeckStage` scopes document canvas painting behind
  `.frc-letterbox` on the deck root, which declares the deck owns the viewport and keeps an
  embedded deck from repainting its host page. This makes letterbox a required root class on
  a full-viewport deck that no guard can enforce, since its absence is legal for an embedded
  one, so audit check 43 is the only thing that catches it.
- **1.5 (2026-08-23)** - The shell is gone, replaced by There is no shell. `Deck.dc.html`
  cannot reach Claude Design: the CLI converter has no template concept, and the platform
  registers templates under a `templates[]` key the converter does not write, so a repo
  authored system cannot contribute templates at all. The shell was load-bearing for three
  documented rules rather than being convenience, and a generated deck came back 16:9 with
  zero audience class occurrences and a rolled-own stage that never read `--edge`. Its four
  jobs are reassigned: aspect, ground, and audience to the prompt's routing header, verified
  by audit; stage painting to a new `DeckStage` component. The footer rail needed no
  reassignment because it was already a component, which is the proof of the approach. The
  result is that nothing is copied and everything is referenced, which removes the last
  remnant of the template model this system was built to avoid.
- **1.4 (2026-08-22)** - Two corrections to the v1.3 asset rule, both found while applying
  it. The rule as written was unfollowable for derived artwork: a favicon or PWA icon
  rendered down from a mark has no canonical file to hash, so it is verified by decoding the
  image and confirming the brand color is present as an exact value. And the check covers
  mirrors anywhere in the repo rather than only the bundle, since a mark correct in the
  bundle and recolored in `public/` is precisely what happened, with `.gitattributes`
  pinning SVG and PNG bytes so the hash is not platform-dependent.
- **1.3 (2026-08-22)** - Rewrote Assets around canonical fetch and hash provenance, recording
  source URL and sha256 per file with the audit re-hashing them, and the rule that an asset
  is never adopted from elsewhere in the repo because a copy is already in use. The cleanup
  pass found the `frc-app` splash screen serving a recolored team mark, `#D4AF37` against a
  canonical `#FFE629`, which violates the team's own branding rule and survived because it
  looked plausible and nobody re-fetched the original. The three mark files are now held
  and verified.
- **1.2 (2026-08-22)** - Three corrections found during the build. Resolved a contradiction
  in v1.0 that named the seal as footer chrome in one section and the logotype in another:
  the logotype is the footer default, because it survives rail scale and does not duplicate
  the team number the rail already sets in type. Documented the FIRST LEGO League red and
  alliance red value collision, which makes any hex-only containment scan report the
  ProgramLockup rail as a leak; it is resolved by program rather than by color, since the
  FLL Robot Game has no alliances. Added Invariant guards, specifying that every guard
  renders a visible rust fault marker at run time and throws only in the dev harness,
  because a guard that throws during a presentation takes the deck down in front of the
  room and does it on the external decks that matter most.
- **1.1 (2026-08-22)** - Added Where the system lives. Authoring moved to Claude Code with
  the system in `frc-app` at `src/lib/design-system/`, sourced by Claude Design from GitHub,
  so the deck components and the app components are one set. Records that the system was
  built fresh rather than extracted from existing `frc-app` code, since extraction would
  have produced a description of the current CSS instead of a specification, and that
  migrating existing app surfaces onto the tokens is separate work that does not block
  decks. The specimen now ships twice, as a Claude Design template and as a dev-guarded
  route mounting the real components.
- **1.0 (2026-08-22)** - Initial system. Two grounds plus a paper sheet, the five published team colors with fixed roles, the red partition resolving the three-way overload between FIRST brand red, alliance red, and error, program and season token layers so FLL and the annual reskin cost one class each, the four-family type stack with Roboto quarantined to FIRST-attributed blocks, and a six-group component manifest. Architecture is a shell plus a sheet-pattern library rather than a template set: a template is a copied file that forks on first use and receives no later fix, so the twenty-six sheet patterns are components and the deck genres live in `FRC_CLAUDE_DESIGN_STANDARDS.md` as recipes. `Specimen.dc.html` ships as reference and is explicitly not a starting point.
