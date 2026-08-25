# Card

`surfaces/Card` - class `frc-card` - namespace FRC5669DesignSystem

The general panel. It takes the ground depth treatment automatically: SQUADRON plates rise above the black, FIELD panels recess into the instrument, paper is a flat hairline.

## Copy

- `slot="title"`, `slot="meta"`, `slot="foot"`. Everything else you pass is the body.

## Rules

- Radius 4px. Never a soft grey drop shadow alone - the depth comes from `--plate-rise` / `--well-recess`, which the ground picks.
- `flush` removes the padding when media runs to the card edge.
- For a note that must out-weigh body copy use `Callout`; for a hazard use `SafetyNote`.

## Example

```jsx
<Card>
  <span slot="title">Standing orders</span>
  <span slot="meta">Posted Monday</span>
  <p className="frc-card-body">Shop opens at 15:30.</p>
</Card>
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
