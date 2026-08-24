import { Input } from 'frc5669-design-system'

const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 32, alignItems: 'start' }}>{children}</div>
)

export const Fields = () => (
  <Deck>
    <Input placeholder="First and last"><span slot="label">Name</span></Input>
    <Input mono placeholder="5669"><span slot="label">Team number</span><span slot="hint">Digits only</span></Input>
    <Input size="lg" placeholder="Match note"><span slot="label">Scouting note</span></Input>
  </Deck>
)

export const States = () => (
  <Deck>
    <Input invalid defaultValue="56-69"><span slot="label">Team number</span><span slot="hint">Digits only</span></Input>
    <Input disabled defaultValue="Locked after sign-off"><span slot="label">Sign-off</span></Input>
    <Input defaultValue="A. Rivera"><span slot="label">Claimed by</span></Input>
  </Deck>
)

export const Textarea = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 620 }}>
    <Input as="textarea" placeholder="What happened, in one or two lines"><span slot="label">Match summary</span><span slot="hint">Goes on the scouting sheet</span></Input>
  </div>
)
