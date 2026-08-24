import { SpecTable, SpecRow } from 'frc5669-design-system'

export const Drivetrain = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 760 }}>
    <SpecTable>
      <span slot="caption">Drivetrain, as built</span>
      <SpecRow><span slot="label">Free speed</span><span slot="value">16.4 ft/s</span></SpecRow>
      <SpecRow><span slot="label">Gear ratio</span><span slot="value">6.75:1</span></SpecRow>
      <SpecRow emphasis><span slot="label">Wheel</span><span slot="value">4 in colson</span></SpecRow>
      <SpecRow>
        <span slot="label">Motors</span>
        <span slot="value">4x Kraken</span>
        <span slot="note">Two per side, belted, no coast on the shooter side.</span>
      </SpecRow>
    </SpecTable>
  </div>
)

export const Envelope = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 760 }}>
    <SpecTable>
      <span slot="caption">Inspection envelope</span>
      <SpecRow><span slot="label">Weight</span><span slot="value">118 lb with bumpers</span></SpecRow>
      <SpecRow><span slot="label">Frame perimeter</span><span slot="value">112 in</span></SpecRow>
      <SpecRow emphasis><span slot="label">Starting height</span><span slot="value">47 in</span></SpecRow>
    </SpecTable>
  </div>
)
