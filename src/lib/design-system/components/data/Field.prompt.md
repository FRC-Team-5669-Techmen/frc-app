# Field

`data/Field` - class `frc-field` - namespace FRC5669DesignSystem

A label and its value. `inline` puts them on one line; `mono` sets the value in the mono face with tabular numerals.

## Copy

- **Both halves are children**: `slot="label"` and `slot="value"`.

## Rules

- Labels are mono UPPERCASE with wide tracking; values are body copy. That casing split holds everywhere in the system.
- For a run of measurements use `SpecTable`; for telemetry use `Readout`.

## Example

```jsx
<Field mono>
  <span slot="label">Frame perimeter</span>
  <span slot="value">112 in</span>
</Field>
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
