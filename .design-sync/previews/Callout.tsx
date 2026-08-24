import { Callout } from 'frc5669-design-system'

const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gap: 20, maxWidth: 760 }}>{children}</div>
)

export const Status = () => (
  <Deck>
    <Callout tone="ok"><span slot="title">Cleared</span><p className="frc-callout-text">Drivetrain passed inspection with the practice bumpers on.</p></Callout>
    <Callout tone="warn"><span slot="title">Deadline</span><p className="frc-callout-text">Chairmans submission closes Thursday at 15:00 Pacific.</p></Callout>
    <Callout tone="fault"><span slot="title">Blocked</span><p className="frc-callout-text">Climber geometry is waiting on a field measurement.</p></Callout>
  </Deck>
)

export const Emphasis = () => (
  <Deck>
    <Callout tone="accent"><span slot="title">Decision</span><p className="frc-callout-text">Swerve, four modules. Signed off at the week two design review.</p></Callout>
    <Callout tone="quiet"><span slot="title">For reference</span><p className="frc-callout-text">Last season the same intake ran 0.9 s per cycle on the practice field.</p></Callout>
  </Deck>
)
