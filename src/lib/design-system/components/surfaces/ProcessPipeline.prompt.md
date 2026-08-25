# ProcessPipeline / PipelineStep

`surfaces/ProcessPipeline` - classes `frc-pipeline`, `frc-pipeline-step` - namespace FRC5669DesignSystem

A left-to-right process: design, cut, assemble, wire, test. Chevron-shaped steps; the last one is squared off so the chain reads as finished rather than cut off.

## Copy

- Steps are child components; inside: `slot="title"`, `slot="note"`.

## Rules

- Step numbers come from position, so reordering cannot leave a wrong number.
- States: `default`, `done`, `current`, `blocked`.
- Five steps is the practical ceiling at 4:3.

## Example

```jsx
<ProcessPipeline>
  <PipelineStep state="done"><span slot="title">Design</span><span slot="note">CAD released</span></PipelineStep>
  <PipelineStep state="current"><span slot="title">Assemble</span><span slot="note">On the fixture</span></PipelineStep>
</ProcessPipeline>
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
