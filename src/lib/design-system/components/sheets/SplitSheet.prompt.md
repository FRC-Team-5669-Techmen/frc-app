# SplitSheet

`sheets/SplitSheet` - class `frc-sheet-split` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

Copy on one side, a visual aid on the other. The workhorse of the density floor.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="media"`. Every other child is copy.

## Rules

- The aid is an `ImageFrame`, a `Cutout`, a `CalloutDrawing`, a chart or a `SpecTable`. Two thirds of sheets carry one; this is the pattern most of them use.
- `media="right"` moves the aid, `weight="media" | "copy"` shifts the ratio.
- At 4:3 there is less horizontal room than a widescreen deck. The pattern will not shrink type to rescue a paragraph - cut the paragraph.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<SplitSheet media="right" label="Drivetrain">
  <span slot="title">Belted, not chained</span>
  <ImageFrame slot="media" kind="render" ratio="4 / 3" src={render} />
  <p className="frc-body">Belts hold tension through an event without a mid-match check.</p>
</SplitSheet>
```
