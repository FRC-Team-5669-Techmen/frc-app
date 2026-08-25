# DataSheet

`sheets/DataSheet` - class `frc-sheet-data` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

Numbers with the chart that explains them.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="stat"` repeated, `slot="aside"`; the child is the chart or table.

## Rules

- `boot` is the HUD de-blur every data and telemetry sheet uses. It is what tells the room the next sheet is numbers.
- Four stats across the top at most, and **at most one `tone="hero"`**. Three heroes is no heroes.
- The aside is where the readout stack or the `Callout` that says what the number MEANS goes. A number with no reading is a number the room argues about.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<DataSheet label="Hours">
  <span slot="title">Hours in the shop</span>
  <StatBlock slot="stat" tone="hero"><span slot="value">412</span><span slot="label">Shop hours</span></StatBlock>
  <SpecTable>...</SpecTable>
</DataSheet>
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
