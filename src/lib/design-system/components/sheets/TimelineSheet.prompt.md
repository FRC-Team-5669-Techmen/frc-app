# TimelineSheet

`sheets/TimelineSheet` - class `frc-sheet-timeline` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

The arc of a season, a build, or an event day.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`, then `TimelineItem` children.

## Rules

- `shutter`, because a timeline is narrative content. A timetable of clock times is a `ScheduleSheet`, and that one boots.
- Items carry their own state: `done`, `current`, `risk`. `current` is the only glow on the rail.
- **No dates in the sheet title.** A date belongs in `slot="when"` on the item, where moving a meeting costs one edit.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<TimelineSheet label="Build season">
  <span slot="title">Six weeks, four gates</span>
  <TimelineItem state="current"><span slot="when">Week four</span><span slot="title">Assembly</span></TimelineItem>
</TimelineSheet>
```
