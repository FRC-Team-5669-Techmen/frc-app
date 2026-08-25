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
