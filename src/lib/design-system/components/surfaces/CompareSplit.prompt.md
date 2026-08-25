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
