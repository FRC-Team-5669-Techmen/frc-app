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
