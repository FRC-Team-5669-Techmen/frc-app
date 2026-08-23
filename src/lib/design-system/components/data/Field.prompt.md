# Field

`data/Field` - class `frc-field` - namespace FRC5669DesignSystem

A label and its value. `inline` puts them on one line; `mono` sets the value in the mono face with tabular numerals.

## Copy

- **Both halves are children**: `slot="label"` and `slot="value"`.

## Rules

- Labels are mono UPPERCASE with wide tracking; values are body copy. That casing split holds everywhere in the system.
- For a run of measurements use `SpecTable`; for telemetry use `Readout`.

## Example

```jsx
<Field mono>
  <span slot="label">Frame perimeter</span>
  <span slot="value">112 in</span>
</Field>
```
