// @dsCard group="Sheets" name="Sheet patterns" subtitle="All twenty-six full-sheet patterns, on any ground, in either audience mode"
import { cloneElement } from 'react'
import { AUDIENCE_CLASSES, GROUND_CLASSES } from '../../tokens.js'
import { cx } from '../cx.js'

import { CoverSheet } from './CoverSheet.jsx'
import { AgendaSheet } from './AgendaSheet.jsx'
import { SectionSheet } from './SectionSheet.jsx'
import { StatementSheet } from './StatementSheet.jsx'
import { QuoteSheet } from './QuoteSheet.jsx'
import { HubSheet } from './HubSheet.jsx'
import { ClosingSheet } from './ClosingSheet.jsx'
import { SplitSheet } from './SplitSheet.jsx'
import { GallerySheet } from './GallerySheet.jsx'
import { ProcedureSheet } from './ProcedureSheet.jsx'
import { ComparisonSheet } from './ComparisonSheet.jsx'
import { DataSheet } from './DataSheet.jsx'
import { TimelineSheet } from './TimelineSheet.jsx'
import { ScheduleSheet } from './ScheduleSheet.jsx'
import { SubteamStatusSheet, SubteamStatus } from './SubteamStatusSheet.jsx'
import { BlockerSheet, Blocker } from './BlockerSheet.jsx'
import { TargetsSheet } from './TargetsSheet.jsx'
import { SafetySheet } from './SafetySheet.jsx'
import { RosterSheet } from './RosterSheet.jsx'
import { MatchBreakdownSheet } from './MatchBreakdownSheet.jsx'
import { ScoutingSheet } from './ScoutingSheet.jsx'
import { FieldSheet } from './FieldSheet.jsx'
import { BOMSheet } from './BOMSheet.jsx'
import { AwardSheet } from './AwardSheet.jsx'
import { SponsorSheet } from './SponsorSheet.jsx'
import { SeasonSheet } from './SeasonSheet.jsx'

import { Button } from '../core/Button.jsx'
import { IconArrowRight, IconCheck, IconTriangleAlert } from '../core/icons.jsx'
import { SeasonLockup } from '../brand/SeasonLockup.jsx'
import { Badge } from '../data/Badge.jsx'
import { Chip } from '../data/Chip.jsx'
import { SubteamBadge } from '../data/SubteamBadge.jsx'
import { StatBlock } from '../data/StatBlock.jsx'
import { Readout } from '../data/Readout.jsx'
import { SpecTable, SpecRow } from '../data/SpecTable.jsx'
import { FocusTable, FocusRow } from '../data/FocusTable.jsx'
import { Bar } from '../data/BarChart.jsx'
import { GanttChart, GanttBar } from '../data/GanttChart.jsx'
import { DecisionMatrix } from '../data/DecisionMatrix.jsx'
import { TimelineItem } from '../data/Timeline.jsx'
import { MatchClock } from '../data/MatchClock.jsx'
import { BuildCountdown } from '../data/BuildCountdown.jsx'
import { ScoutTable, ScoutRow } from '../data/ScoutTable.jsx'
import { AllianceSplit } from '../data/AllianceSplit.jsx'
import { Card } from '../surfaces/Card.jsx'
import { Callout } from '../surfaces/Callout.jsx'
import { SafetyNote } from '../surfaces/SafetyNote.jsx'
import { ImageFrame } from '../surfaces/ImageFrame.jsx'
import { Cutout } from '../surfaces/Cutout.jsx'
import { Step } from '../surfaces/StepCard.jsx'
import { CompareSplit, CompareRow } from '../surfaces/CompareSplit.jsx'
import { Sample } from '../surfaces/SampleGrid.jsx'
import { JumpCard } from '../surfaces/JumpGrid.jsx'
import { CalloutDrawing, CalloutPin } from '../surfaces/CalloutDrawing.jsx'
import { RoleCard } from '../surfaces/RoleCard.jsx'
import { PartCallout } from '../surfaces/PartCallout.jsx'
import { FieldDiagram } from '../surfaces/FieldDiagram.jsx'
import { SponsorWall, SponsorTier } from '../surfaces/SponsorWall.jsx'
import { AwardPlate } from '../surfaces/AwardPlate.jsx'
import { ResultBanner } from '../surfaces/ResultBanner.jsx'

const PARTS = ['Brief', 'Build', 'Field', 'Season']

/**
 * A representative ambient layer per ground, for `ambient` demonstrations.
 * The PATTERNS never do this - they inherit their ground and take whatever
 * layer the deck hands them. Picking a layer by ground is a DECK author's job,
 * because the layer names are ground-specific (rivet is a SQUADRON seam,
 * fieldgrid is the competition floor, grid is a paper sheet), and this card is
 * standing in for a deck author.
 */
