import { GanttChart, GanttBar } from 'frc5669-design-system'

/* Bar copy stays SHORT on purpose: the bar is as wide as its span, so a
   sentence in a two-week bar truncates. The row label carries the noun, the
   bar carries at most two or three words. */

export const BuildSeason = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 900 }}>
    <GanttChart cols={6} today={54}>
      <span slot="tick">Wk 1</span><span slot="tick">Wk 2</span><span slot="tick">Wk 3</span>
      <span slot="tick">Wk 4</span><span slot="tick">Wk 5</span><span slot="tick">Wk 6</span>
      <GanttBar start={0} span={34} state="done"><span slot="label">Drivetrain</span><span slot="bar">Belted</span></GanttBar>
      <GanttBar start={18} span={40}><span slot="label">Intake</span><span slot="bar">Rev two</span></GanttBar>
      <GanttBar start={44} span={30} state="risk"><span slot="label">Shooter</span><span slot="bar">Rollers</span></GanttBar>
      <GanttBar start={62} span={24} state="blocked"><span slot="label">Climber</span><span slot="bar">Open</span></GanttBar>
    </GanttChart>
  </div>
)

export const OutreachTerm = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 900 }}>
    <GanttChart cols={4} today={30}>
      <span slot="tick">Sep</span><span slot="tick">Oct</span><span slot="tick">Nov</span><span slot="tick">Dec</span>
      <GanttBar start={0} span={40} state="done"><span slot="label">FLL coaching</span><span slot="bar">Six teams</span></GanttBar>
      <GanttBar start={25} span={45}><span slot="label">Sponsor asks</span><span slot="bar">Nine out</span></GanttBar>
      <GanttBar start={70} span={28} state="risk"><span slot="label">Open house</span><span slot="bar">No room</span></GanttBar>
    </GanttChart>
  </div>
)
