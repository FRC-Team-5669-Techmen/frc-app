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
