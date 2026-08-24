import { FocusTable, FocusRow } from 'frc5669-design-system'

export const Standing = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 760 }}>
    <FocusTable defaultActive="a">
      <span slot="caption">Qualification standing</span>
      <FocusRow id="a"><span slot="rank">01</span><span slot="label">5669 Techmen</span><span slot="value">2.41</span></FocusRow>
      <FocusRow id="b"><span slot="rank">02</span><span slot="label">1671 Buchanan</span><span slot="value">2.28</span></FocusRow>
      <FocusRow id="c"><span slot="rank">03</span><span slot="label">973 Greybots</span><span slot="value">2.19</span></FocusRow>
      <FocusRow id="d"><span slot="rank">04</span><span slot="label">4322 Clockwork</span><span slot="value">1.98</span></FocusRow>
    </FocusTable>
  </div>
)

export const Blockers = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 760 }}>
    <FocusTable>
      <span slot="caption">Open blockers, worst first</span>
      <FocusRow id="x"><span slot="rank">01</span><span slot="label">Shooter rollers on order</span><span slot="value">6 d</span></FocusRow>
      <FocusRow id="y"><span slot="rank">02</span><span slot="label">Climber geometry unresolved</span><span slot="value">4 d</span></FocusRow>
      <FocusRow id="z"><span slot="rank">03</span><span slot="label">Field elements unbuilt</span><span slot="value">2 d</span></FocusRow>
    </FocusTable>
  </div>
)
