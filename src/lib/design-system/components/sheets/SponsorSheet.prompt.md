# SponsorSheet

`sheets/SponsorSheet` - class `frc-sheet-sponsor` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

Who pays for this, tiered.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="thanks"`, `slot="attribution"`; the child is the `SponsorWall`.

## Rules

- Every mark is a `Cutout` with `ground="none"`. `SponsorTier` guards it, so this sheet does not have to check.
- `slot="thanks"` is the line that says what the money bought. Sponsors read "your money paid for the practice field" better than they read a logo grid.
- Marks are used as supplied: no recoloring, no containing shape, no added border.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## The guard

This rule is enforced in code. A tripped guard **renders a visible rust fault marker and throws only inside the dev harness** (`/_ds`, the capture script, a test) — a guard that throws during a presentation takes the whole deck down in front of the room, and it does it on the external decks that matter most. The marker is not a soft landing: `npm run ds:audit` fails on a fault marker in a template and pre-delivery audit check 40 requires zero markers in any deck called finished, so the guard's real job is done at audit time and its run-time behaviour only decides how badly a miss hurts.

## Example

```jsx
<SponsorSheet label="Sponsors">
  <span slot="title">Who pays for this</span>
  <span slot="thanks">Sponsorship bought the practice field and the bus to Ventura.</span>
  <SponsorWall>...</SponsorWall>
</SponsorSheet>
```
