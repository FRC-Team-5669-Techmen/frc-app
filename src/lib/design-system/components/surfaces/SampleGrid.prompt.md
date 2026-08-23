# SampleGrid / Sample

`surfaces/SampleGrid` - classes `frc-samples`, `frc-sample` - namespace FRC5669DesignSystem

A set of material, finish, print or livery samples. `cols` sets the grid.

## Copy

- Samples are child components; inside: `slot="name"`, `slot="note"`. Any other child is the media.

## Rules

- The media well reads from `--surface-viewport`, the same backplate token `ImageFrame` uses, so a sample sheet retints with the ground.
- Samples are opaque media. A part on alpha is a `Cutout`.

## Example

```jsx
<SampleGrid cols={4}>
  <Sample src={anodized}><span slot="name">Anodized gold</span><span slot="note">Two week lead time</span></Sample>
</SampleGrid>
```
