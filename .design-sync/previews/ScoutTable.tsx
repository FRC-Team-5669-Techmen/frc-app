import { ScoutTable, ScoutRow } from 'frc5669-design-system'

export const Qual42 = () => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, maxWidth: 940 }}>
    <ScoutTable defaultActive="r1">
      <span slot="caption">Qual 42</span>
      <span slot="col">Team</span><span slot="col">Auto</span><span slot="col">Cycles</span>
      <span slot="col">Climb</span><span slot="col">Notes</span>
      <ScoutRow id="r1" alliance="red">
        <span slot="team">5669</span><span slot="cell">12</span><span slot="cell">7</span>
        <span slot="cell">Deep</span><span slot="cell">Clean cycles, no fouls</span>
      </ScoutRow>
      <ScoutRow id="r2" alliance="red">
        <span slot="team">1678</span><span slot="cell">15</span><span slot="cell">9</span>
        <span slot="cell">Deep</span><span slot="cell">Fast from the source</span>
      </ScoutRow>
      <ScoutRow id="b1" alliance="blue">
        <span slot="team">254</span><span slot="cell">14</span><span slot="cell">8</span>
        <span slot="cell">Shallow</span><span slot="cell">Defended late</span>
      </ScoutRow>
      <ScoutRow id="b2" alliance="blue">
        <span slot="team">973</span><span slot="cell">9</span><span slot="cell">6</span>
        <span slot="cell">None</span><span slot="cell">Battery swap between matches</span>
      </ScoutRow>
    </ScoutTable>
  </div>
)
