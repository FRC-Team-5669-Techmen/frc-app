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
