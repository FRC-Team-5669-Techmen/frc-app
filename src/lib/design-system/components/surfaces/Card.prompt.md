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
