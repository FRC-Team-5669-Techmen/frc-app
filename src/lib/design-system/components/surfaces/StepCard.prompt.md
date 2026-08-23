# StepCard / Step

`surfaces/StepCard` - classes `frc-steps`, `frc-step` - namespace FRC5669DesignSystem

A numbered procedure. `StepCard` is the container; numbering is a CSS counter, so inserting a step renumbers the rest and no printed number goes stale. Step states: `default`, `done`, `current`.

## Copy

- Steps are child components; inside: `slot="title"`, `slot="text"`.

## Rules

- Procedure sheets are the ones a sophomore runs a session from: every step is visible at rest, and nothing waits for a click.
- Keep a card to five or six steps. Past that it is two sheets.

## Example

```jsx
<StepCard>
  <Step state="done"><span slot="title">Square the stock</span><span slot="text">Face one side, then the adjacent edge.</span></Step>
  <Step state="current"><span slot="title">Locate the datum</span><span slot="text">Edge find both walls, zero the readout.</span></Step>
</StepCard>
```