const AMBIENT_BY_GROUND = { squadron: ['rivet'], field: ['fieldgrid'], paper: ['grid'] }
const DECK = 'Sheet pattern reference'

/** Field zone geometry. Structure, not copy: nobody reads a point list aloud. */
const ZONES = [
  { id: 'red-source', alliance: 'red', points: '0,0 300,0 300,300 0,300', at: [9, 19] },
  { id: 'red-amp', alliance: 'red', points: '0,500 300,500 300,800 0,800', at: [9, 81] },
  { id: 'neutral', points: '620,0 980,0 980,800 620,800', at: [50, 50] },
  { id: 'blue-source', alliance: 'blue', points: '1300,0 1600,0 1600,300 1300,300', at: [91, 19] },
  { id: 'blue-amp', alliance: 'blue', points: '1300,500 1600,500 1600,800 1300,800', at: [91, 81] },
]

/** One stage per pattern, so each sheet gets the 1920 x 1440 box it was built for. */
function Stage({ name, children }) {
  return (
    <figure className="frc-sheet-stage" data-pattern={name} style={{ margin: 0, display: 'grid', gap: 12 }}>
      <figcaption className="frc-label" style={{ paddingLeft: 8 }}>{name}</figcaption>
      <div className="frc-stage" data-aspect="4:3">{children}</div>
    </figure>
  )
}

/**
 * SheetsDemoCard - the one demo card for components/sheets. Mounts the REAL
 * patterns; it never re-implements their markup.
 *
 * `ground` and `audience` are set ONCE on the deck root here, exactly as a real
 * deck sets them, and no pattern below takes either as a prop. That is the
 * whole point of the group: switch the two classes and all twenty-six patterns
 * follow.
 *
 * `only` renders a subset, which is how /_ds steps one pattern at a time.
 */
