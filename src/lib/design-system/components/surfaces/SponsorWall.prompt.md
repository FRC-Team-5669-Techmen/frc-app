# SponsorWall / SponsorTier

`surfaces/SponsorWall` - classes `frc-sponsors`, `frc-sponsor-tier` - namespace FRC5669DesignSystem

Sponsor marks, tiered, for the closing sheet of an external deck.

## Copy

- Tiers are child components carrying `slot="name"`; the marks are the tier's other children.

## Rules

- **Every mark is a `Cutout` with `ground="none"`.** A sponsor logo is a floating mark: it arrives with an alpha channel, and a contact shadow under a corporate logo reads as a rendering error to the one person in the room most likely to notice it. `SponsorTier` **refuses** an `ImageFrame` or a `Cutout` with any other ground.
- Size marks by tier with `width` / `height` on the Cutout; never by scaling a mark past its published minimum.
- Marks are used as supplied: no recoloring, no containing shape, no added border.

## The guard

This rule is enforced in code. A tripped guard **renders a visible rust fault marker and throws only inside the dev harness** (`/_ds`, the capture script, a test) — a guard that throws during a presentation takes the whole deck down in front of the room, and it does it on the external decks that matter most. The marker is not a soft landing: `npm run ds:audit` fails on a fault marker in a template and pre-delivery audit check 40 requires zero markers in any deck called finished, so the guard's real job is done at audit time and its run-time behaviour only decides how badly a miss hurts.

## Example

```jsx
<SponsorWall>
  <SponsorTier>
    <span slot="name">Lead sponsors</span>
    <Cutout ground="none" src={leadMark} width={260} height={110} />
  </SponsorTier>
</SponsorWall>
```
