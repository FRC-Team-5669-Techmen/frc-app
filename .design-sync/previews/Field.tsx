import { Field } from 'frc5669-design-system'

const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gap: 24, maxWidth: 560 }}>{children}</div>
)

export const Default = () => (
  <Deck>
    <Field><span slot="label">Weight</span><span slot="value">118 lb with bumpers</span></Field>
    <Field><span slot="label">Drive</span><span slot="value">Swerve, four modules</span></Field>
  </Deck>
)

export const Mono = () => (
  <Deck>
    <Field mono><span slot="label">Frame perimeter</span><span slot="value">112 in</span></Field>
    <Field mono><span slot="label">Free speed</span><span slot="value">16.4 ft/s</span></Field>
  </Deck>
)

export const Inline = () => (
  <Deck>
    <Field inline><span slot="label">Team</span><span slot="value">5669 Techmen</span></Field>
    <Field inline mono><span slot="label">Match</span><span slot="value">Qual 42</span></Field>
  </Deck>
)
