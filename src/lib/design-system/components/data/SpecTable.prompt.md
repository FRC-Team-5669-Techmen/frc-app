# SpecTable / SpecRow

`data/SpecTable` - classes `frc-spec`, `frc-spec-row` - namespace FRC5669DesignSystem

The spec sheet: label left, measured value right, hairline between. `emphasis` puts one value in hero color.

## Copy

- **Rows are child components.** Inside a row: `slot="label"`, `slot="value"`, optional `slot="note"` on its own line. Optional `slot="caption"` on the table.

## Rules

- Values are mono with tabular numerals so a column reads as a column.
- At most one `emphasis` row per table.
- A spec table counts toward the density floor: two thirds of sheets carry a visual aid.

## Example

```jsx
<SpecTable>
  <span slot="caption">Drivetrain, as built</span>
  <SpecRow><span slot="label">Free speed</span><span slot="value">16.4 ft/s</span></SpecRow>
  <SpecRow emphasis><span slot="label">Wheel</span><span slot="value">4 in colson</span></SpecRow>
</SpecTable>
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
