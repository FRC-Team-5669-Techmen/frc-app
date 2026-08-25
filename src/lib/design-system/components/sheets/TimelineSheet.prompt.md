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
