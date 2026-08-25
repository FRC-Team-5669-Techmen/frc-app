# SectionSheet

`sheets/SectionSheet` - class `frc-sheet-section` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

The divider between parts of a deck.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`. The part **index** is chrome and stays a prop; the part **name** is copy and is a child.

## Rules

- The chevron rail under the title is SQUADRON's rule element and is legal on every ground here, because it is this pattern's structure rather than a substitute for a divider.
- One section sheet per part. Two in a row means the parts are too small.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<SectionSheet index={2} label="Build">
  <span slot="eyebrow">Part two</span>
  <span slot="title">Build</span>
  <span slot="lede">Drivetrain, intake, and the parts we are still waiting on.</span>
</SectionSheet>
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
