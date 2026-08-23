---
name: frc5669-design-system
description: Build FRC Team 5669 (Techmen) presentation decks and printed materials with the FRC5669DesignSystem at src/lib/design-system. Use when creating or editing a deck, a training sheet, a match review, a sponsor or judge presentation, pit signage, or an awards handout — and when adding to or changing the design system itself. Covers the three grounds, the sheet-pattern library, the FIRST usage rules, and the audit that keeps them true.
---

# FRC5669DesignSystem

The visual identity system for FRC Team 5669 (Techmen) decks and materials. **Governing documents:** [`docs/FRC_Design_System.md`](docs/FRC_Design_System.md) (brand, tokens, type, motion, the component manifest) and [`docs/FRC_CLAUDE_DESIGN_STANDARDS.md`](docs/FRC_CLAUDE_DESIGN_STANDARDS.md) (scoping and prompting — recipes, the routing header, the pre-delivery audit), both committed here so a session reads them from HEAD rather than depending on an attachment arriving. Project knowledge holds the copy Alejandro maintains; a version ships to both in the same pass. Together they are authoritative for every color, token, class and rule. `_ds_manifest.json` is the exported registry and the staleness authority.

**Namespace** `FRC5669DesignSystem` · **class prefix** `frc-` · **root** `src/lib/design-system/`

## The five things that matter most

1. **Build every sheet from a sheet pattern.** There are twenty-six. A deck sheet built from raw markup is a defect: a pattern gets fixed once and every deck that used it improves, a hand-rolled sheet never does.
2. **Copy lives in children.** Every string a human reads aloud is a child carrying a plain `slot` attribute. Copy in a props array is not editable on the Claude Design canvas, and a deck gets edited the morning it runs.
3. **Ground and audience are inherited.** They are two classes on the deck root. No component takes either as a prop, and no pattern has a per-ground variant.
4. **Base styles are the visible end state.** Nothing is hidden until clicked. Click targets change emphasis only. This is what keeps print, PDF and reduced-motion complete, and it is why a sophomore can run a training deck without knowing which region is clickable.
5. **Never invent a color.** If it is not in `tokens/colors.css`, it does not exist.

## Making a deck

```
1. Start from Blank. NOTHING is copied - no template reaches Claude Design.
2. Set the ground and audience classes on the deck root, and data-aspect on the stage.
3. Mount <DeckStage /> EXACTLY ONCE. It paints canvas, letterbox and thumbnail
   frames from the ACTIVE sheet's --bg0 and --edge; without it a transition
   flashes white. It is the deck shell's stage script, as a component.
4. Add one <section> per sheet, each built from a sheet PATTERN.
5. Reference everything else. templates/Deck.dc.html and templates/Specimen.dc.html
   are READABLE REFERENCE ONLY - read them, never copy them.
```

In React (the app, or the `/_ds` route):

```jsx
import { CoverSheet, SplitSheet, DataSheet, ImageFrame, StatBlock } from 'src/lib/design-system/index.js'

<div className="frc-deck frc-ground-field frc-audience-internal">
  <div className="frc-stage" data-aspect="4:3">
    <CoverSheet active label="Cover" footer={{ deckName: 'Match review', sheet: 1, total: 12 }}>
      <span slot="eyebrow">Qualification 42</span>
      <span slot="title">Where the match was won</span>
    </CoverSheet>
  </div>
</div>
```

## The three grounds

| Class | Use | Notes |
|---|---|---|
| `frc-ground-squadron` | Team identity: briefings, roster, standing orders | Default. Rises above Jet Black. Plates rise. Chevrons replace the divider. |
| `frc-ground-field` | Data and competition content | Cool graphite. Panels recess. **The only ground where alliance red and blue resolve.** |
| `frc-ground-paper` | Handouts, pit signage, printed material | **Techmen Gold is illegal here** (1.6:1). The accent is bronze ink; glow is zero. |

A ground may be overridden on one section. An external cover over internal working sheets is a legal composition.

## The twenty-six sheet patterns

**Generic:** `CoverSheet` `AgendaSheet` `SectionSheet` `StatementSheet` `QuoteSheet` `HubSheet` `ClosingSheet` `SplitSheet` `GallerySheet` `ProcedureSheet` `ComparisonSheet` `DataSheet` `TimelineSheet` `ScheduleSheet`

**FRC-specific:** `SubteamStatusSheet` `BlockerSheet` `TargetsSheet` `SafetySheet` `RosterSheet` `MatchBreakdownSheet` `ScoutingSheet` `FieldSheet` `BOMSheet` `AwardSheet` `SponsorSheet` `SeasonSheet`

