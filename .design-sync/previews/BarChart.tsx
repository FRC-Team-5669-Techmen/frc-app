import { BarChart, Bar } from 'frc5669-design-system'

export const HoursBySubteam = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 860 }}>
    <BarChart max={120} target={90}>
      <span slot="caption">Hours by subteam, target 90</span>
      <Bar value={104}><span slot="label">Mechanical</span><span slot="value">104 h</span></Bar>
      <Bar value={88} tone="ok"><span slot="label">Programming</span><span slot="value">88 h</span></Bar>
      <Bar value={52} tone="warn"><span slot="label">Electrical</span><span slot="value">52 h</span></Bar>
      <Bar value={21} tone="fault"><span slot="label">Media</span><span slot="value">21 h</span></Bar>
    </BarChart>
  </div>
)

export const NoTarget = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 860 }}>
    <BarChart max={40}>
      <span slot="caption">Cycles per match, last five quals</span>
      <Bar value={31}><span slot="label">Qual 38</span><span slot="value">31</span></Bar>
      <Bar value={27}><span slot="label">Qual 40</span><span slot="value">27</span></Bar>
      <Bar value={34}><span slot="label">Qual 42</span><span slot="value">34</span></Bar>
      <Bar value={18} tone="quiet"><span slot="label">Qual 44 (brownout)</span><span slot="value">18</span></Bar>
    </BarChart>
  </div>
)
