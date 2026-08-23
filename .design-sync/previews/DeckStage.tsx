import { DeckStage, Eyebrow, StencilTitle } from 'frc5669-design-system'

const frame = { position: 'relative', width: 480, height: 360, padding: 0, overflow: 'hidden', border: '1px solid rgba(148,152,156,0.3)' } as const
const sheet = { padding: 24 } as const

// DeckStage renders nothing itself — these two variants prove it by effect: the
// canvas (the deck root's own background) and the stage fill follow the ACTIVE
// sheet's ground, not the deck root's. Squadron and Paper are the pair that
// shows it, since --edge and --bg0 differ visibly between them.
export const Squadron = () => (
  <div className="frc-deck frc-ground-squadron frc-audience-internal" style={frame}>
    <DeckStage nav={false} fit={false} thumbs={false} />
    <div className="frc-stage" data-aspect="4:3" style={{ width: 480, height: 360, transform: 'none' }}>
      <section className="frc-sheet frc-ground-squadron" data-deck-active style={sheet}>
        <Eyebrow tone="accent">Sheet 1</Eyebrow>
        <StencilTitle as="h3" size="h1">Squadron</StencilTitle>
      </section>
    </div>
  </div>
)

export const Paper = () => (
  <div className="frc-deck frc-ground-squadron frc-audience-internal" style={frame}>
    <DeckStage nav={false} fit={false} thumbs={false} />
    <div className="frc-stage" data-aspect="4:3" style={{ width: 480, height: 360, transform: 'none' }}>
      <section className="frc-sheet frc-ground-paper" data-deck-active style={sheet}>
        <Eyebrow tone="accent">Sheet 1</Eyebrow>
        <StencilTitle as="h3" size="h1">Paper</StencilTitle>
      </section>
    </div>
  </div>
)
