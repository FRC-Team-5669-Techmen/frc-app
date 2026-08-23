# ChevronRail

`core/ChevronRail` · class `frc-chevron-rail` · namespace FRC5669DesignSystem

A full-width row of right-pointing chevrons drawn as an SVG pattern on `currentColor`, so it takes any ground alias. The SQUADRON rule element; also the band beneath a section title or along a plate edge.

## Props (no copy)

- `tone`: `accent` (default, gold / bronze on paper) | `dim` (ash) | `structure` (space gray).
- `height`: px, structural. 12 default; 16–24 for a band.

## Rules

- Decorative only (`aria-hidden`). Never carries text.
- Do not use on FIELD as a divider substitute; FIELD uses hairlines. A rail on FIELD is a deliberate SQUADRON quotation.

## Example

```jsx
<ChevronRail />
<ChevronRail tone="dim" height={16} />
```
