import { Readout } from 'frc5669-design-system'

export const Stack = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 460 }}>
    <div className="frc-readout-stack">
      <Readout><span slot="label">Battery</span><span slot="value">12.4 V</span></Readout>
      <Readout tone="ok"><span slot="label">Inspection</span><span slot="value">Passed</span></Readout>
      <Readout tone="warn"><span slot="label">Spare bumpers</span><span slot="value">1 set</span></Readout>
      <Readout tone="fault"><span slot="label">Practice bot</span><span slot="value">Down</span></Readout>
    </div>
  </div>
)

export const PitBoard = () => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, maxWidth: 460 }}>
    <div className="frc-readout-stack">
      <Readout><span slot="label">Next match</span><span slot="value">Qual 42</span></Readout>
      <Readout tone="ok"><span slot="label">Drivetrain</span><span slot="value">Green</span></Readout>
      <Readout tone="warn"><span slot="label">Shooter rollers</span><span slot="value">Swap after Q44</span></Readout>
    </div>
  </div>
)
