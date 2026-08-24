import { AwardPlate } from 'frc5669-design-system'

export const Regional = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 700 }}>
    <AwardPlate>
      <span slot="eyebrow">Los Angeles regional</span>
      <span slot="name">Industrial Design Award</span>
      <span slot="event">Presented by General Motors</span>
      <span slot="year">2026</span>
    </AwardPlate>
  </div>
)

export const OnPaper = () => (
  <div className="frc-deck frc-ground-paper" style={{ padding: 40, maxWidth: 700 }}>
    <AwardPlate>
      <span slot="eyebrow">Ventura regional</span>
      <span slot="name">Team Spirit Award</span>
      <span slot="event">Sponsored by Chrysler</span>
      <span slot="year">2026</span>
    </AwardPlate>
  </div>
)
