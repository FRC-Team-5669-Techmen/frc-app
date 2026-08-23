# HudFrame

`brand/HudFrame` · class `frc-hud` · namespace FRC5669DesignSystem

A framed drawing: 2px hairline (framed drawings are 2px), four corner brackets in the active hairline (`--line-strong`: gold-tinted on SQUADRON, blue-tinted on FIELD, bronze-tinted on paper), an optional mono label tab top-left and a readout top-right. Renders a `<figure>`.

## Copy

- The drawing is the child (an inline SVG, an `ImageFrame`, a `FieldDiagram`).
- `label` (figure label) and `readout` (unit / scale) are short fixed chrome and may be props.

## Rules

- Frames a drawing, a chart, a field diagram. Not a card: use `PlatePanel` for text.
- No inner shadow, no glow. The brackets are the emphasis.

## Example

```jsx
<HudFrame label="Fig 3 — drive base" readout="1:1 scale">
  <svg>…</svg>
</HudFrame>
```
