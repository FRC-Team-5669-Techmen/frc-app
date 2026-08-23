// @dsCard group="Data" name="Data components" subtitle="Badges, stats, tables, charts, matrix, timeline, clocks, alliance surfaces"
import { GROUND_CLASSES } from '../../tokens.js'
import { cx } from '../cx.js'
import { Badge } from './Badge.jsx'
import { Chip } from './Chip.jsx'
import { SubteamBadge } from './SubteamBadge.jsx'
import { Field } from './Field.jsx'
import { StatBlock } from './StatBlock.jsx'
import { Readout } from './Readout.jsx'
import { SpecTable, SpecRow } from './SpecTable.jsx'
import { FocusTable, FocusRow } from './FocusTable.jsx'
import { BarChart, Bar } from './BarChart.jsx'
import { GanttChart, GanttBar } from './GanttChart.jsx'
import { DecisionMatrix } from './DecisionMatrix.jsx'
import { Timeline, TimelineItem } from './Timeline.jsx'
import { MatchClock } from './MatchClock.jsx'
import { BuildCountdown } from './BuildCountdown.jsx'
import { ScoutTable, ScoutRow } from './ScoutTable.jsx'
import { AllianceSplit } from './AllianceSplit.jsx'
import { Eyebrow } from '../core/Eyebrow.jsx'

const section = { display: 'grid', gap: 20 }
const row = { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }
const cols = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 40, alignItems: 'start' }

/**
 * DataDemoCard - the one demo card for components/data. Mounts the REAL
 * components; it never re-implements their markup.
 */
