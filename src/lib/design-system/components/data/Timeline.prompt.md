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
