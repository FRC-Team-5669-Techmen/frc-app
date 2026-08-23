# CalloutDrawing / CalloutPin

`surfaces/CalloutDrawing` - classes `frc-drawing`, `frc-pin` - namespace FRC5669DesignSystem

Numbered pins over a drawing or photograph. Pin numbers come from order.

## Copy

- The media element, then `CalloutPin` children carrying `slot="label"`, plus `slot="caption"` on the figure.

## Locked (props, not canvas copy)

- `x` and `y` are percentages of the media box: geometry, not copy.

## Rules

- **Every label is rendered at rest**, at reduced opacity. Clicking a pin raises the label it already drew; it never creates one. That keeps print, PDF and reduced-motion complete and means a presenter never has to know an unmarked region is clickable.

## Example

```jsx
<CalloutDrawing>
  <ImageFrame kind="drawing" src={section} />
  <CalloutPin x={26} y={30}><span slot="label">Input pinion</span></CalloutPin>
</CalloutDrawing>
```
