# StatBlock

`data/StatBlock` - class `frc-stat` - namespace FRC5669DesignSystem

One number said loudly. Tones: `default`, `hero`, `ok`, `warn`, `fault`. `size="sm"` drops it to sub scale.

## Copy

- `slot="value"`, `slot="unit"`, `slot="label"`, `slot="note"` - all children.

## Rules

- Numerals are hero material: display face, tabular figures, tight tracking.
- **Glow is rationed** to `tone="hero"`, and it is zero on paper by alias, so a light sheet needs no variant.
- One hero stat per sheet. Three heroes is no heroes.

## Example

```jsx
<StatBlock tone="hero">
  <span slot="value">412</span><span slot="unit">hrs</span>
  <span slot="label">Shop hours this season</span>
</StatBlock>
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
