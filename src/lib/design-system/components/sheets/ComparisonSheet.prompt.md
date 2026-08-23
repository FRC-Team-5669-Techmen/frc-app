# ComparisonSheet

`sheets/ComparisonSheet` - class `frc-sheet-comparison` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

Two options, one decision.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="verdict"`; the child is a `CompareSplit` or a `DecisionMatrix`.

## Rules

- Use `CompareSplit` when the criteria are judgements and `DecisionMatrix` when they are weighted numbers. The matrix computes its own totals, so a weight change cannot leave a stale winner on the sheet.
- Both options stay fully rendered. A comparison that dims the loser to nothing is an argument, not a comparison.
- `slot="verdict"` is where the `Badge`, `Callout` or `ResultBanner` naming the decision goes. A comparison sheet with no verdict sends the room back to the same argument next week.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<ComparisonSheet label="Intake geometry">
  <span slot="title">Over the bumper, or under</span>
  <CompareSplit>...</CompareSplit>
  <Badge slot="verdict" tone="ok">Decision: over the bumper</Badge>
</ComparisonSheet>
```
