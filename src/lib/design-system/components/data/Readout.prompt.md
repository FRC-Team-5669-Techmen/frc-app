# Readout

`data/Readout` - class `frc-readout` - namespace FRC5669DesignSystem

A telemetry line: key, dotted leader, value. Tones `default`, `ok`, `warn`, `fault`.

## Copy

- `slot="label"` and `slot="value"`.

## Rules

- Mono end to end with tabular numerals, so a stack of readouts lines up without a table. Wrap a stack in `.frc-readout-stack`.
- This is chrome voice: UPPERCASE, wide tracking. Do not use it for a sentence.

## Example

```jsx
<div className="frc-readout-stack">
  <Readout><span slot="label">Battery</span><span slot="value">12.4 V</span></Readout>
  <Readout tone="fault"><span slot="label">Practice bot</span><span slot="value">Down</span></Readout>
</div>
```
