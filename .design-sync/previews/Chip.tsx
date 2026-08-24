import { Chip } from 'frc5669-design-system'

const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
)

export const States = () => (
  <Deck>
    <Chip>Bumpers</Chip>
    <Chip selected>Drivetrain</Chip>
    <Chip>Intake</Chip>
    <Chip>Climber</Chip>
  </Deck>
)

export const WithCount = () => (
  <Deck>
    <Chip count={4}>Open jobs</Chip>
    <Chip count={12} selected>Certified</Chip>
    <Chip count={0}>Blocked</Chip>
  </Deck>
)
