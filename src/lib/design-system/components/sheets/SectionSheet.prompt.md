# SectionSheet

`sheets/SectionSheet` - class `frc-sheet-section` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

The divider between parts of a deck.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`. The part **index** is chrome and stays a prop; the part **name** is copy and is a child.

## Rules

- The chevron rail under the title is SQUADRON's rule element and is legal on every ground here, because it is this pattern's structure rather than a substitute for a divider.
- One section sheet per part. Two in a row means the parts are too small.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<SectionSheet index={2} label="Build">
  <span slot="eyebrow">Part two</span>
  <span slot="title">Build</span>
  <span slot="lede">Drivetrain, intake, and the parts we are still waiting on.</span>
</SectionSheet>
```
