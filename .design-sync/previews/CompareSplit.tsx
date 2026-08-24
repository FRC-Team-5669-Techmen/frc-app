import { CompareSplit, CompareRow } from 'frc5669-design-system'

export const BeltVersusChain = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 940 }}>
    <CompareSplit>
      <span slot="label">Criterion</span>
      <span slot="option-a">Belt drive</span>
      <span slot="option-b">Chain drive</span>
      <CompareRow lead="a"><span slot="label">Maintenance</span><span slot="a">No tensioning mid-event</span><span slot="b">Check tension every match</span></CompareRow>
      <CompareRow lead="b"><span slot="label">Shock load</span><span slot="a">Skips a tooth under impact</span><span slot="b">Takes the hit</span></CompareRow>
      <CompareRow><span slot="label">Cost</span><span slot="a">Comparable</span><span slot="b">Comparable</span></CompareRow>
    </CompareSplit>
  </div>
)

export const IntakeHeight = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 940 }}>
    <CompareSplit>
      <span slot="label">Criterion</span>
      <span slot="option-a">Over the bumper</span>
      <span slot="option-b">Under the bumper</span>
      <CompareRow lead="a"><span slot="label">Cycle time</span><span slot="a">One motion from the floor</span><span slot="b">Hand off to a second stage</span></CompareRow>
      <CompareRow lead="b"><span slot="label">Build hours</span><span slot="a">Two weeks of geometry</span><span slot="b">Three days, mostly COTS</span></CompareRow>
      <CompareRow lead="a"><span slot="label">Reliability</span><span slot="a">Nothing under the frame to jam</span><span slot="b">Debris path is the failure mode</span></CompareRow>
    </CompareSplit>
  </div>
)
