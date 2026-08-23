# BarChart / Bar

`data/BarChart` - classes `frc-bars`, `frc-bar` - namespace FRC5669DesignSystem

Horizontal bars against a shared scale, with an optional target line.

## Copy

- Bars are child components. `slot="label"` names the bar; `slot="value"` overrides the printed number when it needs a unit.

## Locked (props, not canvas copy)

- `max`, `target` on the chart and `value` on each bar are **structural numbers**, not copy: they are the scale, and a scale typed twice drifts.

## Rules

- Tones: `default` (accent), `ok`, `warn`, `fault`, `quiet`. Tone is a judgement about the bar, not decoration.
- The target line is hero color and 2px, so it reads over any fill.

## Example

```jsx
<BarChart max={120} target={90}>
  <Bar value={104}><span slot="label">Mechanical</span><span slot="value">104 h</span></Bar>
  <Bar value={52} tone="warn"><span slot="label">Electrical</span><span slot="value">52 h</span></Bar>
</BarChart>
```
