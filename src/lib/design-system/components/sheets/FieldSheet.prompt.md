# FieldSheet

`sheets/FieldSheet` - class `frc-sheet-field` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

The field from above, with the zones a strategy conversation points at.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`; the child is the `FieldDiagram`.

## Rules

- Zone geometry is structural and stays an array; every zone label is a child.
- Clicking a zone raises it and dims the others. Nothing appears that was not already drawn.
- The aside carries the cycle times and the callouts that name what happens in each zone.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<FieldSheet label="Field">
  <span slot="title">Where our cycles live</span>
  <FieldDiagram zones={ZONES} viewBox="0 0 1600 800">
    <span slot="zone" data-zone="neutral">Neutral zone</span>
  </FieldDiagram>
</FieldSheet>
```
