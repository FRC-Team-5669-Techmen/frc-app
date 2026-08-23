import { ProgramLockup } from 'frc5669-design-system'

const deck = { padding: 48, display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'flex-start' } as const

export const Programs = () => (
  <div className="frc-deck frc-ground-squadron" style={deck}>
    <ProgramLockup program="frc" />
    <ProgramLockup program="ftc" />
    <ProgramLockup program="fll" />
  </div>
)

export const Vertical = () => (
  <div className="frc-deck frc-ground-squadron" style={deck}>
    <ProgramLockup program="frc" orientation="vertical" />
  </div>
)
