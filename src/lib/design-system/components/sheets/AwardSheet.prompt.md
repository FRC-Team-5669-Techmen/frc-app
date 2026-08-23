# AwardSheet

`sheets/AwardSheet` - class `frc-sheet-award` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

What the team won and what it was for.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="plate"` (an `AwardPlate`); every other child is the side column.

## Rules

- `banner`: an award sheet is a statement, not a data sheet.
- The award name is the one place a sheet may run centered hero type. On paper the accent flattens to bronze ink and the glow to nothing, by alias.
- The side column is what the award MEANS - a judges' quote, a `ResultBanner`, a readout stack. A plate on its own is a trophy photo.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<AwardSheet label="Award">
  <span slot="title">What we brought home</span>
  <AwardPlate slot="plate"><span slot="name">Industrial Design Award</span><span slot="year">2026</span></AwardPlate>
  <ResultBanner tone="win"><span slot="tag">Win</span><span slot="title">Quarterfinal 2</span></ResultBanner>
</AwardSheet>
```
