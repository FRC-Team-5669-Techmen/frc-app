# SponsorWall / SponsorTier

`surfaces/SponsorWall` - classes `frc-sponsors`, `frc-sponsor-tier` - namespace FRC5669DesignSystem

Sponsor marks, tiered, for the closing sheet of an external deck.

## Copy

- Tiers are child components carrying `slot="name"`; the marks are the tier's other children.

## Rules

- **Every mark is a `Cutout` with `ground="none"`.** A sponsor logo is a floating mark: it arrives with an alpha channel, and a contact shadow under a corporate logo reads as a rendering error to the one person in the room most likely to notice it. `SponsorTier` **throws** on an `ImageFrame` or a `Cutout` with any other ground.
- Size marks by tier with `width` / `height` on the Cutout; never by scaling a mark past its published minimum.
- Marks are used as supplied: no recoloring, no containing shape, no added border.

## Example

```jsx
<SponsorWall>
  <SponsorTier>
    <span slot="name">Lead sponsors</span>
    <Cutout ground="none" src={leadMark} width={260} height={110} />
  </SponsorTier>
</SponsorWall>
```
