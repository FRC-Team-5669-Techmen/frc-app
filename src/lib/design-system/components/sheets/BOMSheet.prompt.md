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
