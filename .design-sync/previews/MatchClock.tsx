import { MatchClock } from 'frc5669-design-system'

/* Two per row, never four: the numerals are --fs-hero (160px), so a quarter of
   a card width makes them collide. */
const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 40, alignItems: 'start' }}>{children}</div>
)

export const Phases = () => (
  <Deck>
    <MatchClock phase="auto"><span slot="note">Autonomous, full duration</span></MatchClock>
    <MatchClock phase="teleop"><span slot="note">Teleop, at rest</span></MatchClock>
  </Deck>
)

export const Endgame = () => (
  <Deck>
    <MatchClock phase="teleop" remaining={22}><span slot="note">Inside the warning window</span></MatchClock>
    <MatchClock phase="teleop" remaining={0}><span slot="note">Zero: rust, never alliance red</span></MatchClock>
  </Deck>
)
