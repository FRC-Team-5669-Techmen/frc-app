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
