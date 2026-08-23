# ImageFrame

`surfaces/ImageFrame` - class `frc-frame` - namespace FRC5669DesignSystem

Treatment one of three: **opaque content, edge to edge**. Photographs, screenshots, CAD renders, drawings.

`kind` says what the image IS and picks the shape: `screenshot` / `photo` are a plain rect, `render` / `equipment` / `drawing` get corner brackets, `portrait` is round. `shape` overrides.

## Copy

- `slot="caption"`. Any other child is the media (an `<img>`, an `<image-slot>`).

## Rules

- **A transparent PNG never goes in here.** The frame fills the alpha region with its backplate and grades it as a rectangle, which is exactly the discolored box around the subject. Use `Cutout`.
- The backplate reads from `--surface-viewport`, so a ground scope retints it. **Never hardcode it in a component**: that is the ground-alias freeze bug one level down, and it is how a light sheet keeps a dark box.
- `bleed` feathers one edge into the ground and **drops the rim ring and the corner brackets automatically**.
- **Never bleed a screenshot.** A feathered interface capture reads as a rendering fault, and the hard edge is what tells the room it is looking at a screen. `bleed` with `kind="screenshot"` throws.
- QR codes are the one exemption in the whole system: bare on a light plate, no frame, no grade.

## Example

```jsx
<ImageFrame kind="render" ratio="4 / 3" src={render}><span slot="caption">Drivetrain, rev 3</span></ImageFrame>
<ImageFrame kind="photo" bleed="right" src={pit} />
```
