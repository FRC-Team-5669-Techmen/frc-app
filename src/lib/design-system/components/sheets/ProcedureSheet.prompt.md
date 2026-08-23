# ProcedureSheet

`sheets/ProcedureSheet` - class `frc-sheet-procedure` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

How a job is done, in order. The training sheet a sophomore runs a session from.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`, then `Step` children.

## Rules

- Every step is on the sheet at rest and nothing waits for a click. That is the mentor constraint, and it is load-bearing here.
- The aside is where the drawing, the tool list or a `Callout` goes.
- A procedure that involves a shop hazard belongs on a `SafetySheet`, which cannot be built without a `SafetyNote`.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<ProcedureSheet label="Squaring stock">
  <span slot="title">Squaring stock</span>
  <Step state="current"><span slot="title">Locate the datum</span><span slot="text">Edge find both walls, zero the readout.</span></Step>
  <Callout slot="aside" tone="warn"><span slot="title">Before you start</span><p className="frc-callout-text">Stock clamped, sleeves down.</p></Callout>
</ProcedureSheet>
```
