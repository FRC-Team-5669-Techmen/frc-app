# Specimen.dc.html

`templates/Specimen.dc.html` · namespace FRC5669DesignSystem

## REFERENCE ONLY. THIS IS NOT A STARTING POINT.

**Do not copy this file.** Copying it produces a fork carrying twenty-six sheets nobody asked for, and that fork receives no later fix — which is the exact failure the sheet-pattern architecture exists to prevent.

**The one file anyone copies is `templates/Deck.dc.html`**: a stage, a ground class, an audience class, a footer rail, and one blank sheet. Copy that, then reference the patterns you actually need.

## What it is

A reference deck showing every one of the twenty-six sheet patterns once:

| Ground | Patterns |
|---|---|
| SQUADRON | CoverSheet, AgendaSheet, SectionSheet, StatementSheet, QuoteSheet, HubSheet, RosterSheet, SeasonSheet, ClosingSheet |
| FIELD | DataSheet, ScheduleSheet, SubteamStatusSheet, BlockerSheet, TargetsSheet, MatchBreakdownSheet, ScoutingSheet, FieldSheet, BOMSheet |
| PAPER | SplitSheet, GallerySheet, ProcedureSheet, ComparisonSheet, TimelineSheet, SafetySheet, AwardSheet, SponsorSheet |

Both audience modes appear: `frc-audience-external` on the cover, the closing sheet, the award sheet and the sponsor sheet; `frc-audience-internal` everywhere else. The ground and the audience are set **per section**, which is legal and is what a hybrid deck does — an external cover over internal working sheets.

## What it is not

- **Not the source of truth.** The patterns are React components under `components/sheets/`. This file is a *rendering* of them for Claude Design. When the two disagree, the components are right and this file is stale.
- **Not the place to check a rule.** The dev-guarded `/_ds` route in `frc-app` mounts the real components, so anything measured there is measured on the real surface. A harness that re-implements what it measures passes every check forever, including after the real surface breaks.
- **Not a deck.** There is no narrative here. Twenty-six patterns in a row is a catalogue.

## Using it

Open it, find the pattern that matches the sheet you need, then build that sheet from the component in your own deck copied from `Deck.dc.html`. Keys: arrows / page up / page down to move, Home and End to jump, `T` for the thumbnail rail.

## Keeping it honest

`npm run ds:audit` fails if this file is ever listed as a starting point in `_ds_manifest.json`. It is listed under `templates` with `copied: false`, and `startingPoints` names `Deck.dc.html` alone.
