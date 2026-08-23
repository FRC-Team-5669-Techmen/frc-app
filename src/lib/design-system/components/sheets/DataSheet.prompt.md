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
