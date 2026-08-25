# Callout

`surfaces/Callout` - class `frc-callout` - namespace FRC5669DesignSystem

A note that outweighs body copy without becoming a heading. Tones: `accent`, `ok`, `warn`, `fault`, `quiet`. `icon` takes an inlined Lucide SVG.

## Copy

- `slot="title"`; everything else is the body.

## Rules

- **A shop hazard is not a Callout.** Use `SafetyNote`: it is a separate component so that scanning a deck for whether safety was covered is a glance rather than a read, and so a hazard cannot be softened into a note by changing one word.
- `fault` is rust. There is no red available here.
- No emoji. Icons are Lucide, inlined, on `currentColor`.

## Example

```jsx
<Callout tone="warn" icon={<IconTriangleAlert />}>
  <span slot="title">Deadline</span>
  <p className="frc-callout-text">Submission closes Thursday at 15:00 Pacific.</p>
</Callout>
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
