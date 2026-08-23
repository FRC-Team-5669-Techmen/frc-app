# PlatePanel

`brand/PlatePanel` · classes `frc-plate-panel frc-panel` · namespace FRC5669DesignSystem

The panel whose depth is chosen by the ground, by construction: **SQUADRON plates rise** above the black (top highlight, bottom shade, short drop, optional rivet seam — never a soft grey drop shadow alone), **FIELD panels recess** (inset well, as if looking into an instrument), paper is a flat hairline. 4px radius.

## Copy

Children. Put an `Eyebrow` and body copy inside; the panel owns no text.

## Props (no copy)

- `treatment`: `auto` (default) | `plate` (force rise) | `well` (force recess).
- `rivets`: seam along the top edge.
- `pad`: `normal` | `tight` | `loose`. `as` for the element (`section` default).

## Rules

- Nesting: a `well` inside a `plate` is the instrument-in-a-plate composition; a plate inside a well is not.
- Do not add a border color or a shadow by hand; the aliases carry both.

## Example

```jsx
<PlatePanel rivets>
  <Eyebrow tone="accent">Quals</Eyebrow>
  <p className="frc-body">Three certified on the mill. Two pending.</p>
</PlatePanel>
```
