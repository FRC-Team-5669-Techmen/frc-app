import { MarkGlyph } from 'frc5669-design-system'

const deck = { padding: 40, display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center' } as const

export const Variants = () => (
  <div className="frc-deck frc-ground-squadron" style={deck}>
    <MarkGlyph variant="gold" size={96} />
    <MarkGlyph variant="white" size={96} />
    <MarkGlyph variant="auto" size={96} />
  </div>
)

export const OnPaper = () => (
  <div className="frc-deck frc-ground-paper" style={deck}>
    <MarkGlyph variant="black" size={96} />
    <MarkGlyph variant="auto" size={96} />
  </div>
)
