# AwardPlate

`surfaces/AwardPlate` - class `frc-award` - namespace FRC5669DesignSystem

One award, struck rather than printed: a raised plate, a hero name, the event and year underneath.

## Copy

- `slot="eyebrow"`, `slot="name"`, `slot="event"`, `slot="year"`.

## Rules

- This is the one place a sheet may run hero type centered.
- On paper the accent flattens to bronze ink and the glow to nothing, by alias - no paper variant exists or is needed.
- One award per plate. A list of awards is a `Timeline` or a `SpecTable`.

## Example

```jsx
<AwardPlate>
  <span slot="eyebrow">Los Angeles regional</span>
  <span slot="name">Industrial Design Award</span>
  <span slot="year">2026</span>
</AwardPlate>
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
