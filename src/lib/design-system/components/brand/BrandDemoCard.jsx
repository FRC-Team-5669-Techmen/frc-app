// @dsCard group="Brand" name="Brand components" subtitle="Marks, footer rail, program and season lockups, FirstName, HudFrame, PlatePanel, StencilTitle"
import { GROUND_CLASSES, AUDIENCE_CLASSES } from '../../tokens.js'
import { cx } from '../cx.js'
import { Eyebrow } from '../core/Eyebrow.jsx'
import { SealMark } from './SealMark.jsx'
import { MarkGlyph } from './MarkGlyph.jsx'
import { Logotype } from './Logotype.jsx'
import { DeckFooter } from './DeckFooter.jsx'
import { ProgramLockup } from './ProgramLockup.jsx'
import { SeasonLockup } from './SeasonLockup.jsx'
import { FirstName, FirstNameScope } from './FirstName.jsx'
import { HudFrame } from './HudFrame.jsx'
import { PlatePanel } from './PlatePanel.jsx'
import { StencilTitle } from './StencilTitle.jsx'

const section = { display: 'grid', gap: 20 }
const row = { display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }
const PARTS = ['Brief', 'Roster', 'Quals', 'Mission', 'Muster']

/**
 * BrandDemoCard — the one demo card for components/brand. Mounts the REAL
 * components. The FirstName block runs inside its own FirstNameScope so the
 * first-use ® is demonstrated per card, with audience internal so refused
 * forms show their fault marker instead of throwing.
 */
export function BrandDemoCard({ ground = 'squadron', audience = 'internal', run = false, className, ...rest }) {
  return (
    <div
      className={cx('frc-deck', GROUND_CLASSES[ground] ?? GROUND_CLASSES.squadron, AUDIENCE_CLASSES[audience] ?? AUDIENCE_CLASSES.internal, run && 'frc-run', 'frc-demo-card', className)}
      data-card="brand"
      data-ground={ground}
      data-audience={audience}
      style={{ padding: 48, display: 'grid', gap: 56 }}
      {...rest}
    >
      <section style={section}>
        <Eyebrow>Marks — empty slots until the SVGs land</Eyebrow>
        <div style={row}>
          <SealMark />
          <MarkGlyph variant="gold" size={96} />
          <MarkGlyph variant="white" size={96} />
          <MarkGlyph variant="black" size={96} />
          <MarkGlyph variant="auto" size={96} />
          <Logotype variant="gold" height={48} />
          <Logotype variant="auto" height={48} />
        </div>
      </section>

      <section style={section}>
        <Eyebrow>DeckFooter — internal, then external (FIRST logo zone)</Eyebrow>
        <div style={{ position: 'relative', height: 120, overflow: 'hidden' }} className="frc-hairline">
          <DeckFooter deckName="Kickoff brief" parts={PARTS} partIndex={1} sheet={4} total={18} />
        </div>
        <div style={{ position: 'relative', height: 120, overflow: 'hidden' }} className="frc-hairline">
          <DeckFooter deckName="Sponsor review" parts={PARTS} partIndex={3} sheet={12} total={18} audience="external" />
        </div>
      </section>

      <section style={section}>
        <Eyebrow>ProgramLockup</Eyebrow>
        <div style={{ ...row, alignItems: 'flex-start' }}>
          <ProgramLockup program="frc" />
          <ProgramLockup program="ftc" />
          <ProgramLockup program="fll" />
          <ProgramLockup program="frc" orientation="vertical" />
        </div>
      </section>

      <section style={section}>
        <Eyebrow>SeasonLockup</Eyebrow>
        <SeasonLockup years="2026-27">Biocore</SeasonLockup>
      </section>

      <FirstNameScope audience="internal">
        <section style={section}>
          <Eyebrow>FirstName — first use per channel carries the registered mark</Eyebrow>
          <h2 className="frc-h2">Welcome to <FirstName channel="heading" /> season</h2>
          <p className="frc-body">
            Team 5669 competes in the <FirstName>FIRST Robotics Competition</FirstName>. Our <FirstName program="fll" /> teams
            start in the fall, and the <FirstName program="ftc" /> pathway is under review. A second mention of <FirstName /> carries no mark.
          </p>
          <p className="frc-body">
            Refused forms render a fault, never the text: <FirstName>{"FIRST's"}</FirstName> and <FirstName>FIRSTs</FirstName> and <FirstName>FIRST Robotics Competitions</FirstName>.
          </p>
        </section>
      </FirstNameScope>

      <section style={section}>
        <Eyebrow>HudFrame</Eyebrow>
        <HudFrame label="Fig 3 — drive base" readout="1:1 scale">
          <svg viewBox="0 0 640 240" width="640" height="240" aria-hidden="true" style={{ display: 'block', color: 'var(--fg-dim)' }}>
            <g fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="40" y="40" width="560" height="160" rx="4" />
              <line x1="40" y1="120" x2="600" y2="120" strokeDasharray="8 8" />
              <circle cx="120" cy="120" r="40" />
              <circle cx="520" cy="120" r="40" />
              <line x1="320" y1="40" x2="320" y2="200" />
            </g>
          </svg>
        </HudFrame>
      </section>

      <section style={section}>
        <Eyebrow>PlatePanel — auto rises on SQUADRON, recesses on FIELD, flat on paper</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 32 }}>
          <PlatePanel>
            <Eyebrow tone="accent">Auto</Eyebrow>
            <p className="frc-body">The ground chooses the treatment.</p>
          </PlatePanel>
          <PlatePanel treatment="plate" rivets>
            <Eyebrow tone="accent">Plate, riveted</Eyebrow>
            <p className="frc-body">Forced rise with the seam.</p>
          </PlatePanel>
          <PlatePanel treatment="well">
            <Eyebrow tone="accent">Well</Eyebrow>
            <p className="frc-body">Forced recess.</p>
          </PlatePanel>
          <PlatePanel pad="tight">
            <Eyebrow tone="accent">Tight</Eyebrow>
            <p className="frc-body">Less padding.</p>
          </PlatePanel>
        </div>
      </section>

      <section style={section}>
        <Eyebrow>StencilTitle</Eyebrow>
        <StencilTitle>Standing orders</StencilTitle>
        <StencilTitle as="h2" size="display" caps>Muster</StencilTitle>
        <StencilTitle as="h3" bridge={false} glow={false}>No bridge, no glow</StencilTitle>
      </section>
    </div>
  )
}
