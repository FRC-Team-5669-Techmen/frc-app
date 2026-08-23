import { TeamWordmark } from 'frc5669-design-system'

const deck = { padding: 40, display: 'flex', gap: 48, flexWrap: 'wrap', alignItems: 'center' } as const
const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={deck}>{children}</div>
)

export const Default = () => (
  <Deck>
    <TeamWordmark />
  </Deck>
)

export const Variations = () => (
  <Deck>
    <TeamWordmark />
    <TeamWordmark number={false} />
    <TeamWordmark size={72} />
  </Deck>
)
