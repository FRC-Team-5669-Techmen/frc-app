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
