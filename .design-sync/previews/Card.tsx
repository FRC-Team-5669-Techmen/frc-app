import { Card, Badge } from 'frc5669-design-system'

const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 40, alignItems: 'start' }}>{children}</div>
)

export const Standard = () => (
  <Deck>
    <Card>
      <span slot="title">Standing orders</span>
      <span slot="meta">Posted Monday</span>
      <p className="frc-card-body">Shop opens at 15:30. Tag in at the door, tag out when you leave, and put the tool back where the shadow is.</p>
      <span slot="foot"><Badge tone="ok">Posted</Badge></span>
    </Card>
    <Card>
      <span slot="title">Pit checklist</span>
      <span slot="meta">Before every queue</span>
      <p className="frc-card-body">Battery swapped and logged, bumpers matched to the alliance, tether cable coiled on the cart.</p>
      <span slot="foot"><Badge tone="warn">Two items open</Badge></span>
    </Card>
  </Deck>
)

export const Flush = () => (
  <Deck>
    <Card flush>
      <span slot="title">Week four review</span>
      <p className="frc-card-body">Drivetrain is done and driving. Superstructure is on the fixture. The climber is the only subsystem still on paper.</p>
    </Card>
    <Card flush>
      <span slot="title">What we need</span>
      <p className="frc-card-body">Two mentors on Saturday, a second bandsaw blade, and a decision on the climber geometry by Wednesday.</p>
    </Card>
  </Deck>
)
