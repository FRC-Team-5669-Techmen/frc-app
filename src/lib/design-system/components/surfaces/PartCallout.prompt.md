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
