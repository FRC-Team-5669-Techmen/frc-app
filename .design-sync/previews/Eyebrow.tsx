import { Eyebrow } from 'frc5669-design-system'

const deck = { padding: 40, display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center' } as const
const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={deck}>{children}</div>
)

export const Tones = () => (
  <Deck>
    <Eyebrow>Standing orders</Eyebrow>
    <Eyebrow tone="accent">Mission brief</Eyebrow>
    <Eyebrow tone="live">Live</Eyebrow>
    <Eyebrow tone="plain">Muster 07:30</Eyebrow>
  </Deck>
)

export const InContext = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gap: 8 }}>
    <Eyebrow tone="accent">Section 04</Eyebrow>
    <h2 className="frc-h2" style={{ margin: 0 }}>Drive base assembly</h2>
  </div>
)
