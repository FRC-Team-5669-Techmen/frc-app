# BOMSheet

`sheets/BOMSheet` - class `frc-sheet-bom` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

What a mechanism is made of and what it costs.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="totals"`, `slot="aside"`, then `PartCallout` children.

## Rules

- Part art is a `Cutout`, never an `ImageFrame`: vendor art arrives with an alpha channel and framing it draws the discolored box.
- **A BOM sheet without a total is a parts list.** `slot="totals"` takes the `SpecTable` of subtotal, shipping and total.
- Part numbers are mono and untracked so they can be read out digit by digit.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<BOMSheet label="Drivetrain BOM">
  <span slot="title">What it is made of</span>
  <PartCallout>...</PartCallout>
  <SpecTable slot="totals">...</SpecTable>
</BOMSheet>
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
