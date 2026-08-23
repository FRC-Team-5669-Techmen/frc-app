import { Logotype, Eyebrow } from 'frc5669-design-system'

export const Variants = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 48, display: 'grid', gap: 24, justifyItems: 'start' }}>
    <Eyebrow tone="plain">Gold</Eyebrow>
    <Logotype variant="gold" height={48} />
    <Eyebrow tone="plain">Auto</Eyebrow>
    <Logotype variant="auto" height={48} />
  </div>
)
