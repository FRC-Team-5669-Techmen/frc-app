# CalloutDrawing / CalloutPin

`surfaces/CalloutDrawing` - classes `frc-drawing`, `frc-pin` - namespace FRC5669DesignSystem

Numbered pins over a drawing or photograph. Pin numbers come from order.

## Copy

- The media element, then `CalloutPin` children carrying `slot="label"`, plus `slot="caption"` on the figure.

## Locked (props, not canvas copy)

- `x` and `y` are percentages of the media box: geometry, not copy.

## Rules

- **Every label is rendered at rest**, at reduced opacity. Clicking a pin raises the label it already drew; it never creates one. That keeps print, PDF and reduced-motion complete and means a presenter never has to know an unmarked region is clickable.

## Example

```jsx
<CalloutDrawing>
  <ImageFrame kind="drawing" src={section} />
  <CalloutPin x={26} y={30}><span slot="label">Input pinion</span></CalloutPin>
</CalloutDrawing>
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