Each carries a default transition matching its role — `shutter` general content, `boot` data and telemetry, `banner` dividers and statements, `cut` a quiet beat — overridable per instance. Read the pattern's `.prompt.md` before using it; every one names its slots and the rules it enforces.

## Invariant guards

Five rules are enforced in component code rather than remembered:

- `ImageFrame` refuses `bleed` with `kind="screenshot"`. A feathered interface capture reads as a rendering fault.
- `Cutout` refuses `fit="cover"`. Cover crops the silhouette and makes an alpha image look framed.
- `SponsorTier` refuses any mark that is not a `Cutout ground="none"`. A contact shadow under a corporate logo reads as an error.
- `SafetySheet` refuses a body with no `SafetyNote`. A sheet that reads as "safety was covered" without a hazard note is worse than none.
- `FirstName` refuses plural and possessive forms of the FIRST name, and tracks first use per heading and body channel.

**Every guard renders a visible rust fault marker at run time and throws only inside the dev harness** (`/_ds`, `ds:capture`, a test). A guard that throws during a presentation takes the whole deck down in front of the room, and it does it on the external decks that matter most — which is the opposite of what the guard is for. A visible marker fails loudly enough to be caught and cheaply enough to be survived.

There is **one** guard behaviour in the system. `FirstName` used to throw on an external audience and warn otherwise; that split is gone, because two behaviours means nobody can predict what a guard does.

The marker is not a soft landing. `npm run ds:audit` fails on a fault marker in a template, and pre-delivery audit check 40 requires zero markers in any deck called finished.

## What the audit fails on

An alias set that differs between grounds, a `var()` in a ground alias, gold on paper, a color outside the published set, an import out of order, an animation outside the reduced-motion gate, a manifest that does not match the disk, an emoji, a sheet pattern naming a ground or taking an audience prop, a sheet defaulting to a fifth transition, a template claiming to be a starting point (neither is) or a leftover startingPoints key, a missing or undocumented DeckStage, a guard fault marker in a template, or a wired asset whose bytes no longer match its recorded provenance.

## The red partition

Red is overloaded three ways in FRC. It is partitioned and nothing outside the partition may use a red:

- `--alliance-red` / `--alliance-blue` — alliance DATA only, FIELD ground only, and only inside `AllianceSplit`, `ScoutTable`, `MatchBreakdownSheet` and `FieldDiagram`.
- `--warn` copper — shop hazard, safety note, approaching deadline.
- `--fault` rust — error, failed inspection, blocked. **`MatchClock` uses rust at zero, never alliance red.**
- `--ok` green — pass, certified, complete.

LIVE and REC are a pulsing gold dot, never a red one.

## FIRST usage, enforced

The marks are used as supplied — no recoloring, rotating, cropping, containing shape, added border or added text. Pieces never stand alone. The name in text is always caps and italic, never plural or possessive, with the registered symbol on first use per channel. **Team identification accompanies the marks**, which the footer rail satisfies by carrying `5669` on every sheet — the hub is the one sheet with no rail, and so the one sheet with no FIRST mark. Ambient texture is clipped out of the rail band, so a mark never sits on a busy background.

## Verifying

```bash
npm run ds:audit      # static audit (16-27 are the source-side counterparts of the pre-delivery checks)
npm run ds:audit:controls  # break each of 16-27, prove it fires, restore
npm run ds:dev        # boot the harness (vite --mode dsspec, port 5175)
npm run ds:capture    # render every sheet pattern to PNG, headless
```

`/_ds` boots from a clean checkout: `.env.dsspec` and `.claude/launch.json` are tracked, and the route is let through both auth gates in dev — scoped to that one path.

`ds:capture` writes `artifacts/ds-capture/<ground>/<audience>/NN-Pattern.png`, 26 patterns x 3 grounds x 2 audiences. Add `--reduced-motion` to emulate the preference and write to `artifacts/ds-capture-reduced-motion/`. **This is how audit check 41 gets satisfied:** DOM measurement confirms an alias resolved, never that a sheet reads well.

Then open `/_ds`. It mounts the real components and proves in the browser: alias resolution in all three grounds, no gold on paper, all four transitions, every animation gated, static end state, image treatments, the cutout rectangle rule, the match clock states, alliance containment, and every sheet pattern stepped through all three grounds and both audience modes.

## Assets

Team marks, FIRST logos and sponsor art are **not in the repo**. Every mark-bearing component renders a clearly marked empty slot at the correct minimum size until the file lands. No substitute is drawn and nothing resembling a mark is generated. See `assets/README.md` for the exact filenames.

## Enabling this skill

Copy or symlink this file into `.claude/skills/frc5669-design-system/SKILL.md`. It is kept in the bundle so it ships and versions with the system it describes.
