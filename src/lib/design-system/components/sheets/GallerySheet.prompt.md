# GallerySheet

`sheets/GallerySheet` - class `frc-sheet-gallery` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

A set: build photos, finishes, liveries, outreach events.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, then `Sample` children.

## Rules

- Items are `Sample` children, so every tile gets the same media well and caption treatment and the set reads as a set.
- Follow the standing photography direction - dark or neutral background, single light source upper left, straight on, consistent framing - or the grid will show the difference.
- Four across at 4:3. Eight tiles is two sheets.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<GallerySheet cols={4} label="Week four">
  <span slot="title">Where the robot is</span>
  <Sample src={photo}><span slot="name">Drivetrain</span><span slot="note">Welded, belted, wired</span></Sample>
</GallerySheet>
```
