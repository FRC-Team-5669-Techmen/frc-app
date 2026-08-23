import { Divider, Eyebrow } from 'frc5669-design-system'

const deck = { padding: 40, display: 'grid', gap: 20 } as const

export const OnSquadron = () => (
  <div className="frc-deck frc-ground-squadron" style={deck}>
    <Eyebrow tone="accent">Squadron — chevrons</Eyebrow>
    <Divider />
    <Divider variant="line" />
    <Divider variant="chevron" />
    <Divider variant="line" strong />
  </div>
)

export const OnField = () => (
  <div className="frc-deck frc-ground-field" style={deck}>
    <Eyebrow tone="accent">Field — hairline</Eyebrow>
    <Divider />
    <Divider variant="line" strong />
  </div>
)
