import { SealMark, Eyebrow } from 'frc5669-design-system'

export const Default = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 48, display: 'grid', gap: 20, justifyItems: 'start' }}>
    <Eyebrow tone="plain">Team seal</Eyebrow>
    <SealMark />
  </div>
)
