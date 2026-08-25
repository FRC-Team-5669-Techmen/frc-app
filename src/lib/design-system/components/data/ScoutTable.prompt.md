# ScoutTable / ScoutRow

`data/ScoutTable` - classes `frc-scout`, `frc-scout-row` - namespace FRC5669DesignSystem

Scouting data by team, with the alliance side marked. Clicking a row dims the others.

## Copy

- `slot="col"` per column head, optional `slot="caption"`, then `ScoutRow` children. Inside a row: `slot="team"` then `slot="cell"` per column.

## Rules

- **One of the three components allowed `--alliance-red` / `--alliance-blue`** (with `AllianceSplit` and `FieldDiagram`). They are alliance DATA, never decoration, and they resolve **only inside `.frc-ground-field`**. On SQUADRON or paper the stripe falls back to structure tones and the RED / BLUE word carries the meaning.
- Focus is emphasis. It reveals nothing.

## Example

```jsx
<ScoutTable>
  <span slot="col">Team</span><span slot="col">Cycles</span>
  <ScoutRow id="r1" alliance="red"><span slot="team">5669</span><span slot="cell">7</span></ScoutRow>
</ScoutTable>
```

## The element you write is yours

Write any legal element for a slot. `<span slot="title">`, `<h2 slot="title">`
and `<p slot="title">` all render the same box — the component pins the display,
font and margin it needs on the class it paints, so the element carries only
semantics. Pick it for meaning (a heading, a link, an abbreviation), never to get
a layout.

This is a rule the system enforces, not a convention: `ds:audit` check 31 fails
if a slot's class has no `display` of its own. It exists because it used to be
false — `ResultBanner` printed "Quarterfinal 2RED ALLIANCE" and `QuoteBlock`
printed "SENIOR, CLASS OF 2026DRIVE COACH" when their slots were written as
adjacent inline spans, and `<h2 slot="title">` raised a DOM nesting error on
`SectionSheet` while working on `SafetySheet`.
