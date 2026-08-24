import { Badge } from 'frc5669-design-system'

const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
)

export const Tones = () => (
  <Deck>
    <Badge>Queued</Badge>
    <Badge tone="ok">Certified</Badge>
    <Badge tone="warn">Awaiting sign-off</Badge>
    <Badge tone="fault">Failed inspection</Badge>
    <Badge tone="program">Robotics Competition</Badge>
  </Deck>
)

export const Solid = () => (
  <Deck>
    <Badge tone="accent" solid>Live</Badge>
    <Badge tone="ok" solid>Passed</Badge>
    <Badge tone="fault" solid>Blocked</Badge>
  </Deck>
)

export const WithDot = () => (
  <Deck>
    <Badge dot>On the bench</Badge>
    <Badge dot tone="ok">Inspected</Badge>
    <Badge dot tone="warn">Waiting on parts</Badge>
  </Deck>
)
