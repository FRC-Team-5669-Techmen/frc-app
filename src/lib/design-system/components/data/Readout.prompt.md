# Readout

`data/Readout` - class `frc-readout` - namespace FRC5669DesignSystem

A telemetry line: key, dotted leader, value. Tones `default`, `ok`, `warn`, `fault`.

## Copy

- `slot="label"` and `slot="value"`.

## Rules

- Mono end to end with tabular numerals, so a stack of readouts lines up without a table. Wrap a stack in `.frc-readout-stack`.
- This is chrome voice: UPPERCASE, wide tracking. Do not use it for a sentence.

## Example

```jsx
<div className="frc-readout-stack">
  <Readout><span slot="label">Battery</span><span slot="value">12.4 V</span></Readout>
  <Readout tone="fault"><span slot="label">Practice bot</span><span slot="value">Down</span></Readout>
</div>
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
