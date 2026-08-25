# SampleGrid / Sample

`surfaces/SampleGrid` - classes `frc-samples`, `frc-sample` - namespace FRC5669DesignSystem

A set of material, finish, print or livery samples. `cols` sets the grid.

## Copy

- Samples are child components; inside: `slot="name"`, `slot="note"`. Any other child is the media.

## Rules

- The media well reads from `--surface-viewport`, the same backplate token `ImageFrame` uses, so a sample sheet retints with the ground.
- Samples are opaque media. A part on alpha is a `Cutout`.

## Example

```jsx
<SampleGrid cols={4}>
  <Sample src={anodized}><span slot="name">Anodized gold</span><span slot="note">Two week lead time</span></Sample>
</SampleGrid>
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
