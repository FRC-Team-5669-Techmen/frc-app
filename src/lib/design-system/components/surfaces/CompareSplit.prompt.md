# CompareSplit / CompareRow

`surfaces/CompareSplit` - classes `frc-compare`, `frc-compare-row` - namespace FRC5669DesignSystem

Two options down a shared list of criteria.

## Copy

- Head: `slot="label"`, `slot="option-a"`, `slot="option-b"`. Rows are child components; inside: `slot="label"`, `slot="a"`, `slot="b"`.

## Rules

- `lead="a" | "b"` marks the winner of THAT row in hero color and dims the other. It never hides the other: the comparison is the content.
- **4:3 gives less horizontal room**, so two-column copy has to stay tight. The component will not shrink type to rescue a paragraph.

## Example

```jsx
<CompareSplit>
  <span slot="label">Criterion</span>
  <span slot="option-a">Belt drive</span>
  <span slot="option-b">Chain drive</span>
  <CompareRow lead="a"><span slot="label">Maintenance</span><span slot="a">No tensioning mid-event</span><span slot="b">Check every match</span></CompareRow>
</CompareSplit>
```
