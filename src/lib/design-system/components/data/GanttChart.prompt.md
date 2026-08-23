# GanttChart / GanttBar

`data/GanttChart` - classes `frc-gantt`, `frc-gantt-bar` - namespace FRC5669DesignSystem

The build schedule: one lane per workstream, a column grid behind it, an optional today marker.

## Copy

- `slot="tick"` per column, repeated, then `GanttBar` children. Inside a bar: `slot="label"` for the lane and `slot="bar"` for the copy that rides inside the bar.

## Locked (props, not canvas copy)

- `cols`, `today`, `start`, `span` are geometry, in percentages of the whole span. A schedule can be rescaled without touching a string.

## Rules

- States: `default`, `done`, `risk`, `blocked`. Blocked is rust and it means blocked, not late.
- Keep lane labels short: at 4:3 the lane is what needs the room.

## Example

```jsx
<GanttChart cols={6} today={54}>
  <span slot="tick">Wk 1</span>
  <GanttBar start={0} span={34} state="done"><span slot="label">Drivetrain</span></GanttBar>
</GanttChart>
```
