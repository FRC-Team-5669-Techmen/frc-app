# AwardSheet

`sheets/AwardSheet` - class `frc-sheet-award` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

What the team won and what it was for.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="plate"` (an `AwardPlate`); every other child is the side column.

## Rules

- `banner`: an award sheet is a statement, not a data sheet.
- The award name is the one place a sheet may run centered hero type. On paper the accent flattens to bronze ink and the glow to nothing, by alias.
- The side column is what the award MEANS - a judges' quote, a `ResultBanner`, a readout stack. A plate on its own is a trophy photo.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<AwardSheet label="Award">
  <span slot="title">What we brought home</span>
  <AwardPlate slot="plate"><span slot="name">Industrial Design Award</span><span slot="year">2026</span></AwardPlate>
  <ResultBanner tone="win"><span slot="tag">Win</span><span slot="title">Quarterfinal 2</span></ResultBanner>
</AwardSheet>
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
