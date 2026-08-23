import { DeckFooter } from 'frc5669-design-system'

const PARTS = ['Brief', 'Roster', 'Quals', 'Mission', 'Muster']
const frame = { position: 'relative', height: 140, overflow: 'hidden', padding: 0 } as const

export const Internal = () => (
  <div className="frc-deck frc-ground-squadron frc-audience-internal" style={frame}>
    <DeckFooter deckName="Kickoff brief" parts={PARTS} partIndex={1} sheet={4} total={18} />
  </div>
)

export const External = () => (
  <div className="frc-deck frc-ground-squadron frc-audience-external" style={frame}>
    <DeckFooter deckName="Sponsor review" parts={PARTS} partIndex={3} sheet={12} total={18} audience="external" />
  </div>
)
