// @dsCard group="Surfaces" name="Surface components" subtitle="Cards, callouts, safety, image treatments, steps, comparisons, grids, drawings, sponsors, awards"
import { useLayoutEffect, useRef, useState } from 'react'
import { GROUND_CLASSES } from '../../tokens.js'
import { cx } from '../cx.js'
import { Card } from './Card.jsx'
import { Callout } from './Callout.jsx'
import { SafetyNote } from './SafetyNote.jsx'
import { ImageFrame } from './ImageFrame.jsx'
import { Cutout } from './Cutout.jsx'
import { StepCard, Step } from './StepCard.jsx'
import { ProcessPipeline, PipelineStep } from './ProcessPipeline.jsx'
import { CompareSplit, CompareRow } from './CompareSplit.jsx'
import { SampleGrid, Sample } from './SampleGrid.jsx'
import { JumpGrid, JumpCard } from './JumpGrid.jsx'
import { CalloutDrawing, CalloutPin } from './CalloutDrawing.jsx'
import { QuoteBlock } from './QuoteBlock.jsx'
import { RoleCard } from './RoleCard.jsx'
import { PartCallout } from './PartCallout.jsx'
import { FieldDiagram } from './FieldDiagram.jsx'
import { SponsorWall, SponsorTier } from './SponsorWall.jsx'
import { AwardPlate } from './AwardPlate.jsx'
import { ResultBanner } from './ResultBanner.jsx'
import { Eyebrow } from '../core/Eyebrow.jsx'
import { Badge } from '../data/Badge.jsx'
import { Chip } from '../data/Chip.jsx'
import { SubteamBadge } from '../data/SubteamBadge.jsx'
import { IconTriangleAlert, IconCheck, IconWrench } from '../core/icons.jsx'

const section = { display: 'grid', gap: 20 }
const two = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'start' }

/**
 * A generic head-and-shoulders silhouette, drawn at runtime in whatever the
 * ground resolves --fg-structure to, so the FILLED RoleCard media slot below is
 * genuinely filled without inventing a color and without standing a team mark
 * in for a member's photo. Same trick the specimen's alpha-PNG proof uses.
 */
function useSilhouette() {
  const ref = useRef(null)
  const [src, setSrc] = useState(null)
  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    const ink = getComputedStyle(host).getPropertyValue('--fg-structure').trim()
    if (!ink) return
    const size = 240
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.arc(size / 2, size * 0.36, size * 0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(size / 2, size * 0.98, size * 0.32, size * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
    setSrc(c.toDataURL('image/png'))
  }, [])
  return [ref, src]
}

/** Field zone geometry. Structure, not copy: no one reads a point list aloud. */
const ZONES = [
  { id: 'red-source', alliance: 'red', points: '0,0 300,0 300,300 0,300', at: [9, 19] },
  { id: 'red-amp', alliance: 'red', points: '0,500 300,500 300,800 0,800', at: [9, 81] },
  { id: 'neutral', points: '620,0 980,0 980,800 620,800', at: [50, 50] },
  { id: 'blue-source', alliance: 'blue', points: '1300,0 1600,0 1600,300 1300,300', at: [91, 19] },
  { id: 'blue-amp', alliance: 'blue', points: '1300,500 1600,500 1600,800 1300,800', at: [91, 81] },
]

/**
 * SurfacesDemoCard - the one demo card for components/surfaces. Mounts the REAL
 * components. Image slots stay empty until artwork lands; the empty state is
 * part of what this card is showing.
 */
