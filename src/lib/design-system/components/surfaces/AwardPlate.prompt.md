# AwardPlate

`surfaces/AwardPlate` - class `frc-award` - namespace FRC5669DesignSystem

One award, struck rather than printed: a raised plate, a hero name, the event and year underneath.

## Copy

- `slot="eyebrow"`, `slot="name"`, `slot="event"`, `slot="year"`.

## Rules

- This is the one place a sheet may run hero type centered.
- On paper the accent flattens to bronze ink and the glow to nothing, by alias - no paper variant exists or is needed.
- One award per plate. A list of awards is a `Timeline` or a `SpecTable`.

## Example

```jsx
<AwardPlate>
  <span slot="eyebrow">Los Angeles regional</span>
  <span slot="name">Industrial Design Award</span>
  <span slot="year">2026</span>
</AwardPlate>
```
