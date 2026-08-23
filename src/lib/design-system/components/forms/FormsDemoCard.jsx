// @dsCard group="Forms" name="Form controls" subtitle="Input and Select on every ground"
import { GROUND_CLASSES } from '../../tokens.js'
import { cx } from '../cx.js'
import { Input } from './Input.jsx'
import { Select } from './Select.jsx'
import { Eyebrow } from '../core/Eyebrow.jsx'
import { Button } from '../core/Button.jsx'
import { SUBTEAMS } from '../data/SubteamBadge.jsx'

const grid = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 32, alignItems: 'start' }

/** FormsDemoCard - the one demo card for components/forms. Mounts the REAL components. */
export function FormsDemoCard({ ground = 'squadron', run = false, className, ...rest }) {
  return (
    <div
      className={cx('frc-deck', GROUND_CLASSES[ground] ?? GROUND_CLASSES.squadron, run && 'frc-run', 'frc-demo-card', className)}
      data-card="forms"
      data-ground={ground}
      style={{ padding: 48, display: 'grid', gap: 40 }}
      {...rest}
    >
      <Eyebrow>Input</Eyebrow>
      <div style={grid}>
        <Input placeholder="First and last"><span slot="label">Name</span></Input>
        <Input mono placeholder="5669"><span slot="label">Team number</span><span slot="hint">Digits only</span></Input>
        <Input invalid defaultValue="56-69"><span slot="label">Team number</span><span slot="hint">Digits only</span></Input>
        <Input size="lg" placeholder="Match note"><span slot="label">Scouting note</span></Input>
        <Input as="textarea" placeholder="What happened, in one or two lines"><span slot="label">Match summary</span></Input>
        <Input disabled defaultValue="Locked after sign-off"><span slot="label">Sign-off</span></Input>
      </div>

      <Eyebrow>Select</Eyebrow>
      <div style={grid}>
        <Select defaultValue="Mechanical">
          <span slot="label">Subteam</span>
          {SUBTEAMS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select>
          <span slot="label">Session</span>
          <span slot="hint">Sets the hour category</span>
          <option>Build</option><option>Outreach</option><option>Volunteer</option><option>Competition</option>
        </Select>
        <Select invalid>
          <span slot="label">Mentor on duty</span>
          <span slot="hint">Required before the shop opens</span>
          <option value="">Not selected</option><option>Mr. Garza</option><option>Mr. Kennedy</option>
        </Select>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <Button variant="primary">Save</Button>
        <Button variant="ghost">Cancel</Button>
      </div>
    </div>
  )
}
