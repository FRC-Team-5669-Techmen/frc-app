# StatementSheet

`sheets/StatementSheet` - class `frc-sheet-statement` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

One thing, said once.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="attribution"`.

## Rules

- The only sheet that may run display type with nothing to support it, so the room reads the sentence instead of skimming a layout.
- One sentence. Two sentences is a `SplitSheet`.
- `StencilTitle` carries the hero color and the rationed glow; on paper both flatten by alias, so there is no print variant.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<StatementSheet label="Standing order">
  <span slot="eyebrow">Standing order</span>
  <span slot="title">Nobody runs a machine alone.</span>
  <span slot="attribution">Shop rule one, every season since 2019</span>
</StatementSheet>
```
