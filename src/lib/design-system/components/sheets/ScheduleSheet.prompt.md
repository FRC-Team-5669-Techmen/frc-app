# ScheduleSheet

`sheets/ScheduleSheet` - class `frc-sheet-schedule` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

Who is where, when. Meeting weeks, an event day, a build calendar.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="key"` repeated, `slot="foot"`; the child is the `GanttChart` or the table.

## Rules

- `boot`: a schedule is read as data, not as narrative.
- Lane geometry (`start`, `span`, `today`) is structural and lives in percentages, so a calendar can be rescaled without touching a string.
- `slot="key"` is the legend. A lane state with no key is a color nobody can read.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<ScheduleSheet label="Build calendar">
  <span slot="title">Who is where, when</span>
  <GanttChart cols={6} today={54}>...</GanttChart>
  <Chip slot="key">At risk</Chip>
</ScheduleSheet>
```
