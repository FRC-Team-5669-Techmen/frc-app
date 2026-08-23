# SponsorSheet

`sheets/SponsorSheet` - class `frc-sheet-sponsor` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

Who pays for this, tiered.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="thanks"`, `slot="attribution"`; the child is the `SponsorWall`.

## Rules

- Every mark is a `Cutout` with `ground="none"`. `SponsorTier` throws on anything else, so this sheet does not have to check.
- `slot="thanks"` is the line that says what the money bought. Sponsors read "your money paid for the practice field" better than they read a logo grid.
- Marks are used as supplied: no recoloring, no containing shape, no added border.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<SponsorSheet label="Sponsors">
  <span slot="title">Who pays for this</span>
  <span slot="thanks">Sponsorship bought the practice field and the bus to Ventura.</span>
  <SponsorWall>...</SponsorWall>
</SponsorSheet>
```
