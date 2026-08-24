import { Timeline, TimelineItem } from 'frc5669-design-system'

export const BuildWeeks = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 640 }}>
    <Timeline>
      <TimelineItem state="done">
        <span slot="when">Week two</span><span slot="title">Prototype gate</span>
        <span slot="body">Three intakes on the bench, one carried forward.</span>
      </TimelineItem>
      <TimelineItem state="current">
        <span slot="when">Week four</span><span slot="title">Assembly</span>
        <span slot="body">Drivetrain done, superstructure on the fixture.</span>
      </TimelineItem>
      <TimelineItem state="risk">
        <span slot="when">Week six</span><span slot="title">Bag and practice</span>
        <span slot="body">Driver practice needs the field elements finished.</span>
      </TimelineItem>
    </Timeline>
  </div>
)

export const SeasonAhead = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 640 }}>
    <Timeline>
      <TimelineItem state="done">
        <span slot="when">August</span><span slot="title">Team meeting</span>
        <span slot="body">Nine subteams named, leads assigned.</span>
      </TimelineItem>
      <TimelineItem state="current">
        <span slot="when">Autumn</span><span slot="title">Offseason training</span>
        <span slot="body">Certifications on the mill, the lathe and the bandsaw.</span>
      </TimelineItem>
      <TimelineItem>
        <span slot="when">January 2027</span><span slot="title">Kickoff</span>
        <span slot="body">New game released.</span>
      </TimelineItem>
    </Timeline>
  </div>
)
