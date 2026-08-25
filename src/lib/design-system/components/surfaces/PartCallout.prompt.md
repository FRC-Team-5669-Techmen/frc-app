# PartCallout

`surfaces/PartCallout` - class `frc-part` - namespace FRC5669DesignSystem

A COTS part for a BOM or a training sheet: what it is, who sells it, the part number to type into a cart, and what it costs.

## Copy

- `slot="media"` (a `Cutout`), `slot="name"`, `slot="vendor"`, `slot="pn"`, `slot="price"`, `slot="note"`.

## Rules

- The part number is mono and untracked so it can be read out digit by digit.
- The price is display face: a budget conversation is a numerals conversation.
- The image is a `Cutout`, never an `ImageFrame`. Vendor art arrives with an alpha channel, and framing it draws the discolored box.

## Example

```jsx
<PartCallout>
  <Cutout slot="media" ground="shelf" src={gearbox} width={200} height={160} />
  <span slot="name">MAXPlanetary, 3 stage</span>
  <span slot="vendor">REV Robotics</span>
  <span slot="pn">REV-21-2100</span>
  <span slot="price">$74.00</span>
</PartCallout>
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
