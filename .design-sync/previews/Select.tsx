import { Select } from 'frc5669-design-system'

const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 32, alignItems: 'start' }}>{children}</div>
)

export const Selects = () => (
  <Deck>
    <Select defaultValue="Mechanical">
      <span slot="label">Subteam</span>
      <option>Mechanical</option>
      <option>Electrical</option>
      <option>Programming</option>
      <option>CAD</option>
      <option>Strategy and Scouting</option>
    </Select>
    <Select>
      <span slot="label">Session</span>
      <span slot="hint">Sets the hour category</span>
      <option>Build</option><option>Outreach</option><option>Volunteer</option><option>Competition</option>
    </Select>
    <Select defaultValue="Deep">
      <span slot="label">Climb</span>
      <option>None</option><option>Shallow</option><option>Deep</option>
    </Select>
  </Deck>
)

export const Invalid = () => (
  <Deck>
    <Select invalid>
      <span slot="label">Mentor on duty</span>
      <span slot="hint">Required before the shop opens</span>
      <option value="">Not selected</option><option>Mr. Garza</option><option>Mr. Kennedy</option>
    </Select>
    <Select defaultValue="Mr. Garza">
      <span slot="label">Mentor on duty</span>
      <span slot="hint">Required before the shop opens</span>
      <option value="">Not selected</option><option>Mr. Garza</option><option>Mr. Kennedy</option>
    </Select>
  </Deck>
)
