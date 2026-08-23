import { ChevronRail, Eyebrow } from 'frc5669-design-system'

const deck = { padding: 40, display: 'grid', gap: 24 } as const

export const Tones = () => (
  <div className="frc-deck frc-ground-squadron" style={deck}>
    <Eyebrow tone="accent">Default</Eyebrow>
    <ChevronRail />
    <Eyebrow tone="plain">Dim</Eyebrow>
    <ChevronRail tone="dim" height={16} />
    <Eyebrow tone="plain">Structure</Eyebrow>
    <ChevronRail tone="structure" height={24} />
  </div>
)
