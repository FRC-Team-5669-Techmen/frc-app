# DecisionMatrix

`data/DecisionMatrix` - class `frc-matrix` - namespace FRC5669DesignSystem

Weighted criteria against options. Totals are computed and the winning row is marked, so a weight change cannot leave a stale winner on the sheet.

## Copy

- `slot="criterion"` repeated (column heads), `slot="option"` repeated (row heads), optional `slot="caption"`, `slot="corner"`, `slot="total"`.

## Locked (props, not canvas copy)

- **`weights` and `scores` stay array-only.** They are structure, not copy: nobody reads a weight vector aloud, and splitting a matrix of numbers into children moves the endpoints further apart instead of closer to the canvas.

## Rules

- `scores[option][criterion]`, aligned to the order the slots appear in.
- The winner is the highest weighted total, marked with the soft accent - never by deleting the others.

## Example

```jsx
<DecisionMatrix weights={[3, 2, 1]} scores={[[4, 3, 5], [5, 2, 2]]}>
  <span slot="criterion">Cycle time</span>
  <span slot="option">Over the bumper</span>
</DecisionMatrix>
```
