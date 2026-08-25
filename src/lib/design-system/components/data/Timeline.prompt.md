# Timeline / TimelineItem

`data/Timeline` - classes `frc-timeline`, `frc-timeline-item` - namespace FRC5669DesignSystem

A season, a build week or an event day down a rail. States: `default`, `done`, `current`, `risk`.

## Copy

- Items are child components; inside: `slot="when"`, `slot="title"`, `slot="body"`.

## Rules

- `current` carries the only glow on the rail, and it is zero on paper by alias.
- **No dates in sheet titles**; a date belongs in `slot="when"`, where moving a meeting costs one edit.

## Example

```jsx
<Timeline>
  <TimelineItem state="done"><span slot="when">Week one</span><span slot="title">Kickoff read</span></TimelineItem>
  <TimelineItem state="current"><span slot="when">Week four</span><span slot="title">Assembly</span></TimelineItem>
</Timeline>
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