export function DataDemoCard({ ground = 'squadron', run = false, className, ...rest }) {
  return (
    <div
      className={cx('frc-deck', GROUND_CLASSES[ground] ?? GROUND_CLASSES.squadron, run && 'frc-run', 'frc-demo-card', className)}
      data-card="data"
      data-ground={ground}
      style={{ padding: 48, display: 'grid', gap: 56 }}
      {...rest}
    >
      <section style={section}>
        <Eyebrow>Badge, Chip, SubteamBadge</Eyebrow>
        <div style={row}>
          <Badge>Queued</Badge>
          <Badge tone="ok">Certified</Badge>
          <Badge tone="warn">Awaiting sign-off</Badge>
          <Badge tone="fault">Failed inspection</Badge>
          <Badge tone="accent" solid>Live</Badge>
          <Badge tone="program">Robotics Competition</Badge>
        </div>
        <div style={row}>
          <Chip>Bumpers</Chip>
          <Chip selected>Drivetrain</Chip>
          <Chip count={4}>Open jobs</Chip>
          <SubteamBadge>Mechanical</SubteamBadge>
          <SubteamBadge lead>Drive Team</SubteamBadge>
          <SubteamBadge>Field &amp; Pit</SubteamBadge>
          <SubteamBadge>Pyrotechnics</SubteamBadge>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>StatBlock, Field, Readout</Eyebrow>
        <div style={cols}>
          <StatBlock tone="hero">
            <span slot="value">412</span>
            <span slot="unit">hrs</span>
            <span slot="label">Shop hours this season</span>
            <span slot="note">Across 38 members</span>
          </StatBlock>
          <div style={{ display: 'grid', gap: 20 }}>
            <Field><span slot="label">Weight</span><span slot="value">118 lb with bumpers</span></Field>
            <Field mono><span slot="label">Frame perimeter</span><span slot="value">112 in</span></Field>
          </div>
          <div className="frc-readout-stack">
            <Readout><span slot="label">Battery</span><span slot="value">12.4 V</span></Readout>
            <Readout tone="ok"><span slot="label">Inspection</span><span slot="value">Passed</span></Readout>
            <Readout tone="warn"><span slot="label">Spare bumpers</span><span slot="value">1 set</span></Readout>
            <Readout tone="fault"><span slot="label">Practice bot</span><span slot="value">Down</span></Readout>
          </div>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>SpecTable, FocusTable</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'start' }}>
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
          <FocusTable>
            <span slot="caption">Qualification standing - click a row to focus it</span>
            <FocusRow id="a"><span slot="rank">01</span><span slot="label">5669 Techmen</span><span slot="value">2.41</span></FocusRow>
            <FocusRow id="b"><span slot="rank">02</span><span slot="label">1671 Buchanan</span><span slot="value">2.28</span></FocusRow>
            <FocusRow id="c"><span slot="rank">03</span><span slot="label">973 Greybots</span><span slot="value">2.19</span></FocusRow>
            <FocusRow id="d"><span slot="rank">04</span><span slot="label">4322 Clockwork</span><span slot="value">1.98</span></FocusRow>
          </FocusTable>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>BarChart, GanttChart</Eyebrow>
        <BarChart max={120} target={90}>
          <span slot="caption">Hours by subteam, target 90</span>
          <Bar value={104}><span slot="label">Mechanical</span><span slot="value">104 h</span></Bar>
          <Bar value={88} tone="ok"><span slot="label">Programming</span><span slot="value">88 h</span></Bar>
          <Bar value={52} tone="warn"><span slot="label">Electrical</span><span slot="value">52 h</span></Bar>
          <Bar value={21} tone="fault"><span slot="label">Media</span><span slot="value">21 h</span></Bar>
        </BarChart>
        <GanttChart cols={6} today={54}>
          <span slot="tick">Wk 1</span><span slot="tick">Wk 2</span><span slot="tick">Wk 3</span>
          <span slot="tick">Wk 4</span><span slot="tick">Wk 5</span><span slot="tick">Wk 6</span>
          <GanttBar start={0} span={34} state="done"><span slot="label">Drivetrain</span><span slot="bar">Cut, welded, belted</span></GanttBar>
          <GanttBar start={18} span={40}><span slot="label">Intake</span><span slot="bar">Rev two on the bench</span></GanttBar>
          <GanttBar start={44} span={30} state="risk"><span slot="label">Shooter</span><span slot="bar">Waiting on rollers</span></GanttBar>
          <GanttBar start={62} span={24} state="blocked"><span slot="label">Climber</span><span slot="bar">Blocked on geometry</span></GanttBar>
        </GanttChart>
      </section>

      <section style={section}>
        <Eyebrow>DecisionMatrix, Timeline</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 48, alignItems: 'start' }}>
          <DecisionMatrix weights={[3, 2, 2, 1]} scores={[[4, 3, 5, 4], [5, 2, 3, 2], [2, 5, 4, 5]]}>
            <span slot="caption">Intake geometry, weighted 3 / 2 / 2 / 1</span>
            <span slot="criterion">Cycle time</span>
            <span slot="criterion">Build hours</span>
            <span slot="criterion">Reliability</span>
            <span slot="criterion">Cost</span>
            <span slot="option">Over the bumper</span>
            <span slot="option">Under the bumper</span>
            <span slot="option">Ground pickup</span>
          </DecisionMatrix>
          <Timeline>
            <TimelineItem state="done">
              <span slot="when">Week one</span><span slot="title">Kickoff read</span>
              <span slot="body">Manual read together, strategy poster on the wall.</span>
            </TimelineItem>
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
      </section>

      <section style={section}>
        <Eyebrow>MatchClock, BuildCountdown</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 40, alignItems: 'start' }}>
          <MatchClock phase="auto"><span slot="note">Autonomous, full duration</span></MatchClock>
          <MatchClock phase="teleop"><span slot="note">Teleop, at rest</span></MatchClock>
          <MatchClock phase="teleop" remaining={22}><span slot="note">Inside the warning window</span></MatchClock>
          <MatchClock phase="teleop" remaining={0}><span slot="note">Zero: rust, never alliance red</span></MatchClock>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 40 }}>
          <BuildCountdown value={31}><span slot="label">To bag and tag</span></BuildCountdown>
          <BuildCountdown value={9}><span slot="label">To the Ventura regional</span></BuildCountdown>
          <BuildCountdown value={0}><span slot="label">Chairmans essay due</span></BuildCountdown>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>ScoutTable, AllianceSplit</Eyebrow>
        <ScoutTable>
          <span slot="caption">Qual 42 - click a row to focus it</span>
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
        <AllianceSplit outcome="red">
          <span slot="red-tag">Red alliance</span>
          <span slot="red-score">88</span>
          <span slot="red-teams">5669 &middot; 1678 &middot; 4322</span>
          <span slot="vs">Qual 42</span>
          <span slot="blue-tag">Blue alliance</span>
          <span slot="blue-score">74</span>
          <span slot="blue-teams">254 &middot; 973 &middot; 1671</span>
        </AllianceSplit>
      </section>
    </div>
  )
}
