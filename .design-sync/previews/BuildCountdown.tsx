import { BuildCountdown } from 'frc5669-design-system'

const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 40 }}>{children}</div>
)

export const Deadlines = () => (
  <Deck>
    <BuildCountdown value={31}><span slot="label">To bag and tag</span></BuildCountdown>
    <BuildCountdown value={9}><span slot="label">To the Ventura regional</span></BuildCountdown>
    <BuildCountdown value={0}><span slot="label">Chairmans essay due</span></BuildCountdown>
  </Deck>
)

export const Units = () => (
  <Deck>
    <BuildCountdown value={6} unit="weeks"><span slot="label">Build season remaining</span></BuildCountdown>
    <BuildCountdown value={48} unit="hrs" warnAt={72}><span slot="label">To the design review</span></BuildCountdown>
    <BuildCountdown value={3} unit="days" warnAt={5}><span slot="label">To the sponsor deck</span></BuildCountdown>
  </Deck>
)
