import { StatBlock } from 'frc5669-design-system'

const Deck = ({ children, cols = 3 }: any) => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 40, alignItems: 'start' }}>{children}</div>
)

export const Hero = () => (
  <Deck cols={1}>
    <StatBlock tone="hero">
      <span slot="value">412</span>
      <span slot="unit">hrs</span>
      <span slot="label">Shop hours this season</span>
      <span slot="note">Across 38 members</span>
    </StatBlock>
  </Deck>
)

export const Tones = () => (
  <Deck>
    <StatBlock><span slot="value">38</span><span slot="label">Members on the roster</span></StatBlock>
    <StatBlock tone="ok"><span slot="value">27</span><span slot="label">Certified on the mill</span></StatBlock>
    <StatBlock tone="warn"><span slot="value">6</span><span slot="label">Jobs awaiting sign-off</span></StatBlock>
  </Deck>
)

export const Small = () => (
  <Deck>
    <StatBlock size="sm"><span slot="value">14</span><span slot="unit">days</span><span slot="label">To bag and tag</span></StatBlock>
    <StatBlock size="sm" tone="fault"><span slot="value">2</span><span slot="label">Blocked subsystems</span></StatBlock>
    <StatBlock size="sm" tone="ok"><span slot="value">96</span><span slot="unit">%</span><span slot="label">Attendance, week four</span></StatBlock>
  </Deck>
)
