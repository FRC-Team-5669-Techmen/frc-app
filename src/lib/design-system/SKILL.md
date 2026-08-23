---
name: frc5669-design-system
description: Build FRC Team 5669 (Techmen) presentation decks and printed materials with the FRC5669DesignSystem at src/lib/design-system. Use when creating or editing a deck, a training sheet, a match review, a sponsor or judge presentation, pit signage, or an awards handout — and when adding to or changing the design system itself. Covers the three grounds, the sheet-pattern library, the FIRST usage rules, and the audit that keeps them true.
---

# FRC5669DesignSystem

The visual identity system for FRC Team 5669 (Techmen) decks and materials. Specification: `FRC_Design_System.md` v1.1, which is authoritative for every color, token, class and rule. `_ds_manifest.json` is the exported registry and the staleness authority.

**Namespace** `FRC5669DesignSystem` · **class prefix** `frc-` · **root** `src/lib/design-system/`

## The five things that matter most

1. **Build every sheet from a sheet pattern.** There are twenty-six. A deck sheet built from raw markup is a defect: a pattern gets fixed once and every deck that used it improves, a hand-rolled sheet never does.
2. **Copy lives in children.** Every string a human reads aloud is a child carrying a plain `slot` attribute. Copy in a props array is not editable on the Claude Design canvas, and a deck gets edited the morning it runs.
3. **Ground and audience are inherited.** They are two classes on the deck root. No component takes either as a prop, and no pattern has a per-ground variant.
4. **Base styles are the visible end state.** Nothing is hidden until clicked. Click targets change emphasis only. This is what keeps print, PDF and reduced-motion complete, and it is why a sophomore can run a training deck without knowing which region is clickable.
5. **Never invent a color.** If it is not in `tokens/colors.css`, it does not exist.

## Making a deck

```
1. Copy templates/Deck.dc.html.        The ONLY file anyone copies.
2. Set the ground and audience classes on the deck root.
3. Add one <section> per sheet, each built from a sheet PATTERN.
4. Reference everything else. Never copy templates/Specimen.dc.html.
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

## Rules the code refuses to break

These throw or fail rather than being remembered:

- `ImageFrame` throws on `bleed` with `kind="screenshot"`. A feathered interface capture reads as a rendering fault.
- `Cutout` throws on `fit="cover"`. Cover crops the silhouette and makes an alpha image look framed.
- `SponsorTier` throws on any mark that is not a `Cutout ground="none"`. A contact shadow under a corporate logo reads as an error.
- `SafetySheet` throws without a `SafetyNote`. A safety sheet that reads as "safety was covered" without a hazard note is worse than none.
- `FirstName` refuses plural and possessive forms of the FIRST name and tracks first use per heading and body channel.
- `npm run ds:audit` fails on: an alias set that differs between grounds, a `var()` in a ground alias, gold on paper, a color outside the published set, an import out of order, an animation outside the reduced-motion gate, a manifest that does not match the disk, an emoji, a sheet pattern naming a ground, a sheet defaulting to a fifth transition, or the specimen listed as a starting point.

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
npm run ds:audit
```

Then open `/_ds` in `npm run dev` (dev-guarded; absent from production builds). It mounts the real components and proves in the browser: alias resolution in all three grounds, no gold on paper, all four transitions, every animation gated, static end state, image treatments, the cutout rectangle rule, the match clock states, alliance containment, and every sheet pattern stepped through all three grounds and both audience modes.

## Assets

Team marks, FIRST logos and sponsor art are **not in the repo**. Every mark-bearing component renders a clearly marked empty slot at the correct minimum size until the file lands. No substitute is drawn and nothing resembling a mark is generated. See `assets/README.md` for the exact filenames.

## Enabling this skill

Copy or symlink this file into `.claude/skills/frc5669-design-system/SKILL.md`. It is kept in the bundle so it ships and versions with the system it describes.