export function SheetsDemoCard({ ground = 'squadron', audience = 'internal', run = false, only = null, ambient = false, className, ...rest }) {
  const show = (name) => !only || only.includes(name)
  const layers = ambient === true ? (AMBIENT_BY_GROUND[ground] || []) : ambient ? [].concat(ambient) : []
  const sheet = (name, node) => (
    show(name) ? <Stage key={name} name={name}>{layers.length ? cloneElement(node, { ambient: layers }) : node}</Stage> : null
  )
  const footer = (n, partIndex = 0) => ({ deckName: DECK, parts: PARTS, partIndex, sheet: n, total: 26 })

  return (
    <div
      className={cx(
        'frc-deck',
        GROUND_CLASSES[ground] ?? GROUND_CLASSES.squadron,
        AUDIENCE_CLASSES[audience] ?? AUDIENCE_CLASSES.internal,
        run && 'frc-run',
        'frc-demo-card',
        className,
      )}
      data-card="sheets"
      data-ground={ground}
      data-audience={audience}
      style={{ display: 'grid', gap: 56, padding: 24 }}
      {...rest}
    >
      {sheet('CoverSheet', (
        <CoverSheet active label="Cover" footer={footer(1)}>
          <span slot="eyebrow">Kickoff briefing</span>
          <span slot="title">Build season starts Saturday</span>
          <span slot="subtitle">What we are building, who is on what, and the three dates that do not move.</span>
          <span slot="meta"><Badge tone="accent" solid>2026-27</Badge></span>
        </CoverSheet>
      ))}

      {sheet('AgendaSheet', (
        <AgendaSheet active label="Agenda" footer={footer(2)}>
          <span slot="eyebrow">This session</span>
          <span slot="title">What we cover today</span>
          <Step state="done"><span slot="title">Where the season stands</span><span slot="text">Two minutes on the schedule, then straight to the work.</span></Step>
          <Step state="current"><span slot="title">Drivetrain handoff</span><span slot="text">Mechanical walks Programming through the gearbox change.</span></Step>
          <Step><span slot="title">Shop safety refresh</span><span slot="text">Mill and bandsaw. Everyone, not just the certified.</span></Step>
          <Step><span slot="title">Open build</span><span slot="text">Subteam leads have the job board.</span></Step>
        </AgendaSheet>
      ))}

      {sheet('SectionSheet', (
        <SectionSheet active label="Section" index={2} footer={footer(3, 1)}>
          <span slot="eyebrow">Part two</span>
          <span slot="title">Build</span>
          <span slot="lede">Drivetrain, intake, and the parts we are still waiting on.</span>
        </SectionSheet>
      ))}

      {sheet('StatementSheet', (
        <StatementSheet active label="Statement" footer={footer(4, 1)}>
          <span slot="eyebrow">Standing order</span>
          <span slot="title">Nobody runs a machine alone.</span>
          <span slot="attribution">Shop rule one, every season since 2019</span>
        </StatementSheet>
      ))}

      {sheet('QuoteSheet', (
        <QuoteSheet active label="Quote" footer={footer(5, 1)}>
          <Cutout slot="portrait" ground="none" width={280} height={280} file="member-cutout.png" />
          <span slot="text">They did not hand us a finished robot. They handed us a shop and told us what good work looks like.</span>
          <span slot="attr">Senior, class of 2026</span>
          <span slot="role">Drive coach</span>
        </QuoteSheet>
      ))}

      {sheet('HubSheet', (
        <HubSheet active label="Hub" cols={4}>
          <span slot="eyebrow">Where to</span>
          <span slot="title">Pick a part</span>
          <JumpCard href="#brief" state="done"><span slot="title">Brief</span><span slot="note">Where the season stands</span></JumpCard>
          <JumpCard href="#build"><span slot="title">Build</span><span slot="note">Mechanisms and blockers</span></JumpCard>
          <JumpCard href="#field"><span slot="title">Field</span><span slot="note">Match review and scouting</span></JumpCard>
          <JumpCard href="#season"><span slot="title">Season</span><span slot="note">Awards, sponsors, next year</span></JumpCard>
        </HubSheet>
      ))}

      {sheet('ClosingSheet', (
        <ClosingSheet active label="Closing" footer={footer(7, 3)}>
          <span slot="eyebrow">That is the brief</span>
          <span slot="title">Shop opens at 15:30.</span>
          <span slot="lede">Tag in at the door, tag out when you leave, and put the tool back where the shadow is.</span>
          <span slot="next">
            <Button variant="primary" iconEnd={<IconArrowRight />}>Job board</Button>
            <Button variant="ghost">Ask a mentor</Button>
          </span>
          <SponsorWall slot="sponsors">
            <SponsorTier>
              <span slot="name">Lead sponsors</span>
              <Cutout ground="none" width={220} height={90} file="sponsor-lead-1.png" />
              <Cutout ground="none" width={220} height={90} file="sponsor-lead-2.png" />
            </SponsorTier>
          </SponsorWall>
        </ClosingSheet>
      ))}

      {sheet('SplitSheet', (
        <SplitSheet active label="Split" media="right" footer={footer(8, 1)}>
          <span slot="eyebrow">Drivetrain</span>
          <span slot="title">Belted, not chained</span>
          <ImageFrame slot="media" kind="render" ratio="4 / 3" file="drivetrain-render.png">
            <span slot="caption">Rev 3, as released to the router</span>
          </ImageFrame>
          <p className="frc-body">Belts hold tension through an event without a mid-match check, and the gearbox drops in without a tensioner block.</p>
          <p className="frc-body-sm frc-dim">Trade: a belt skips a tooth under a hard hit. We accept that and carry two spares in the pit.</p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Chip>6.75:1</Chip><Chip>16.4 ft/s</Chip><Chip selected>4 in colson</Chip>
          </div>
        </SplitSheet>
      ))}

      {sheet('GallerySheet', (
        <GallerySheet active label="Gallery" cols={4} footer={footer(9, 1)}>
          <span slot="eyebrow">Week four</span>
          <span slot="title">Where the robot is</span>
          <Sample><span slot="name">Drivetrain</span><span slot="note">Welded, belted, wired</span></Sample>
          <Sample><span slot="name">Intake</span><span slot="note">Rev two on the bench</span></Sample>
          <Sample><span slot="name">Shooter</span><span slot="note">Waiting on rollers</span></Sample>
          <Sample><span slot="name">Climber</span><span slot="note">Geometry under review</span></Sample>
        </GallerySheet>
      ))}

      {sheet('ProcedureSheet', (
        <ProcedureSheet active label="Procedure" footer={footer(10, 1)}>
          <span slot="eyebrow">Mill</span>
          <span slot="title">Squaring stock</span>
          <Step state="done"><span slot="title">Face one side</span><span slot="text">Light passes. Deburr before it goes back in the vise.</span></Step>
          <Step state="current"><span slot="title">Locate the datum</span><span slot="text">Edge find both walls, zero the readout, write the offsets on the traveller.</span></Step>
          <Step><span slot="title">Cut the pocket</span><span slot="text">Rough at depth minus 0.020, finish in one pass, then check with the caliper.</span></Step>
          <div slot="aside">
            <Callout tone="warn" icon={<IconTriangleAlert />}>
              <span slot="title">Before you start</span>
              <p className="frc-callout-text">Stock clamped, sleeves down, mentor in the shop. Every time.</p>
            </Callout>
          </div>
        </ProcedureSheet>
      ))}

      {sheet('ComparisonSheet', (
        <ComparisonSheet active label="Comparison" footer={footer(11, 1)}>
          <span slot="eyebrow">Intake geometry</span>
          <span slot="title">Over the bumper, or under</span>
          <CompareSplit>
            <span slot="label">Criterion</span>
            <span slot="option-a">Over the bumper</span>
            <span slot="option-b">Under the bumper</span>
            <CompareRow lead="a"><span slot="label">Cycle time</span><span slot="a">Faster from the source</span><span slot="b">One extra beat every cycle</span></CompareRow>
            <CompareRow lead="b"><span slot="label">Build hours</span><span slot="a">Two weeks of iteration</span><span slot="b">Fits the frame we have</span></CompareRow>
            <CompareRow lead="a"><span slot="label">Reliability</span><span slot="a">Fewer jam paths</span><span slot="b">Jams under the bumper</span></CompareRow>
          </CompareSplit>
          <span slot="verdict">
            <Badge tone="ok">Decision: over the bumper</Badge>
            <Badge tone="warn">Revisit if the frame changes</Badge>
          </span>
        </ComparisonSheet>
      ))}

      {sheet('DataSheet', (
        <DataSheet active label="Data" footer={footer(12, 1)}>
          <span slot="eyebrow">Season to date</span>
          <span slot="title">Hours in the shop</span>
          <StatBlock slot="stat" tone="hero"><span slot="value">412</span><span slot="unit">hrs</span><span slot="label">Shop hours</span></StatBlock>
          <StatBlock slot="stat" size="sm"><span slot="value">38</span><span slot="label">Members active</span></StatBlock>
          <StatBlock slot="stat" size="sm" tone="warn"><span slot="value">9</span><span slot="label">Below the goal</span></StatBlock>
          <SpecTable>
            <span slot="caption">By subteam</span>
            <SpecRow><span slot="label">Mechanical</span><span slot="value">104 h</span></SpecRow>
            <SpecRow><span slot="label">Programming</span><span slot="value">88 h</span></SpecRow>
            <SpecRow emphasis><span slot="label">Electrical</span><span slot="value">52 h</span></SpecRow>
            <SpecRow><span slot="label">Media</span><span slot="value">21 h</span></SpecRow>
          </SpecTable>
          <div slot="aside">
            <div className="frc-readout-stack">
              <Readout><span slot="label">Meetings held</span><span slot="value">24</span></Readout>
              <Readout tone="ok"><span slot="label">On goal</span><span slot="value">29 of 38</span></Readout>
              <Readout tone="warn"><span slot="label">Behind</span><span slot="value">9</span></Readout>
            </div>
          </div>
        </DataSheet>
      ))}

      {sheet('TimelineSheet', (
        <TimelineSheet active label="Timeline" footer={footer(13, 1)}>
          <span slot="eyebrow">Build season</span>
          <span slot="title">Six weeks, four gates</span>
          <TimelineItem state="done"><span slot="when">Week one</span><span slot="title">Kickoff read</span><span slot="body">Manual read together, strategy poster on the wall.</span></TimelineItem>
          <TimelineItem state="done"><span slot="when">Week two</span><span slot="title">Prototype gate</span><span slot="body">Three intakes on the bench, one carried forward.</span></TimelineItem>
          <TimelineItem state="current"><span slot="when">Week four</span><span slot="title">Assembly</span><span slot="body">Drivetrain done, superstructure on the fixture.</span></TimelineItem>
          <TimelineItem state="risk"><span slot="when">Week six</span><span slot="title">Practice</span><span slot="body">Driver practice needs the field elements finished.</span></TimelineItem>
          <div slot="aside">
            <Callout><span slot="title">The gate that matters</span><p className="frc-callout-text">Week two. Everything after it assumes one intake, not three.</p></Callout>
          </div>
        </TimelineSheet>
      ))}

      {sheet('ScheduleSheet', (
        <ScheduleSheet active label="Schedule" footer={footer(14, 1)}>
          <span slot="eyebrow">Build calendar</span>
          <span slot="title">Who is where, when</span>
          <GanttChart cols={6} today={54}>
            <span slot="tick">Wk 1</span><span slot="tick">Wk 2</span><span slot="tick">Wk 3</span>
            <span slot="tick">Wk 4</span><span slot="tick">Wk 5</span><span slot="tick">Wk 6</span>
            <GanttBar start={0} span={34} state="done"><span slot="label">Drivetrain</span><span slot="bar">Cut, welded, belted</span></GanttBar>
            <GanttBar start={18} span={40}><span slot="label">Intake</span><span slot="bar">Rev two on the bench</span></GanttBar>
            <GanttBar start={44} span={30} state="risk"><span slot="label">Shooter</span><span slot="bar">Waiting on rollers</span></GanttBar>
            <GanttBar start={62} span={24} state="blocked"><span slot="label">Climber</span><span slot="bar">Blocked on geometry</span></GanttBar>
          </GanttChart>
          <Chip slot="key">Done</Chip>
          <Chip slot="key">At risk</Chip>
          <Chip slot="key">Blocked</Chip>
          <span slot="foot"><Badge tone="warn">Two lanes cross week four</Badge></span>
        </ScheduleSheet>
      ))}

      {sheet('SubteamStatusSheet', (
        <SubteamStatusSheet active label="Subteam status" cols={3} footer={footer(15, 1)}>
          <span slot="eyebrow">Monday muster</span>
          <span slot="title">Where every subteam stands</span>
          <SubteamStatus tone="ok" progress={92}>
            <span slot="subteam">Mechanical</span><span slot="status">On plan</span>
            <span slot="label" >Drivetrain</span>
            <span slot="note">Drivetrain closed out. Starting the superstructure fixture.</span>
          </SubteamStatus>
          <SubteamStatus tone="warn" progress={54}>
            <span slot="subteam">Electrical</span><span slot="status">Behind</span>
            <span slot="note">Waiting on the second CAN run. Two members certified this week.</span>
          </SubteamStatus>
          <SubteamStatus tone="ok" progress={78}>
            <span slot="subteam">Programming</span><span slot="status">On plan</span>
            <span slot="note">Auto paths sim-tested. Needs the real drivetrain Thursday.</span>
          </SubteamStatus>
          <SubteamStatus tone="fault" progress={22}>
            <span slot="subteam">Fabrication</span><span slot="status">Blocked</span>
            <span slot="note">Router table down. Parts queued at the shop next door.</span>
          </SubteamStatus>
          <SubteamStatus tone="ok" progress={66}>
            <span slot="subteam">Media</span><span slot="status">On plan</span>
            <span slot="note">Build photos every meeting. Sponsor packet drafted.</span>
          </SubteamStatus>
          <SubteamStatus tone="default" progress={40}>
            <span slot="subteam">Business/Outreach</span><span slot="status">Steady</span>
            <span slot="note">Two sponsor calls booked. Chairmans essay in review.</span>
          </SubteamStatus>
        </SubteamStatusSheet>
      ))}

      {sheet('BlockerSheet', (
        <BlockerSheet active label="Blockers" footer={footer(16, 1)}>
          <span slot="eyebrow">Standing blockers</span>
          <span slot="title">What is stopping work</span>
          <Blocker id="b1" severity="fault"><span slot="state">Blocked</span><span slot="title">Router table down, four parts queued</span><span slot="owner">Fabrication</span></Blocker>
          <Blocker id="b2" severity="warn"><span slot="state">At risk</span><span slot="title">Shooter rollers not shipped</span><span slot="owner">Mechanical</span></Blocker>
          <Blocker id="b3" severity="warn"><span slot="state">At risk</span><span slot="title">Field elements not built for driver practice</span><span slot="owner">Robot Construction</span></Blocker>
          <Blocker id="b4" severity="ok"><span slot="state">Cleared</span><span slot="title">Second battery charger installed</span><span slot="owner">Electrical</span></Blocker>
          <div slot="aside">
            <Callout tone="fault"><span slot="title">Decision needed today</span><p className="frc-callout-text">Cut the climber, or move driver practice a week. The room picks one.</p></Callout>
            <Callout tone="quiet"><span slot="title">Owner rule</span><p className="frc-callout-text">Every blocker has a name next to it before this sheet closes.</p></Callout>
          </div>
        </BlockerSheet>
      ))}

      {sheet('TargetsSheet', (
        <TargetsSheet active label="Targets" max={120} target={90} footer={footer(17, 1)}>
          <span slot="eyebrow">Season targets</span>
          <span slot="title">What we said we would hit</span>
          <Bar value={104}><span slot="label">Shop hours</span><span slot="value">104 of 90</span></Bar>
          <Bar value={88} tone="ok"><span slot="label">Members certified</span><span slot="value">88%</span></Bar>
          <Bar value={52} tone="warn"><span slot="label">Outreach hours</span><span slot="value">52 of 90</span></Bar>
          <Bar value={21} tone="fault"><span slot="label">Driver practice</span><span slot="value">21 of 90</span></Bar>
          <div slot="aside">
            <BuildCountdown value={31}><span slot="label">To bag and tag</span></BuildCountdown>
            <BuildCountdown value={9}><span slot="label">To the Ventura regional</span></BuildCountdown>
          </div>
        </TargetsSheet>
      ))}

      {sheet('SafetySheet', (
        <SafetySheet active label="Safety" footer={footer(18, 1)}>
          <span slot="eyebrow">Shop safety</span>
          <span slot="title">The mill</span>
          <SafetyNote slot="note">
            <p>The mill is a two-person tool. Nobody runs it alone, and nobody runs it without a mentor in the shop.</p>
            <li slot="rule">Eye protection from the door, not from the machine.</li>
            <li slot="rule">Long hair tied back, sleeves down, no gloves at the spindle.</li>
            <li slot="rule">Stock clamped before the spindle turns. Every time.</li>
            <Chip slot="ppe">Eye protection</Chip>
            <Chip slot="ppe">Closed shoes</Chip>
            <Chip slot="ppe">Hearing protection</Chip>
          </SafetyNote>
          <Step state="current"><span slot="title">Check the vise</span><span slot="text">Jaws clean, stock seated on parallels, handle snug.</span></Step>
          <Step><span slot="title">Check the tool</span><span slot="text">Collet tight, tool length recorded, spindle clear of the stock.</span></Step>
          <div slot="aside">
            <Callout tone="ok" icon={<IconCheck />}><span slot="title">Certified to run this</span><p className="frc-callout-text">Four students and two mentors. The list is on the roster sheet.</p></Callout>
          </div>
        </SafetySheet>
      ))}

      {sheet('RosterSheet', (
        <RosterSheet active label="Roster" cols={2} footer={footer(19, 1)}>
          <span slot="eyebrow">Drive team</span>
          <span slot="title">Who is on what</span>
          <RoleCard>
            <Cutout slot="portrait" ground="none" width={160} height={160} file="member-cutout.png" />
            <span slot="name">A. Rivera</span>
            <span slot="title">Drive coach, class of 2027</span>
            <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
            <SubteamBadge slot="subteam">Mechanical</SubteamBadge>
            <li slot="cert" data-status="certified" data-safety>Mill</li>
            <li slot="cert" data-status="certified">Bandsaw</li>
            <li slot="cert" data-status="in_progress">Lathe</li>
          </RoleCard>
          <RoleCard>
            <Cutout slot="portrait" ground="none" width={160} height={160} file="member-cutout-2.png" />
            <span slot="name">J. Okafor</span>
            <span slot="title">Driver, class of 2028</span>
            <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
            <SubteamBadge slot="subteam">Programming</SubteamBadge>
            <li slot="cert" data-status="certified">Pit safety</li>
            <li slot="cert" data-status="in_progress" data-safety>Mill</li>
          </RoleCard>
        </RosterSheet>
      ))}

      {sheet('MatchBreakdownSheet', (
        <MatchBreakdownSheet active label="Match breakdown" footer={footer(20, 2)}>
          <span slot="eyebrow">Qualification 42</span>
          <span slot="title">Where the match was won</span>
          <AllianceSplit slot="score" outcome="red">
            <span slot="red-tag">Red alliance</span>
            <span slot="red-score">88</span>
            <span slot="red-teams">5669 &middot; 1678 &middot; 4322</span>
            <span slot="vs">Qual 42</span>
            <span slot="blue-tag">Blue alliance</span>
            <span slot="blue-score">74</span>
            <span slot="blue-teams">254 &middot; 973 &middot; 1671</span>
          </AllianceSplit>
          <MatchClock slot="clock" phase="teleop" remaining={0}><span slot="note">Final</span></MatchClock>
          <SpecTable slot="red">
            <span slot="caption">Red breakdown</span>
            <SpecRow><span slot="label">Autonomous</span><span slot="value">26</span></SpecRow>
            <SpecRow emphasis><span slot="label">Teleop cycles</span><span slot="value">41</span></SpecRow>
            <SpecRow><span slot="label">Endgame</span><span slot="value">21</span></SpecRow>
          </SpecTable>
          <SpecTable slot="blue">
            <span slot="caption">Blue breakdown</span>
            <SpecRow><span slot="label">Autonomous</span><span slot="value">30</span></SpecRow>
            <SpecRow><span slot="label">Teleop cycles</span><span slot="value">33</span></SpecRow>
            <SpecRow><span slot="label">Endgame</span><span slot="value">11</span></SpecRow>
          </SpecTable>
          <Callout tone="ok"><span slot="title">What decided it</span><p className="frc-callout-text">Two extra cycles in the last forty seconds, and a deep climb both alliances tried for.</p></Callout>
        </MatchBreakdownSheet>
      ))}

      {sheet('ScoutingSheet', (
        <ScoutingSheet active label="Scouting" footer={footer(21, 2)}>
          <span slot="eyebrow">Alliance selection</span>
          <span slot="title">Who we want</span>
          <ScoutTable>
            <span slot="col">Team</span><span slot="col">Auto</span><span slot="col">Cycles</span><span slot="col">Climb</span><span slot="col">Notes</span>
            <ScoutRow id="s1" alliance="red"><span slot="team">5669</span><span slot="cell">12</span><span slot="cell">7</span><span slot="cell">Deep</span><span slot="cell">Clean cycles, no fouls</span></ScoutRow>
            <ScoutRow id="s2" alliance="red"><span slot="team">1678</span><span slot="cell">15</span><span slot="cell">9</span><span slot="cell">Deep</span><span slot="cell">Fast from the source</span></ScoutRow>
            <ScoutRow id="s3" alliance="blue"><span slot="team">254</span><span slot="cell">14</span><span slot="cell">8</span><span slot="cell">Shallow</span><span slot="cell">Defended late</span></ScoutRow>
            <ScoutRow id="s4" alliance="blue"><span slot="team">973</span><span slot="cell">9</span><span slot="cell">6</span><span slot="cell">None</span><span slot="cell">Battery swap between matches</span></ScoutRow>
          </ScoutTable>
          <div slot="aside">
            <FocusTable defaultActive="p1">
              <span slot="caption">Pick order</span>
              <FocusRow id="p1"><span slot="rank">01</span><span slot="label">1678</span><span slot="value">2.41</span></FocusRow>
              <FocusRow id="p2"><span slot="rank">02</span><span slot="label">254</span><span slot="value">2.28</span></FocusRow>
              <FocusRow id="p3"><span slot="rank">03</span><span slot="label">973</span><span slot="value">2.19</span></FocusRow>
            </FocusTable>
            <Callout><span slot="title">Clicking a row dims the others</span><p className="frc-callout-text">It never hides one. The whole list is on the sheet in a PDF.</p></Callout>
          </div>
        </ScoutingSheet>
      ))}

      {sheet('FieldSheet', (
        <FieldSheet active label="Field" footer={footer(22, 2)}>
          <span slot="eyebrow">Field</span>
          <span slot="title">Where our cycles live</span>
          <FieldDiagram zones={ZONES} viewBox="0 0 1600 800" grid={8}>
            <span slot="zone" data-zone="red-source">Red source</span>
            <span slot="zone" data-zone="red-amp">Red amp</span>
            <span slot="zone" data-zone="neutral">Neutral zone</span>
            <span slot="zone" data-zone="blue-source">Blue source</span>
            <span slot="zone" data-zone="blue-amp">Blue amp</span>
            <span slot="key" className="frc-fd-key frc-fd-key-red">Red side</span>
            <span slot="key" className="frc-fd-key frc-fd-key-blue">Blue side</span>
            <span slot="key" className="frc-fd-key">Neutral</span>
          </FieldDiagram>
          <div slot="aside">
            <div className="frc-readout-stack">
              <Readout><span slot="label">Cycle, source to amp</span><span slot="value">8.4 s</span></Readout>
              <Readout tone="warn"><span slot="label">Contested lane</span><span slot="value">Neutral</span></Readout>
              <Readout tone="ok"><span slot="label">Auto start</span><span slot="value">Amp side</span></Readout>
            </div>
            <Callout><span slot="title">Click a zone</span><p className="frc-callout-text">It raises the label already drawn there and dims the rest.</p></Callout>
          </div>
        </FieldSheet>
      ))}

      {sheet('BOMSheet', (
        <BOMSheet active label="BOM" footer={footer(23, 1)}>
          <span slot="eyebrow">Drivetrain</span>
          <span slot="title">What it is made of</span>
          <PartCallout>
            <Cutout slot="media" ground="shelf" width={180} height={140} file="cots-gearbox.png" />
            <span slot="name">MAXPlanetary, 3 stage</span>
            <span slot="vendor">REV Robotics</span>
            <span slot="pn">REV-21-2100</span>
            <span slot="price">$74.00</span>
            <span slot="note">Two per side. Order the 12 tooth pinion separately.</span>
          </PartCallout>
          <PartCallout>
            <Cutout slot="media" ground="shelf" width={180} height={140} file="cots-wheel.png" />
            <span slot="name">Colson wheel, 4 in</span>
            <span slot="vendor">AndyMark</span>
            <span slot="pn">am-0952</span>
            <span slot="price">$14.50</span>
            <span slot="note">Eight per robot, plus two spares in the pit.</span>
          </PartCallout>
          <SpecTable slot="totals">
            <span slot="caption">Totals</span>
            <SpecRow><span slot="label">Subtotal</span><span slot="value">$412.00</span></SpecRow>
            <SpecRow><span slot="label">Shipping</span><span slot="value">$38.00</span></SpecRow>
            <SpecRow emphasis><span slot="label">Total</span><span slot="value">$450.00</span></SpecRow>
          </SpecTable>
          <div slot="aside">
            <Callout tone="warn"><span slot="title">Lead time</span><p className="frc-callout-text">Ten days on the gearboxes. Order before Friday or week five slips.</p></Callout>
          </div>
        </BOMSheet>
      ))}

      {sheet('AwardSheet', (
        <AwardSheet active label="Award" footer={footer(24, 3)}>
          <span slot="eyebrow">Los Angeles regional</span>
          <span slot="title">What we brought home</span>
          <AwardPlate slot="plate">
            <span slot="eyebrow">Los Angeles regional</span>
            <span slot="name">Industrial Design Award</span>
            <span slot="event">Presented by General Motors</span>
            <span slot="year">2026</span>
          </AwardPlate>
          <ResultBanner tone="win"><span slot="tag">Win</span><span slot="title">Quarterfinal 2</span><span slot="note">Red alliance</span><span slot="score">88 - 74</span></ResultBanner>
          <ResultBanner><span slot="tag">Rank</span><span slot="title">Seeded fourth of 42</span><span slot="note">Selected first round</span><span slot="score">2.41</span></ResultBanner>
          <div className="frc-readout-stack">
            <Readout tone="ok"><span slot="label">Inspection</span><span slot="value">Passed, first pass</span></Readout>
            <Readout><span slot="label">Matches played</span><span slot="value">12</span></Readout>
          </div>
        </AwardSheet>
      ))}

      {sheet('SponsorSheet', (
        <SponsorSheet active label="Sponsors" footer={footer(25, 3)}>
          <span slot="eyebrow">Thank you</span>
          <span slot="title">Who pays for this</span>
          <span slot="thanks">Sponsorship bought the practice field, the second charger, and the bus to Ventura. Thirty-eight students used all three.</span>
          <SponsorWall>
            <SponsorTier>
              <span slot="name">Lead sponsors</span>
              <Cutout ground="none" width={260} height={110} file="sponsor-lead-1.png" />
              <Cutout ground="none" width={260} height={110} file="sponsor-lead-2.png" />
            </SponsorTier>
            <SponsorTier>
              <span slot="name">Supporting</span>
              <Cutout ground="none" width={180} height={80} file="sponsor-1.png" />
              <Cutout ground="none" width={180} height={80} file="sponsor-2.png" />
              <Cutout ground="none" width={180} height={80} file="sponsor-3.png" />
            </SponsorTier>
          </SponsorWall>
        </SponsorSheet>
      ))}

      {sheet('SeasonSheet', (
        <SeasonSheet active label="Season" footer={footer(26, 3)}>
          <span slot="eyebrow">The season</span>
          <span slot="title">2026-27</span>
          <SeasonLockup slot="lockup" years="2026-27">Biocore</SeasonLockup>
          <StatBlock slot="stat" tone="hero"><span slot="value">5669</span><span slot="label">Techmen, Don Bosco Technical Institute</span></StatBlock>
          <StatBlock slot="stat" size="sm"><span slot="value">38</span><span slot="label">Students on the roster</span></StatBlock>
          <StatBlock slot="stat" size="sm"><span slot="value">3</span><span slot="label">Events entered</span></StatBlock>
        </SeasonSheet>
      ))}

      {only && only.includes('DecisionMatrix reference') ? (
        <Stage name="ComparisonSheet, matrix variant">
          <ComparisonSheet active label="Comparison, matrix" footer={footer(11, 1)}>
            <span slot="eyebrow">Intake geometry</span>
            <span slot="title">Weighted, not argued</span>
            <DecisionMatrix weights={[3, 2, 2, 1]} scores={[[4, 3, 5, 4], [5, 2, 3, 2], [2, 5, 4, 5]]}>
              <span slot="caption">Weighted 3 / 2 / 2 / 1</span>
              <span slot="criterion">Cycle time</span><span slot="criterion">Build hours</span>
              <span slot="criterion">Reliability</span><span slot="criterion">Cost</span>
              <span slot="option">Over the bumper</span><span slot="option">Under the bumper</span><span slot="option">Ground pickup</span>
            </DecisionMatrix>
          </ComparisonSheet>
        </Stage>
      ) : null}

      {only && only.includes('CalloutDrawing reference') ? (
        <Stage name="SplitSheet, drawing variant">
          <SplitSheet active label="Split, drawing" media="left" weight="media" footer={footer(8, 1)}>
            <span slot="eyebrow">Gearbox</span>
            <span slot="title">What is inside</span>
            <CalloutDrawing slot="media">
              <ImageFrame kind="drawing" ratio="4 / 3" file="gearbox-section.png" />
              <CalloutPin x={26} y={30}><span slot="label">Input pinion</span></CalloutPin>
              <CalloutPin x={62} y={54} side="left"><span slot="label">Output shaft</span></CalloutPin>
              <CalloutPin x={40} y={78}><span slot="label">Bearing block</span></CalloutPin>
            </CalloutDrawing>
            <p className="frc-body">Every pin label is drawn at rest. Clicking one raises it.</p>
          </SplitSheet>
        </Stage>
      ) : null}
    </div>
  )
}

/** The pattern names, in deck order. /_ds and the manifest both read this. */
export const SHEET_PATTERNS = [
  'CoverSheet', 'AgendaSheet', 'SectionSheet', 'StatementSheet', 'QuoteSheet', 'HubSheet', 'ClosingSheet',
  'SplitSheet', 'GallerySheet', 'ProcedureSheet', 'ComparisonSheet', 'DataSheet', 'TimelineSheet', 'ScheduleSheet',
  'SubteamStatusSheet', 'BlockerSheet', 'TargetsSheet', 'SafetySheet', 'RosterSheet', 'MatchBreakdownSheet',
  'ScoutingSheet', 'FieldSheet', 'BOMSheet', 'AwardSheet', 'SponsorSheet', 'SeasonSheet',
]
