import { StencilTitle } from 'frc5669-design-system'

const deck = { padding: 48, display: 'grid', gap: 28 } as const

export const Sizes = () => (
  <div className="frc-deck frc-ground-squadron" style={deck}>
    <StencilTitle as="h3" size="h1">Standing orders</StencilTitle>
    <StencilTitle as="h2" size="hero">Muster</StencilTitle>
    <StencilTitle as="h1" size="display" caps>Kickoff</StencilTitle>
  </div>
)

export const Plain = () => (
  <div className="frc-deck frc-ground-squadron" style={deck}>
    <StencilTitle as="h2" glow={false}>No glow</StencilTitle>
  </div>
)
