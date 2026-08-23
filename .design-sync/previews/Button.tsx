import { Button } from 'frc5669-design-system'
import { IconPlay, IconArrowRight, IconWrench, IconChevronRight } from 'frc5669-design-system'

const deck = { padding: 40, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' } as const
const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={deck}>{children}</div>
)

export const Variants = () => (
  <Deck>
    <Button variant="primary" icon={<IconPlay />}>Run match</Button>
    <Button>Secondary</Button>
    <Button variant="ghost">Ghost</Button>
  </Deck>
)

export const Sizes = () => (
  <Deck>
    <Button variant="primary">Medium</Button>
    <Button variant="primary" size="lg">Large</Button>
    <Button size="lg" icon={<IconWrench />}>Large secondary</Button>
  </Deck>
)

export const WithIcons = () => (
  <Deck>
    <Button variant="primary" icon={<IconPlay />}>Start</Button>
    <Button iconEnd={<IconArrowRight />}>Next part</Button>
    <Button href="#roster" variant="ghost" iconEnd={<IconChevronRight />}>Roster</Button>
  </Deck>
)

export const Disabled = () => (
  <Deck>
    <Button variant="primary" disabled>Unavailable</Button>
    <Button disabled>Disabled</Button>
  </Deck>
)
