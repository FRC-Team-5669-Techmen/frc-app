// @dsCard group="Core" name="Core components" subtitle="Button, Eyebrow, Divider, ChevronRail, TeamWordmark on any ground"
import { GROUND_CLASSES } from '../../tokens.js'
import { cx } from '../cx.js'
import { Button } from './Button.jsx'
import { Eyebrow } from './Eyebrow.jsx'
import { Divider } from './Divider.jsx'
import { ChevronRail } from './ChevronRail.jsx'
import { TeamWordmark } from './TeamWordmark.jsx'
import { IconArrowRight, IconChevronRight, IconPlay, IconWrench } from './icons.jsx'

const section = { display: 'grid', gap: 20 }
const row = { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }

/**
 * CoreDemoCard — the one demo card for components/core. Mounts the REAL
 * components; it never re-implements their markup. `ground` picks the scope,
 * `run` lets gated motion play (the LIVE dot pulse).
 */
export function CoreDemoCard({ ground = 'squadron', run = false, className, ...rest }) {
  return (
    <div
      className={cx('frc-deck', GROUND_CLASSES[ground] ?? GROUND_CLASSES.squadron, run && 'frc-run', 'frc-demo-card', className)}
      data-card="core"
      data-ground={ground}
      style={{ padding: 48, display: 'grid', gap: 48 }}
      {...rest}
    >
      <section style={section}>
        <Eyebrow>Button</Eyebrow>
        <div style={row}>
          <Button variant="primary" icon={<IconPlay />}>Run match</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" size="lg" iconEnd={<IconArrowRight />}>Large primary</Button>
          <Button size="lg" icon={<IconWrench />}>Large secondary</Button>
          <Button disabled>Disabled</Button>
          <Button href="#core" iconEnd={<IconChevronRight />}>Link button</Button>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>Eyebrow</Eyebrow>
        <div style={{ ...row, gap: 40 }}>
          <Eyebrow>Standing orders</Eyebrow>
          <Eyebrow tone="accent">Mission brief</Eyebrow>
          <Eyebrow tone="live">Live</Eyebrow>
          <Eyebrow tone="live">Rec</Eyebrow>
          <Eyebrow tone="plain">Muster 07:30</Eyebrow>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>Divider</Eyebrow>
        <p className="frc-body-sm frc-dim">auto: chevrons on SQUADRON, a hairline on FIELD and paper. Then line, chevron, strong.</p>
        <Divider />
        <Divider variant="line" />
        <Divider variant="chevron" />
        <Divider variant="line" strong />
      </section>

      <section style={section}>
        <Eyebrow>ChevronRail</Eyebrow>
        <ChevronRail />
        <ChevronRail tone="dim" height={16} />
        <ChevronRail tone="structure" height={24} />
      </section>

      <section style={section}>
        <Eyebrow>TeamWordmark</Eyebrow>
        <div style={{ ...row, gap: 48 }}>
          <TeamWordmark />
          <TeamWordmark number={false} />
          <TeamWordmark size={72} />
        </div>
      </section>
    </div>
  )
}