export function SurfacesDemoCard({ ground = 'squadron', run = false, className, ...rest }) {
  const [groundRef, portrait] = useSilhouette()
  return (
    <div
      ref={groundRef}
      className={cx('frc-deck', GROUND_CLASSES[ground] ?? GROUND_CLASSES.squadron, run && 'frc-run', 'frc-demo-card', className)}
      data-card="surfaces"
      data-ground={ground}
      style={{ padding: 48, display: 'grid', gap: 56 }}
      {...rest}
    >
      <section style={section}>
        <Eyebrow>Card, Callout, SafetyNote</Eyebrow>
        <div style={two}>
          <Card>
            <span slot="title">Standing orders</span>
            <span slot="meta">Posted Monday</span>
            <p className="frc-card-body">Shop opens at 15:30. Tag in at the door, tag out when you leave, and put the tool back where the shadow is.</p>
            <span slot="foot"><Badge tone="ok">Posted</Badge></span>
          </Card>
          <div style={{ display: 'grid', gap: 20 }}>
            <Callout icon={<IconCheck />}><span slot="title">Cleared</span><p className="frc-callout-text">Drivetrain passed inspection with the practice bumpers on.</p></Callout>
            <Callout tone="warn" icon={<IconTriangleAlert />}><span slot="title">Deadline</span><p className="frc-callout-text">Chairmans submission closes Thursday at 15:00 Pacific.</p></Callout>
            <Callout tone="fault"><span slot="title">Blocked</span><p className="frc-callout-text">Climber geometry is waiting on a field measurement.</p></Callout>
          </div>
        </div>
        <SafetyNote>
          <p>The mill is a two-person tool. Nobody runs it alone, and nobody runs it without a mentor in the shop.</p>
          <li slot="rule">Eye protection from the door, not from the machine.</li>
          <li slot="rule">Long hair tied back, sleeves down, no gloves at the spindle.</li>
          <li slot="rule">Stock clamped before the spindle turns. Every time.</li>
          <Chip slot="ppe">Eye protection</Chip>
          <Chip slot="ppe">Closed shoes</Chip>
          <Chip slot="ppe">Hearing protection</Chip>
        </SafetyNote>
      </section>

      <section style={section}>
        <Eyebrow>ImageFrame - three shapes, then bleed</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 40, alignItems: 'start' }}>
          <ImageFrame kind="screenshot" ratio="16 / 10" file="scouting-app.png"><span slot="caption">Screenshot, hard edge</span></ImageFrame>
          <ImageFrame kind="render" ratio="4 / 3" file="drivetrain-render.png"><span slot="caption">Render, brackets</span></ImageFrame>
          <ImageFrame kind="portrait" file="member-portrait.jpg"><span slot="caption">Portrait, round</span></ImageFrame>
          <ImageFrame kind="photo" bleed="right" ratio="4 / 3" file="pit-photo.jpg"><span slot="caption">Photo, bleeding right</span></ImageFrame>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>Cutout - three grounds</Eyebrow>
        <div style={{ display: 'flex', gap: 64, alignItems: 'flex-end' }}>
          <Cutout ground="shadow" width={220} height={200} file="gearbox.png"><span slot="caption">shadow</span></Cutout>
          <Cutout ground="shelf" width={220} height={200} file="wheel.png"><span slot="caption">shelf</span></Cutout>
          <Cutout ground="none" width={220} height={200} file="sponsor-mark.png"><span slot="caption">none</span></Cutout>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>StepCard, ProcessPipeline</Eyebrow>
        <StepCard>
          <Step state="done"><span slot="title">Square the stock</span><span slot="text">Face one side, then the adjacent edge. Deburr before it goes in the vise again.</span></Step>
          <Step state="current"><span slot="title">Locate the datum</span><span slot="text">Edge find both walls, zero the readout, write the offsets on the traveller.</span></Step>
          <Step><span slot="title">Cut the pocket</span><span slot="text">Rough at depth minus 0.020, finish in one pass, then check with the caliper.</span></Step>
        </StepCard>
        <ProcessPipeline>
          <PipelineStep state="done"><span slot="title">Design</span><span slot="note">CAD released</span></PipelineStep>
          <PipelineStep state="done"><span slot="title">Cut</span><span slot="note">Router queue</span></PipelineStep>
          <PipelineStep state="current"><span slot="title">Assemble</span><span slot="note">On the fixture</span></PipelineStep>
          <PipelineStep><span slot="title">Wire</span><span slot="note">Waiting</span></PipelineStep>
          <PipelineStep state="blocked"><span slot="title">Test</span><span slot="note">Needs a field element</span></PipelineStep>
        </ProcessPipeline>
      </section>

      <section style={section}>
        <Eyebrow>CompareSplit, SampleGrid, JumpGrid</Eyebrow>
        <CompareSplit>
          <span slot="label">Criterion</span>
          <span slot="option-a">Belt drive</span>
          <span slot="option-b">Chain drive</span>
          <CompareRow lead="a"><span slot="label">Maintenance</span><span slot="a">No tensioning mid-event</span><span slot="b">Check tension every match</span></CompareRow>
          <CompareRow lead="b"><span slot="label">Shock load</span><span slot="a">Skips a tooth under impact</span><span slot="b">Takes the hit</span></CompareRow>
          <CompareRow><span slot="label">Cost</span><span slot="a">Comparable</span><span slot="b">Comparable</span></CompareRow>
        </CompareSplit>
        <SampleGrid cols={4}>
          <Sample><span slot="name">6061 bare</span><span slot="note">Shop stock, milled finish</span></Sample>
          <Sample><span slot="name">Anodized gold</span><span slot="note">Vendor lead time two weeks</span></Sample>
          <Sample><span slot="name">Powder black</span><span slot="note">In house, one day cure</span></Sample>
          <Sample><span slot="name">Printed PETG</span><span slot="note">Prototype only</span></Sample>
        </SampleGrid>
        <JumpGrid cols={3}>
          <JumpCard href="#brief"><span slot="title">Brief</span><span slot="note">Where the season stands</span></JumpCard>
          <JumpCard href="#roster" state="done"><span slot="title">Roster</span><span slot="note">Who is on what</span></JumpCard>
          <JumpCard href="#quals"><span slot="title">Quals</span><span slot="note">Match review</span></JumpCard>
        </JumpGrid>
      </section>

      <section style={section}>
        <Eyebrow>CalloutDrawing, FieldDiagram</Eyebrow>
        <div style={two}>
          <CalloutDrawing>
            <ImageFrame kind="drawing" ratio="4 / 3" file="gearbox-section.png" />
            <CalloutPin x={26} y={30}><span slot="label">Input pinion</span></CalloutPin>
            <CalloutPin x={62} y={54} side="left"><span slot="label">Output shaft</span></CalloutPin>
            <CalloutPin x={40} y={78}><span slot="label">Bearing block</span></CalloutPin>
            <span slot="caption">Every label is drawn at rest. Clicking a pin raises it.</span>
          </CalloutDrawing>
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
        </div>
      </section>

      <section style={section}>
        <Eyebrow>QuoteBlock, RoleCard, PartCallout</Eyebrow>
        <QuoteBlock>
          <span slot="text">They did not hand us a finished robot. They handed us a shop and told us what good work looks like.</span>
          <span slot="attr">Senior, class of 2026</span>
          <span slot="role">Drive coach</span>
        </QuoteBlock>
        <div style={two}>
          <RoleCard mediaFile="rivera-portrait.png">
            <Cutout slot="media" ground="none" src={portrait} alt="" width={160} height={160} />
            <span slot="name">A. Rivera</span>
            <span slot="title">Drive coach, class of 2027</span>
            <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
            <SubteamBadge slot="subteam">Mechanical</SubteamBadge>
            <li slot="cert" data-status="certified" data-safety>Mill</li>
            <li slot="cert" data-status="certified">Bandsaw</li>
            <li slot="cert" data-status="in_progress">Lathe</li>
            <p slot="note">Calls the match and runs the pit checklist before every queue.</p>
          </RoleCard>
          <PartCallout>
            <Cutout slot="media" ground="shelf" width={200} height={160} file="cots-gearbox.png" />
            <span slot="name">MAXPlanetary, 3 stage</span>
            <span slot="vendor">REV Robotics</span>
            <span slot="pn">REV-21-2100</span>
            <span slot="price">$74.00</span>
            <span slot="note">Two per drivetrain side. Order the 12 tooth pinion separately.</span>
          </PartCallout>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>RoleCard density, filled and empty media</Eyebrow>
        {/* density="compact" - six or more on one sheet. The card sets its own
            type scale, padding and gaps, and frc-role-grid sets the columns and
            the gutter, so NOTHING here writes font-size, padding, gap or
            gridTemplateColumns. That is the whole point of the pair: the deck
            that had to hand-write all four is what this replaces. The first
            card's media slot is FILLED, the rest are EMPTY and render the
            system's marked empty slot rather than a collapsed box. */}
        <div className="frc-role-grid">
          <RoleCard density="compact" mediaFile="rivera-portrait.png">
            <Cutout slot="media" ground="none" src={portrait} alt="" width={120} height={120} />
            <span slot="name">A. Rivera</span>
            <span slot="title">Drive coach</span>
            <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
            <li slot="cert" data-status="certified" data-safety>Mill</li>
            <li slot="cert" data-status="certified">Bandsaw</li>
            <p slot="note">Calls the match.</p>
          </RoleCard>
          <RoleCard density="compact" mediaFile="okonkwo-portrait.png">
            <span slot="name">D. Okonkwo</span>
            <span slot="title">Lead programmer</span>
            <SubteamBadge slot="subteam">Programming</SubteamBadge>
            <li slot="cert" data-status="certified">Auto tuning</li>
            <li slot="cert" data-status="in_progress">Vision</li>
            <p slot="note">Owns the auto routines.</p>
          </RoleCard>
          <RoleCard density="compact" mediaFile="vargas-portrait.png">
            <span slot="name">M. Vargas</span>
            <span slot="title">Safety captain</span>
            <SubteamBadge slot="subteam">Field &amp; Pit</SubteamBadge>
            <li slot="cert" data-status="certified" data-safety>Shop lead</li>
            <li slot="cert" data-status="certified">First aid</li>
            <p slot="note">Signs off the pit before inspection.</p>
          </RoleCard>
          <RoleCard density="compact">
            <span slot="name">S. Bakhsh</span>
            <span slot="title">Fabrication</span>
            <SubteamBadge slot="subteam">Fabrication</SubteamBadge>
            <li slot="cert" data-status="in_progress" data-safety>Lathe</li>
            <p slot="note">No photo on file yet.</p>
          </RoleCard>
          <RoleCard density="compact">
            <span slot="name">T. Nguyen</span>
            <span slot="title">Scouting</span>
            <SubteamBadge slot="subteam">Strategy and Scouting</SubteamBadge>
            <li slot="cert" data-status="certified">Scout lead</li>
            <p slot="note">Runs the stands laptop.</p>
          </RoleCard>
          <RoleCard density="compact">
            <span slot="name">J. Park</span>
            <span slot="title">Media</span>
            <SubteamBadge slot="subteam">Media</SubteamBadge>
            <li slot="cert" data-status="in_progress">Camera</li>
            <p slot="note">Shoots the build log.</p>
          </RoleCard>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>SponsorWall, AwardPlate, ResultBanner</Eyebrow>
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
        <div style={two}>
          <AwardPlate>
            <span slot="eyebrow">Los Angeles regional</span>
            <span slot="name">Industrial Design Award</span>
            <span slot="event">Presented by General Motors</span>
            <span slot="year">2026</span>
          </AwardPlate>
          <div style={{ display: 'grid', gap: 20 }}>
            <ResultBanner tone="win"><span slot="tag">Win</span><span slot="title">Qualification 42</span><span slot="note">Red alliance</span><span slot="score">88 - 74</span></ResultBanner>
            <ResultBanner tone="loss"><span slot="tag">Loss</span><span slot="title">Quarterfinal 2</span><span slot="note">Blue alliance</span><span slot="score">61 - 70</span></ResultBanner>
            <ResultBanner><span slot="tag">Rank</span><span slot="title">Seeded fourth of 42</span><span slot="note">Selected first round</span><span slot="score">2.41</span></ResultBanner>
          </div>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>Icon reference</Eyebrow>
        <div style={{ display: 'flex', gap: 24, color: 'var(--fg-dim)' }}>
          <IconWrench /><IconCheck /><IconTriangleAlert />
        </div>
      </section>
    </div>
  )
}
