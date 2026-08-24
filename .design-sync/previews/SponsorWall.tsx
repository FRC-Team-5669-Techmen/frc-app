import { SponsorWall, SponsorTier, Cutout } from 'frc5669-design-system'

/* Every sponsor mark is a Cutout at ground="none" — SponsorTier throws on
   anything else, because a sponsor mark may not be given a plate or a shadow
   the sponsor did not approve. The marks themselves are not in the repo, so the
   tiers render the marked empty slot at their tier sizes (no file= hint: the
   filename marker is taller than a tier slot). Tier size IS the tier:
   lead marks are drawn larger than supporting ones. */

export const TwoTiers = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 1000 }}>
    <SponsorWall>
      <SponsorTier>
        <span slot="name">Lead sponsors</span>
        <Cutout ground="none" width={240} height={110} />
        <Cutout ground="none" width={240} height={110} />
      </SponsorTier>
      <SponsorTier>
        <span slot="name">Supporting</span>
        <Cutout ground="none" width={170} height={90} />
        <Cutout ground="none" width={170} height={90} />
      </SponsorTier>
    </SponsorWall>
  </div>
)

export const OnPaper = () => (
  <div className="frc-deck frc-ground-paper" style={{ padding: 40, maxWidth: 1000 }}>
    <SponsorWall>
      <SponsorTier>
        <span slot="name">Lead sponsors</span>
        <Cutout ground="none" width={240} height={110} />
        <Cutout ground="none" width={240} height={110} />
      </SponsorTier>
    </SponsorWall>
  </div>
)
