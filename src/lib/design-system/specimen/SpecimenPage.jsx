// /_ds — the dev-guarded specimen route.
// Mounts the REAL components (never a copy of their markup), shows the three
// grounds, the token layer, the type scale, every motion class, the ambient
// layers, the core and brand demo cards, and the deck chrome, and PROVES the
// load-bearing rules in the live browser. Touches no auth and no Supabase.
import { Component, cloneElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Button, Eyebrow, Divider, TeamWordmark,
  IconPlay, IconRotateCcw,
  DeckFooter, DeckStage, FirstName, FirstNameScope, HudFrame, PlatePanel, StencilTitle,
  ImageFrame, Cutout, MatchClock, AllianceSplit, ScoutTable, ScoutRow, SponsorWall, SponsorTier, SafetySheet,
  SafetyNote, Callout, Card, JumpGrid, JumpCard, SectionSheet,
  RoleCard, SubteamBadge,
  GallerySheet, Sample,
  CoreDemoCard, BrandDemoCard, DataDemoCard, SurfacesDemoCard, FormsDemoCard, SheetsDemoCard, SHEET_PATTERNS, tokens,
} from '../index.js'
import { cx } from '../components/cx.js'
import { setHarnessMode } from '../components/guard.jsx'
import { AssetSlotPlaceholders } from '../components/brand/AssetSlot.jsx'
import {
  proveGrounds, scanForGold, scanForNeutralWhite, auditMotionGate, measureStatic, replay, countMounted,
  scanForAlliance, makeAlphaPng, scanCutoutRectangles, readComputed, definePlatformImageSlot, readSlotFrame,
  PLATFORM_WASH, norm, toRgbString, isTransparent,
  scanHiddenContent, scanFirstZoneAmbient, checkTeamIdentification, countSlots, scanOverflow, readTransition, withStaticTransitions,
  sheetKind, measureFill, measureFillAll,
} from './proofs.js'
import './specimen.css'

const { GROUNDS, GROUND_CLASSES, GROUND_ALIASES, AUDIENCE_CLASSES, BRAND, RAMPS, PARTITION, PROGRAM, SEASON_DEFAULT, TYPE_SCALE, FONTS, RADII, MOTION, AMBIENT, VERSION, NAMESPACE } = tokens
const PARTS = ['Brief', 'Roster', 'Quals', 'Mission', 'Muster']

/* Nine members for the compact grid — the count the generated deck choked on.
   Names are placeholder, not roster data: nothing in this route queries. */
const ROLE_ROWS = [
  { name: 'S. Bakhsh', title: 'Fabrication', subteam: 'Fabrication', cert: 'Lathe', status: 'in_progress', safety: true, file: 'bakhsh-portrait', note: 'No photo on file yet.' },
  { name: 'D. Okonkwo', title: 'Lead programmer', subteam: 'Programming', cert: 'Auto tuning', status: 'certified', file: 'okonkwo-portrait', note: 'Owns the auto routines.' },
  { name: 'M. Vargas', title: 'Safety captain', subteam: 'Field & Pit', cert: 'Shop lead', status: 'certified', safety: true, file: 'vargas-portrait', note: 'Signs off the pit before inspection.' },
  { name: 'T. Nguyen', title: 'Scouting', subteam: 'Strategy and Scouting', cert: 'Scout lead', status: 'certified', file: 'nguyen-portrait', note: 'Runs the stands laptop.' },
  { name: 'J. Park', title: 'Media', subteam: 'Media', cert: 'Camera', status: 'in_progress', file: 'park-portrait', note: 'Shoots the build log.' },
  { name: 'R. Silva', title: 'CAD', subteam: 'CAD', cert: 'Onshape', status: 'certified', file: 'silva-portrait', note: 'Keeps the master sketch.' },
  { name: 'K. Adeyemi', title: 'Electrical', subteam: 'Electrical', cert: 'Crimping', status: 'certified', safety: true, file: 'adeyemi-portrait', note: 'Wires the control board.' },
  { name: 'L. Chen', title: 'Business', subteam: 'Business/Outreach', cert: 'Sponsor deck', status: 'in_progress', file: 'chen-portrait', note: 'Writes the sponsor asks.' },
  { name: 'P. Rossi', title: 'Mechanical', subteam: 'Mechanical', cert: 'Bandsaw', status: 'certified', safety: true, file: 'rossi-portrait', note: 'Runs the drivetrain build.' },
]

/* ---------- small route helpers (chrome only; components are never copied) ---------- */

function Section({ id, title, lede, children }) {
  return (
    <section id={id} className="ds-section">
      <div className="ds-section-head">
        <h2 className="ds-section-title">{title}</h2>
        {lede ? <p className="ds-lede">{lede}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Verdict({ state, children }) {
  const cls = state === true ? 'ds-verdict-ok' : state === false ? 'ds-verdict-fail' : 'ds-verdict-pending'
  return <span className={cx('ds-verdict', cls)}>{state === true ? '✓ PASS' : state === false ? 'FAIL' : '…'} {children}</span>
}

function GroundTabs({ value, onChange, extra }) {
  return (
    <div className="ds-tabs">
      {GROUNDS.map((g) => (
        <Button key={g} variant={value === g ? 'primary' : 'ghost'} onClick={() => onChange(g)} aria-pressed={value === g}>{g}</Button>
      ))}
      {extra}
    </div>
  )
}

/** Renders 1920px-wide deck content scaled to the available width. Computed styles are unaffected by the transform. */
function Zoomed({ width = 1920, children }) {
  const outer = useRef(null)
  const inner = useRef(null)
  const [state, setState] = useState({ zoom: 1, height: 0 })
  useLayoutEffect(() => {
    const update = () => {
      if (!outer.current || !inner.current) return
      const zoom = Math.min(1, outer.current.clientWidth / width)
      setState({ zoom, height: inner.current.offsetHeight * zoom })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(outer.current)
    ro.observe(inner.current)
    return () => ro.disconnect()
  }, [width])
  return (
    <div ref={outer} className="ds-zoom" style={{ height: state.height }}>
      <div ref={inner} style={{ width, transform: `scale(${state.zoom})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}

class Boundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) return <pre className="ds-error">Thrown: {String(this.state.error.message)}</pre>
    return this.props.children
  }
}

/* ---------- 1. Grounds ---------- */

function GroundSpecimen({ ground, probeRef }) {
  return (
    <div ref={probeRef} className={cx('frc-deck', GROUND_CLASSES[ground])} data-ground={ground} data-probe style={{ padding: 48, display: 'grid', gap: 32, alignContent: 'start', minHeight: 980 }}>
      <Eyebrow tone="accent">{ground}</Eyebrow>
      <StencilTitle as="h3">Ready room</StencilTitle>
      <p className="frc-body">Body copy in the ground foreground. Metadata in <span className="frc-dim">ash or ink-dim</span>. Gold is never body copy.</p>
      <PlatePanel rivets>
        <Eyebrow>Panel</Eyebrow>
        <p className="frc-body-sm">Rises on SQUADRON, recesses on FIELD, flat on paper.</p>
      </PlatePanel>
      <HudFrame label="Frame" readout="2px">
        <p className="frc-body-sm frc-dim" style={{ margin: 0 }}>Corner brackets take the active hairline.</p>
      </HudFrame>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Button variant="primary" icon={<IconPlay />}>Primary</Button>
        <Button>Secondary</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
      <Divider />
      <TeamWordmark />
      <p className="frc-label">Label · 2026-27 · M:SS</p>
    </div>
  )
}

function GroundsSection() {
  const sq = useRef(null)
  const fl = useRef(null)
  const pp = useRef(null)
  const [result, setResult] = useState(null)
  const run = useCallback(() => {
    if (!sq.current || !fl.current || !pp.current) return
    const grounds = proveGrounds({ squadron: sq.current, field: fl.current, paper: pp.current })
    const gold = scanForGold(pp.current)
    setResult({ grounds, gold })
  }, [])
  useEffect(() => { const t = setTimeout(run, 80); return () => clearTimeout(t) }, [run])
  return (
    <Section
      id="grounds"
      title="Grounds"
      lede="The same component tree in all three scopes. Every alias must resolve to the literal declared in its own scope; a paper alias that still carries a SQUADRON value is the freeze bug, and it is invisible in code review."
    >
      <div className="ds-frame">
        <Zoomed width={1920}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <GroundSpecimen ground="squadron" probeRef={sq} />
            <GroundSpecimen ground="field" probeRef={fl} />
            <GroundSpecimen ground="paper" probeRef={pp} />
          </div>
        </Zoomed>
      </div>
      <div className="ds-proof" data-proof="grounds">
        <div className="ds-proof-head">
          <Verdict state={result ? result.grounds.ok : null}>Alias resolution</Verdict>
          {result ? <span>{result.grounds.counts.checked} computed values across {result.grounds.counts.aliases} aliases × 3 grounds · {result.grounds.counts.failed} mismatched · {result.grounds.counts.frozen} frozen onto paper · {result.grounds.counts.goldOnPaper} gold on paper</span> : null}
          <Verdict state={result ? result.gold.ok : null}>No rendered gold on paper</Verdict>
          {result ? <span>{result.gold.elements} elements + pseudo-elements scanned, {result.gold.offenders.length} offenders</span> : null}
          <Button variant="ghost" icon={<IconRotateCcw />} onClick={run}>Re-measure</Button>
        </div>
        {result ? (
          <details open={!result.grounds.ok}>
            <summary>Alias table (computed values)</summary>
            <table>
              <thead><tr><th>alias</th>{GROUNDS.map((g) => <th key={g}>{g}</th>)}</tr></thead>
              <tbody>
                {result.grounds.rows.map((r) => (
                  <tr key={r.name}>
                    <td><code>{r.name}</code>{r.frozen ? ' FROZEN' : ''}{r.goldOnPaper ? ' GOLD' : ''}</td>
                    {GROUNDS.map((g) => (
                      <td key={g} className={r.cells[g].ok ? 'ds-okcell' : 'ds-fail'}>
                        <code>{r.cells[g].actual || '(unresolved)'}</code>
                        {r.cells[g].ok ? '' : <div>expected <code>{r.cells[g].expected}</code></div>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}
        {result && result.gold.offenders.length ? (
          <table><tbody>{result.gold.offenders.map((o, i) => <tr key={i}><td className="ds-fail">{o.el}</td><td>{o.prop}</td><td><code>{o.value}</code></td></tr>)}</tbody></table>
        ) : null}
      </div>
    </Section>
  )
}

/* ---------- 2. Tokens ---------- */

function Swatch({ name, value }) {
  return (
    <div className="ds-swatch">
      <div className="ds-swatch-chip" style={{ background: value }} />
      <div className="ds-swatch-name">{name}</div>
      <div>{value}</div>
    </div>
  )
}

function TokensSection() {
  const group = (title, obj, prefix = '') => (
    <div className="ds-grid" style={{ gap: 12 }}>
      <Eyebrow>{title}</Eyebrow>
      <div className="ds-grid ds-grid-6">{Object.entries(obj).map(([k, v]) => <Swatch key={k} name={`${prefix}${k}`} value={v} />)}</div>
    </div>
  )
  return (
    <Section id="tokens" title="Token layer" lede="Every color in the system. Never invent a color: if it is not here, it does not exist. The red partition resolves FIRST red, alliance red and the error signal; LIVE is a gold dot.">
      {group('Brand — the five published colors', BRAND)}
      {group('SQUADRON ramp', RAMPS.squadron, 'sq-')}
      {group('FIELD ramp', RAMPS.field, 'fl-')}
      {group('FIELD PAPER', RAMPS.paper, 'fl-')}
      {group('Red partition', PARTITION)}
      {group('Program layer (chrome only)', PROGRAM, 'program-')}
      {group('Season (defaults to gold)', { season: SEASON_DEFAULT })}
      <div className="ds-grid" style={{ gap: 12 }}>
        <Eyebrow>Radii</Eyebrow>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
          {Object.entries(RADII).map(([k, v]) => (
            <div key={k} className="ds-swatch"><div className="ds-swatch-chip" style={{ width: 120, borderRadius: v, background: 'var(--bg2)' }} /><div className="ds-swatch-name">{k}</div><div>{v}</div></div>
          ))}
        </div>
      </div>
    </Section>
  )
}

/* ---------- 3. Type ---------- */

function TypeSection() {
  const rows = [
    ['frc-hero', 'Hero numerals', '2:14'],
    ['frc-display', 'Statement', 'Build season opens'],
    ['frc-h1', 'Sheet title', 'Standing orders for kickoff'],
    ['frc-h2', 'Sub', 'Drive team muster at 07:30'],
    ['frc-h3', 'Sub-sub', 'Quals close Friday'],
    ['frc-body', 'Body', 'Running copy never renders below an 18pt equivalent, because these project into a shop bay.'],
    ['frc-body-sm', 'Body small (floor)', 'The floor. Captions, table cells, footnotes.'],
    ['frc-label', 'Mono label', 'Cycle 3 · Auto 12 · Teleop 44'],
    ['frc-micro', 'Rail micro', 'Part two · Sheet 07'],
  ]
  return (
    <Section id="type" title="Type scale" lede="Space Grotesk for display and body, Space Mono for chrome — a family match, not a substitution. Roboto is quarantined to FIRST-attributed blocks and is never a fallback.">
      <div className="ds-frame" style={{ padding: '0 32px' }}>
        <div className="frc-deck">
          {rows.map(([cls, role, sample]) => (
            <div key={cls} className="ds-type-row">
              <div className="ds-type-meta">{role}<br />.{cls} · {TYPE_SCALE[`--fs-${cls.replace('frc-', '')}`]}</div>
              <div className={cls} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: cls === 'frc-body' ? 'normal' : 'nowrap' }}>{sample}</div>
            </div>
          ))}
          <div className="ds-type-row">
            <div className="ds-type-meta">FIRST-attributed block<br />.frc-first-block · Roboto</div>
            <FirstNameScope>
              <blockquote className="frc-first-block frc-body" style={{ margin: 0 }}>
                Text attributed to <FirstName /> sets in Roboto. Everything else in the deck does not.
              </blockquote>
            </FirstNameScope>
          </div>
        </div>
      </div>
      <div className="ds-proof">
        <div className="ds-proof-head"><span>Font tokens</span></div>
        <table>
          <thead><tr><th>token</th><th>family</th><th>weights</th><th>role</th></tr></thead>
          <tbody>{Object.entries(FONTS).map(([k, f]) => <tr key={k}><td><code>{k}</code></td><td>{f.family}</td><td>{[].concat(f.weight).join(', ')}{f.italic ? ' + italic' : ''}</td><td>{f.role}</td></tr>)}</tbody>
        </table>
      </div>
    </Section>
  )
}

/* ---------- 4. Motion ---------- */

function TransitionLab() {
  const stageRef = useRef(null)
  const [log, setLog] = useState({})
  const [active, setActive] = useState('shutter')
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onStart = (e) => {
      const sheet = e.target.closest ? e.target.closest('.frc-sheet') : null
      if (!sheet) return
      const key = sheet.getAttribute('data-transition')
      setLog((l) => ({ ...l, [key]: { ...(l[key] || {}), [e.animationName + (e.pseudoElement || '')]: { started: performance.now(), ended: null } } }))
    }
    const onEnd = (e) => {
      const sheet = e.target.closest ? e.target.closest('.frc-sheet') : null
      if (!sheet) return
      const key = sheet.getAttribute('data-transition')
      const k = e.animationName + (e.pseudoElement || '')
      setLog((l) => ({ ...l, [key]: { ...(l[key] || {}), [k]: { ...(l[key]?.[k] || { started: null }), ended: performance.now(), elapsed: e.elapsedTime } } }))
    }
    stage.addEventListener('animationstart', onStart)
    stage.addEventListener('animationend', onEnd)
    return () => { stage.removeEventListener('animationstart', onStart); stage.removeEventListener('animationend', onEnd) }
  }, [])
  const play = (name) => {
    const stage = stageRef.current
    if (!stage) return
    setActive(name)
    stage.querySelectorAll('.frc-sheet').forEach((s) => s.removeAttribute('data-deck-active'))
    const el = stage.querySelector(`[data-transition="${name}"]`)
    replay(el)
  }
  const names = ['shutter', 'boot', 'banner', 'cut']
  const allRan = names.every((n) => log[n] && Object.values(log[n]).some((v) => v.ended != null))
  return (
    <div className="ds-grid" style={{ gap: 16 }}>
      <div className="ds-tabs">
        {names.map((n) => <Button key={n} variant={active === n ? 'primary' : 'secondary'} icon={<IconPlay />} onClick={() => play(n)}>{`frc-slide-${n}`}</Button>)}
      </div>
      <div className="ds-frame">
        <Zoomed width={1920}>
          <div ref={stageRef} className="frc-deck frc-ground-squadron frc-stage" data-aspect="4:3" style={{ height: 720 }}>
            {names.map((n) => (
              <section key={n} className={cx('frc-sheet', `frc-slide-${n}`, n === 'boot' && 'frc-ground-field', n === 'cut' && 'frc-ground-paper')} data-transition={n} data-label={n} data-deck-active={n === 'shutter' ? '' : undefined}>
                <div className="frc-ambient frc-ambient-bloom" />
                <div className="frc-sheet-body">
                  <Eyebrow tone="accent">{`frc-slide-${n}`}</Eyebrow>
                  <StencilTitle as="h3" size="display" className="frc-in-rise">{n === 'shutter' ? 'Blade wipe' : n === 'boot' ? 'HUD de-blur' : n === 'banner' ? 'Chevron pass' : 'Quiet beat'}</StencilTitle>
                  <p className="frc-body frc-in-rise frc-d2">{n === 'shutter' ? 'Content, general. A gold rim rides the leading edge.' : n === 'boot' ? 'Data, telemetry, match, chart.' : n === 'banner' ? 'Section divider, statement, quote.' : '0.45s on the ground, then a hard cut.'}</p>
                </div>
                <DeckFooter deckName="Specimen" parts={PARTS} partIndex={names.indexOf(n)} sheet={names.indexOf(n) + 1} total={4} />
              </section>
            ))}
          </div>
        </Zoomed>
      </div>
      <div className="ds-proof" data-proof="transitions">
        <div className="ds-proof-head"><Verdict state={allRan ? true : null}>All four transitions ran</Verdict><span>Press each button; animationstart / animationend are recorded from the real sheet elements.</span></div>
        <div className="ds-transition-log">
          {names.map((n) => (
            <div key={n}><code>frc-slide-{n}</code>: {log[n] ? Object.entries(log[n]).map(([k, v]) => `${k} ${v.ended != null ? `ended (${(v.elapsed ?? 0).toFixed(2)}s)` : 'running'}`).join(' · ') : 'not yet played'}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FakeImage() {
  return (
    <svg className="ds-lab-image" viewBox="0 0 160 100" aria-hidden="true">
      <rect x="0" y="0" width="160" height="100" fill="var(--bg2)" />
      <g fill="none" stroke="var(--fg-dim)" strokeWidth="2">
        <rect x="16" y="16" width="128" height="68" rx="3" />
        <circle cx="52" cy="50" r="18" />
        <path d="M84 70 L108 34 L132 70 Z" />
      </g>
    </svg>
  )
}

function EntranceLab({ classes, kind }) {
  const runRef = useRef(null)
  const staticRef = useRef(null)
  const [stat, setStat] = useState(null)
  const measure = useCallback(() => { if (staticRef.current) setStat(measureStatic(staticRef.current)) }, [])
  useEffect(() => { const t = setTimeout(measure, 80); return () => clearTimeout(t) }, [measure])
  const item = (cls, i) => kind === 'img'
    ? <div className={cx(cls, i != null && `frc-d${Math.min(8, i + 1)}`)} style={{ display: 'block' }}><FakeImage /></div>
    : <div className={cx('ds-lab-item', cls, i != null && `frc-d${Math.min(8, i + 1)}`)}>{cls.replace('frc-in-', '').replace('frc-img-', '')}</div>
  return (
    <div className="ds-grid" style={{ gap: 16 }}>
      <div className="ds-tabs">
        <Button variant="primary" icon={<IconRotateCcw />} onClick={() => replay(runRef.current, 'class')}>Replay (.frc-run)</Button>
        <span className="ds-note">Left: inside .frc-run with stagger frc-d1…d8. Right: the same elements with NO run container — the base state, which is what print, PDF and reduced motion show.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div ref={runRef} className="ds-lab frc-run">
          {classes.map((cls, i) => <div key={cls} className="ds-lab-box"><div className="ds-lab-stage">{item(cls, i)}</div><div className="ds-lab-caption">{cls} · frc-d{Math.min(8, i + 1)}</div></div>)}
        </div>
        <div ref={staticRef} className="ds-lab" data-static>
          {classes.map((cls) => <div key={cls} className="ds-lab-box"><div className="ds-lab-stage">{item(cls)}</div><div className="ds-lab-caption">{cls} · static</div></div>)}
        </div>
      </div>
      <div className="ds-proof">
        <div className="ds-proof-head">
          <Verdict state={stat ? stat.ok : null}>Static copy is the complete end state</Verdict>
          {stat ? <span>{stat.measured} elements measured outside any run container: opacity 1, no transform, no clip-path, no filter, no animation · {stat.offenders.length} offenders</span> : null}
          <Button variant="ghost" onClick={measure}>Re-measure</Button>
        </div>
        {stat && stat.offenders.length ? <table><tbody>{stat.offenders.map((o, i) => <tr key={i}><td className="ds-fail">{o.el}</td><td>{o.problems.join(', ')}</td></tr>)}</tbody></table> : null}
      </div>
    </div>
  )
}

function LoopLab() {
  const runRef = useRef(null)
  return (
    <div className="ds-grid" style={{ gap: 16 }}>
      <div className="ds-tabs"><Button variant="primary" icon={<IconRotateCcw />} onClick={() => replay(runRef.current, 'class')}>Replay loops</Button><span className="ds-note">Maximum one loop per sheet, and not on every sheet. Each animates a layer that is already there.</span></div>
      <div ref={runRef} className="ds-lab frc-run frc-deck frc-ground-squadron">
        {MOTION.loops.map((cls) => (
          <div key={cls} className="ds-lab-box">
            <div className={cx('ds-loop-box', 'frc-plate', cls === 'frc-scanlines' && 'frc-scanlines', cls === 'frc-shimmer' && 'frc-shimmer')}>
              {cls === 'frc-bg-pan' ? <div className="frc-ambient frc-ambient-chevron frc-bg-pan" style={{ clipPath: 'none' }} /> : null}
              {cls === 'frc-drift' ? <div className="frc-ambient frc-ambient-stars frc-drift" style={{ clipPath: 'none', '--tex': 2 }} /> : null}
              {cls === 'frc-pulse' ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><Eyebrow tone="live">Live</Eyebrow></div> : null}
            </div>
            <div className="ds-lab-caption">{cls}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReducedMotionProof() {
  const [gate, setGate] = useState(null)
  const run = useCallback(() => setGate(auditMotionGate()), [])
  useEffect(() => { const t = setTimeout(run, 120); return () => clearTimeout(t) }, [run])
  const prefersReduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <div className="ds-proof" data-proof="motion-gate">
      <div className="ds-proof-head">
        <Verdict state={gate ? gate.ok : null}>Every animation is gated</Verdict>
        {gate ? <span>{gate.sheets} stylesheets carrying frc- rules walked · {gate.animated} animated rules · {gate.ungated.length} outside @media (prefers-reduced-motion: no-preference)</span> : null}
        <span>This browser prefers-reduced-motion: {prefersReduce ? 'reduce' : 'no-preference'}</span>
        <Button variant="ghost" onClick={run}>Re-audit</Button>
      </div>
      {gate && gate.ungated.length ? <table><tbody>{gate.ungated.map((s, i) => <tr key={i}><td className="ds-fail"><code>{s}</code></td></tr>)}</tbody></table> : null}
    </div>
  )
}

function MotionSection() {
  return (
    <Section id="motion" title="Motion" lede="Exactly four slide transitions. Element entrances, image reveals and ambient loops run only inside [data-deck-active] or .frc-run, and only when the viewer does not prefer reduced motion. Base styles are the visible end state.">
      <Eyebrow tone="accent">Slide transitions</Eyebrow>
      <TransitionLab />
      <Eyebrow tone="accent">Element entrances</Eyebrow>
      <EntranceLab classes={MOTION.entrances} kind="text" />
      <Eyebrow tone="accent">Image reveals</Eyebrow>
      <EntranceLab classes={MOTION.reveals} kind="img" />
      <Eyebrow tone="accent">Ambient loops</Eyebrow>
      <LoopLab />
      <Eyebrow tone="accent">Reduced motion</Eyebrow>
      <ReducedMotionProof />
    </Section>
  )
}

/* ---------- 5. Ambient layers ---------- */

function AmbientSection() {
  const [tex, setTex] = useState(1)
  return (
    <Section id="surfaces" title="Ambient texture layers" lede="Static layers from surfaces.css, a separate library from the loops. Stack as <div class=&quot;frc-ambient frc-ambient-NAME&quot;>, scale opacity with --tex from 0 to 2. Every layer is clipped out of the footer rail band (the plate at the bottom of each mini).">
      <label className="ds-tex">--tex <input type="range" min="0" max="2" step="0.1" value={tex} onChange={(e) => setTex(Number(e.target.value))} /> {tex.toFixed(1)}</label>
      {GROUNDS.map((g) => (
        <div key={g} className="ds-grid" style={{ gap: 12 }}>
          <Eyebrow>{g}</Eyebrow>
          <div className="ds-grid ds-grid-4">
            {AMBIENT[g].map((name) => (
              <div key={name} className={cx('frc-deck', GROUND_CLASSES[g], 'ds-mini-stage')} style={{ '--tex': tex }}>
                <div className="frc-sheet" data-deck-active="">
                  <div className={cx('frc-ambient', `frc-ambient-${name}`)} />
                  <span className="ds-mini-label">{name}</span>
                  <div className="ds-mini-rail" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Section>
  )
}

/* ---------- 6/7. Cards ---------- */

function CardSection({ id, title, lede, render }) {
  const [ground, setGround] = useState('squadron')
  const [run, setRun] = useState(true)
  return (
    <Section id={id} title={title} lede={lede}>
      <GroundTabs value={ground} onChange={setGround} extra={<Button variant={run ? 'secondary' : 'ghost'} onClick={() => setRun((r) => !r)} aria-pressed={run}>{run ? 'motion: run' : 'motion: static'}</Button>} />
      <div className="ds-frame"><Zoomed width={1920}>{render(ground, run)}</Zoomed></div>
    </Section>
  )
}

function ExternalEnforcement() {
  const [show, setShow] = useState(false)
  return (
    <div className="ds-proof">
      <div className="ds-proof-head"><span>FirstName on an external audience throws on a refused form</span><Button variant="ghost" onClick={() => setShow((s) => !s)}>{show ? 'Unmount' : 'Mount a possessive inside FirstNameScope audience=external'}</Button></div>
      {show ? (
        <Boundary>
          <FirstNameScope audience="external">
            <p className="frc-body"><FirstName>{"FIRST's"}</FirstName></p>
          </FirstNameScope>
        </Boundary>
      ) : null}
    </div>
  )
}

/* ---------- 7b. Image treatments ---------- */

const PLATE_PROPS = ['background-color', 'border-top-width', 'border-top-color', 'border-radius']

function ImageTreatmentSection() {
  const [ground, setGround] = useState('squadron')
  const ref = useRef(null)
  const [report, setReport] = useState(null)
  const [slotReady, setSlotReady] = useState(false)

  useEffect(() => { setSlotReady(definePlatformImageSlot()) }, [])

  const run = useCallback(() => {
    const root = ref.current
    if (!root) return
    const framed = root.querySelector('[data-frc="ImageFrame"][data-probe="framed"] .frc-frame-plate')
    const bled = root.querySelector('[data-frc="ImageFrame"][data-probe="bleed"] .frc-frame-plate')
    const brack = root.querySelector('[data-frc="ImageFrame"][data-probe="brackets"] .frc-frame-plate')
    const empty = root.querySelector('.frc-frame-empty')
    const slotHost = root.querySelector('image-slot')
    const expected = norm(GROUND_ALIASES[ground]['--surface-viewport'])
    const expectedRgb = toRgbString(expected)
    const plate = framed ? readComputed(framed, PLATE_PROPS) : null
    const bleedPlate = bled ? readComputed(bled, ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'background-color']) : null
    const bleedAfter = bled ? readComputed(bled, ['display', 'background-image'], '::after') : null
    const brackAfter = brack ? readComputed(brack, ['display', 'background-image'], '::after') : null
    const emptyStyle = empty ? readComputed(empty, ['color', 'border-top-style', 'border-top-width', 'background-color']) : null
    const slot = slotHost ? readSlotFrame(slotHost) : null
    setReport({
      ground,
      expected,
      expectedRgb,
      plate,
      backplateOk: Boolean(plate) && plate['background-color'] === expectedRgb,
      bleedPlate,
      bleedAfter,
      brackAfter,
      bleedDropsRim: Boolean(bleedPlate) && ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'].every((k) => bleedPlate[k] === '0px'),
      bleedDropsBrackets: Boolean(bleedAfter) && bleedAfter.display === 'none',
      bracketsPresent: Boolean(brackAfter) && brackAfter.display !== 'none' && brackAfter['background-image'] !== 'none',
      emptyStyle,
      emptyLegible: Boolean(emptyStyle) && emptyStyle['border-top-style'] === 'dashed' && emptyStyle['border-top-width'] !== '0px' && isTransparent(emptyStyle['background-color']),
      slot,
    })
  }, [ground])

  useEffect(() => { const t = setTimeout(run, 120); return () => clearTimeout(t) }, [run, slotReady])

  const ok = report && report.backplateOk && report.bleedDropsRim && report.bleedDropsBrackets && report.bracketsPresent && report.emptyLegible && (!report.slot || report.slot.suppressed)

  return (
    <Section
      id="images"
      title="Image treatments"
      lede="Three treatments, chosen by what the image IS. ImageFrame is opaque content edge to edge and reads its backplate from --surface-viewport, so a ground retints it. bleed feathers one edge and drops the rim and the brackets. A transparent PNG never comes in here."
    >
      <GroundTabs value={ground} onChange={setGround} extra={<Button variant="ghost" onClick={run}>Re-measure</Button>} />
      <div className="ds-frame">
        <Zoomed width={1920}>
          <div ref={ref} className={cx('frc-deck', GROUND_CLASSES[ground])} style={{ padding: 48, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 40, alignItems: 'start' }}>
            <ImageFrame data-probe="framed" kind="screenshot" ratio="16 / 10" file="scouting-app.png">
              <span slot="caption">Screenshot, hard edge</span>
            </ImageFrame>
            <ImageFrame data-probe="brackets" kind="render" ratio="4 / 3" file="drivetrain-render.png">
              <span slot="caption">Render, brackets</span>
            </ImageFrame>
            <ImageFrame data-probe="bleed" kind="photo" bleed="right" ratio="4 / 3" file="pit-photo.jpg">
              <span slot="caption">Photo, bleeding right</span>
            </ImageFrame>
            <ImageFrame data-probe="slot" kind="photo" ratio="4 / 3">
              <image-slot />
              <span slot="caption">Platform image-slot, wash suppressed</span>
            </ImageFrame>
          </div>
        </Zoomed>
      </div>
      <div className="ds-proof" data-proof="images">
        <div className="ds-proof-head">
          <Verdict state={report ? ok : null}>Image treatments on {ground}</Verdict>
          <Button variant="ghost" onClick={run}>Re-measure</Button>
        </div>
        {report ? (
          <table>
            <thead><tr><th>check</th><th>measured</th><th>expected</th></tr></thead>
            <tbody>
              <tr>
                <td className={report.backplateOk ? 'ds-okcell' : 'ds-fail'}>ImageFrame backplate = --surface-viewport</td>
                <td><code>{report.plate ? report.plate['background-color'] : '-'}</code></td>
                <td><code>{report.expectedRgb} ({report.expected})</code></td>
              </tr>
              <tr>
                <td className={report.bracketsPresent ? 'ds-okcell' : 'ds-fail'}>brackets drawn on a render</td>
                <td><code>{report.brackAfter ? `${report.brackAfter.display}, ${report.brackAfter['background-image'] === 'none' ? 'no image' : 'gradients'}` : '-'}</code></td>
                <td><code>rendered</code></td>
              </tr>
              <tr>
                <td className={report.bleedDropsRim ? 'ds-okcell' : 'ds-fail'}>bleed drops the rim ring</td>
                <td><code>{report.bleedPlate ? report.bleedPlate['border-top-width'] : '-'}</code></td>
                <td><code>0px on all four edges</code></td>
              </tr>
              <tr>
                <td className={report.bleedDropsBrackets ? 'ds-okcell' : 'ds-fail'}>bleed drops the corner brackets</td>
                <td><code>{report.bleedAfter ? report.bleedAfter.display : '-'}</code></td>
                <td><code>none</code></td>
              </tr>
              <tr>
                <td className={report.emptyLegible ? 'ds-okcell' : 'ds-fail'}>empty slot legible, no grey wash</td>
                <td><code>{report.emptyStyle ? `${report.emptyStyle['border-top-style']} ${report.emptyStyle['border-top-width']}, bg ${report.emptyStyle['background-color']}` : '-'}</code></td>
                <td><code>dashed hairline, transparent</code></td>
              </tr>
              <tr>
                <td className={report.slot && report.slot.suppressed ? 'ds-okcell' : 'ds-fail'}>image-slot::part(frame) wash suppressed</td>
                <td><code>{report.slot ? report.slot.backgroundColor : 'stub not registered'}</code></td>
                <td><code>transparent (platform paints {PLATFORM_WASH})</code></td>
              </tr>
            </tbody>
          </table>
        ) : null}
        <p className="ds-note">The image-slot element above is a route-only stub of the platform element: same shadow part, same wash. The bundle defines no such element; the stub exists so the override is measured rather than asserted.</p>
      </div>
    </Section>
  )
}

/* ---------- 7c. Cutout ---------- */

function CutoutSection() {
  const ref = useRef(null)
  const [png, setPng] = useState(null)
  const [scan, setScan] = useState(null)
  useEffect(() => {
    const probe = document.createElement('span')
    probe.className = 'frc-deck frc-ground-squadron'
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).getPropertyValue('--fg-structure').trim()
    document.body.removeChild(probe)
    setPng(makeAlphaPng(color || 'gray', 240))
  }, [])
  const run = useCallback(() => {
    if (!ref.current) return
    const subjects = Array.from(ref.current.querySelectorAll('[data-frc="Cutout"]'))
    const results = subjects.map((el) => ({
      ground: el.closest('[data-ground]')?.getAttribute('data-ground'),
      cutoutGround: el.getAttribute('data-ground'),
      filter: norm(getComputedStyle(el.querySelector('.frc-cutout-subject')).filter),
      objectFit: norm(getComputedStyle(el.querySelector('img')).objectFit),
      ...scanCutoutRectangles(el),
    }))
    setScan({ results, ok: results.every((r) => r.ok && r.objectFit === 'contain') })
  }, [])
  useEffect(() => { const t = setTimeout(run, 160); return () => clearTimeout(t) }, [run, png])
  return (
    <Section
      id="cutout"
      title="Cutout"
      lede="Treatment three: an alpha channel. No backplate, no grid, no rectangular overlay, no corner brackets, because a cutout has no rectangle to draw. Every grade is a filter chain on the subject, so each layer follows the silhouette. The image below is a real transparent PNG drawn at runtime."
    >
      <div className="ds-frame">
        <div ref={ref} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {GROUNDS.map((g) => (
            <div key={g} className={cx('frc-deck', GROUND_CLASSES[g])} data-ground={g} style={{ padding: 40, display: 'grid', gap: 28, justifyItems: 'center' }}>
              <Eyebrow tone="accent">{g}</Eyebrow>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
                <Cutout ground="shadow" width={150} height={150} src={png || undefined} alt="" />
                <Cutout ground="shelf" width={150} height={150} src={png || undefined} alt="" />
                <Cutout ground="none" width={150} height={150} src={png || undefined} alt="" />
              </div>
              <p className="frc-label" style={{ textAlign: 'center' }}>shadow · shelf · none</p>
            </div>
          ))}
        </div>
      </div>
      <div className="ds-proof" data-proof="cutout">
        <div className="ds-proof-head">
          <Verdict state={scan ? scan.ok : null}>No rectangle under any cutout, on any ground</Verdict>
          <Button variant="ghost" onClick={run}>Re-scan</Button>
        </div>
        {scan ? (
          <table>
            <thead><tr><th>ground</th><th>cutout</th><th>elements</th><th>rectangle offenders</th><th>hairline rules (legal)</th><th>object-fit</th><th>filter chain</th></tr></thead>
            <tbody>
              {scan.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.ground}</td>
                  <td>{r.cutoutGround}</td>
                  <td>{r.elements}</td>
                  <td className={r.offenders.length ? 'ds-fail' : 'ds-okcell'}>{r.offenders.length ? r.offenders.map((o) => `${o.el} ${o.prop}=${o.value}`).join('; ') : '0'}</td>
                  <td>{r.rules.length ? r.rules.map((o) => `${o.prop} at ${o.height}`).join('; ') : '0'}</td>
                  <td className={r.objectFit === 'contain' ? 'ds-okcell' : 'ds-fail'}>{r.objectFit}</td>
                  <td><code>{r.filter}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Section>
  )
}

/* ---------- 7d. Match clock ---------- */

function ClockSection() {
  const ref = useRef(null)
  const [report, setReport] = useState(null)
  const run = useCallback(() => {
    if (!ref.current) return
    const probe = ref.current
    const cs = getComputedStyle(probe)
    const warn = norm(cs.getPropertyValue('--warn'))
    const fault = norm(cs.getPropertyValue('--fault'))
    const hero = norm(cs.getPropertyValue('--fg-hero'))
    const rows = Array.from(probe.querySelectorAll('[data-frc="MatchClock"]')).map((el) => {
      const time = el.querySelector('.frc-clock-time')
      return {
        phase: el.getAttribute('data-phase'),
        state: el.getAttribute('data-state'),
        text: time.textContent.trim(),
        color: norm(getComputedStyle(time).color),
        shadow: norm(getComputedStyle(time).textShadow),
      }
    })
    const rest = rows.filter((r) => r.state === 'rest')
    const warnRow = rows.find((r) => r.state === 'warn')
    const zeroRow = rows.find((r) => r.state === 'zero')
    setReport({
      rows,
      warn: toRgbString(warn),
      fault: toRgbString(fault),
      hero: toRgbString(hero),
      fullAtRest: rest.length === 2 && rest.some((r) => r.text === '0:20') && rest.some((r) => r.text === '2:20'),
      warnCopper: warnRow ? warnRow.color === toRgbString(warn) : false,
      zeroRust: zeroRow ? zeroRow.color === toRgbString(fault) : false,
      zeroNotAllianceRed: zeroRow ? scanForAlliance(ref.current.querySelector('[data-frc="MatchClock"][data-state="zero"]'), { allowed: [] }).inside.length === 0 : false,
    })
  }, [])
  useEffect(() => { const t = setTimeout(run, 120); return () => clearTimeout(t) }, [run])
  const ok = report && report.fullAtRest && report.warnCopper && report.zeroRust && report.zeroNotAllianceRed
  return (
    <Section
      id="clock"
      title="Match clock"
      lede="Real FRC timing: 0:20 autonomous, then 2:20 teleop, M:SS, at projection scale and silent. The base state is the FULL duration. Copper at the warning threshold; at zero it uses RUST, never alliance red, because a sheet carrying a match clock also carries alliance colors."
    >
      <div className="ds-frame">
        <Zoomed width={1920}>
          <div ref={ref} className="frc-deck frc-ground-field" style={{ padding: 48, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 40 }}>
            <MatchClock phase="auto"><span slot="note">Autonomous at rest</span></MatchClock>
            <MatchClock phase="teleop"><span slot="note">Teleop at rest</span></MatchClock>
            <MatchClock phase="teleop" remaining={22}><span slot="note">Warning window</span></MatchClock>
            <MatchClock phase="teleop" remaining={0}><span slot="note">Zero</span></MatchClock>
          </div>
        </Zoomed>
      </div>
      <div className="ds-proof" data-proof="clock">
        <div className="ds-proof-head">
          <Verdict state={report ? ok : null}>Full duration at rest, copper at the threshold, rust at zero</Verdict>
          <Button variant="ghost" onClick={run}>Re-measure</Button>
        </div>
        {report ? (
          <table>
            <thead><tr><th>phase</th><th>state</th><th>rendered</th><th>color</th><th>glow</th></tr></thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.phase}</td>
                  <td>{r.state}</td>
                  <td className={r.state === 'rest' && (r.text === '0:20' || r.text === '2:20') ? 'ds-okcell' : undefined}>{r.text}</td>
                  <td className={
                    (r.state === 'warn' && r.color === report.warn) || (r.state === 'zero' && r.color === report.fault) || (r.state === 'rest' && r.color === report.hero)
                      ? 'ds-okcell' : 'ds-fail'
                  }>{r.color}</td>
                  <td><code>{r.shadow}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {report ? <p className="ds-note">copper --warn {report.warn} · rust --fault {report.fault} · hero {report.hero}. Alliance red never appears in this table.</p> : null}
      </div>
    </Section>
  )
}

/* ---------- 7e. Alliance containment ---------- */

function AllianceSection() {
  const ref = useRef(null)
  const [ground, setGround] = useState('field')
  const [local, setLocal] = useState(null)
  const [page, setPage] = useState(null)
  const run = useCallback(() => {
    if (ref.current) setLocal(scanForAlliance(ref.current))
    const root = document.querySelector('[data-ds-root]')
    if (root) setPage(scanForAlliance(root))
  }, [])
  useEffect(() => { const t = setTimeout(run, 300); return () => clearTimeout(t) }, [run, ground])
  return (
    <Section
      id="alliance"
      title="The red partition, contained"
      lede="--alliance-red and --alliance-blue are alliance data, never decoration, and only AllianceSplit, ScoutTable and FieldDiagram may reach for them - on the FIELD ground only. Switch the ground below: off FIELD the colors do not resolve at all and the RED / BLUE words carry the meaning."
    >
      <GroundTabs value={ground} onChange={setGround} extra={<Button variant="ghost" onClick={run}>Re-scan</Button>} />
      <div className="ds-frame">
        <Zoomed width={1920}>
          <div ref={ref} className={cx('frc-deck', GROUND_CLASSES[ground])} data-ground={ground} style={{ padding: 48, display: 'grid', gap: 40 }}>
            <AllianceSplit outcome="red">
              <span slot="red-tag">Red alliance</span>
              <span slot="red-score">88</span>
              <span slot="red-teams">5669 · 1678 · 4322</span>
              <span slot="vs">Qual 42</span>
              <span slot="blue-tag">Blue alliance</span>
              <span slot="blue-score">74</span>
              <span slot="blue-teams">254 · 973 · 1671</span>
            </AllianceSplit>
            <ScoutTable>
              <span slot="col">Team</span><span slot="col">Auto</span><span slot="col">Cycles</span>
              <ScoutRow id="s1" alliance="red"><span slot="team">5669</span><span slot="cell">12</span><span slot="cell">7</span></ScoutRow>
              <ScoutRow id="s2" alliance="blue"><span slot="team">254</span><span slot="cell">14</span><span slot="cell">8</span></ScoutRow>
            </ScoutTable>
          </div>
        </Zoomed>
      </div>
      <div className="ds-proof" data-proof="alliance">
        <div className="ds-proof-head">
          <Verdict state={page ? page.ok : null}>No alliance color outside the three named components, anywhere on this page</Verdict>
          {page ? <span>{page.elements} deck elements scanned page-wide · {page.inside.length} legal uses · {page.collisions.length} program-chrome value collisions · {page.offenders.length} leaks · {page.skipped} token-catalogue elements skipped</span> : null}
          <Button variant="ghost" onClick={run}>Re-scan</Button>
        </div>
        {local ? (
          <p className="ds-note">
            On {ground}: {local.inside.length} alliance-colored declarations inside AllianceSplit / ScoutTable
            {local.inside.length === 0 ? ' — off FIELD the aliases fall back to structure tones, which is the expected result.' : '.'}
          </p>
        ) : null}
        {page && page.collisions.length ? (
          <p className="ds-note">
            Documented value collision, not a leak: FIRST LEGO League red is published as the same hex as alliance red, so
            after substitution a computed style cannot tell FLL program chrome from alliance data. The scan resolves it by
            PROGRAM rather than by color — it reads the --program actually in force on the element — which is why
            {' '}{page.collisions.length} declaration(s) below are classified as program chrome and not as leaks:
            {' '}{page.collisions.map((c) => `${c.owner || 'program rail'} (program: ${c.program}, token ${c.programToken})`).join('; ')}.
            The FLL Robot Game has no alliances, so an FLL deck has no legal alliance use and an FRC deck never sets
            --program to an FLL value. This is reported rather than silenced: silencing it would hide the next real leak
            inside a ProgramLockup.
          </p>
        ) : null}
        {page && page.offenders.length ? (
          <table><tbody>{page.offenders.map((o, i) => <tr key={i}><td className="ds-fail">{o.el}</td><td>{o.owner || 'no component'}</td><td>{o.prop}</td><td><code>{o.value}</code></td></tr>)}</tbody></table>
        ) : null}
      </div>
    </Section>
  )
}

/* ---------- 7f. Enforced refusals ---------- */

const REFUSALS = [
  {
    id: 'bleed-screenshot',
    label: 'ImageFrame bleed on a screenshot',
    why: 'A feathered interface capture reads as a rendering fault; the hard edge is what tells the room it is a screen.',
    render: () => <ImageFrame kind="screenshot" bleed="right" file="scouting-app.png" />,
  },
  {
    id: 'cutout-cover',
    label: 'Cutout with fit="cover"',
    why: 'cover crops the silhouette against the slot edge, which is the one reliable way to make an alpha image look framed again.',
    render: () => <Cutout fit="cover" file="gearbox.png" />,
  },
  {
    id: 'safety-no-note',
    label: 'A SafetySheet with no SafetyNote',
    why: 'A safety sheet whose hazard was softened into a normal callout still reads as "safety was covered" from the thumbnail rail.',
    render: () => (
      <div className="frc-deck frc-ground-squadron" style={{ position: 'relative', height: 260 }}>
        <SafetySheet label="Safety" footer={false}>
          <span slot="title">The mill</span>
        </SafetySheet>
      </div>
    ),
  },
  {
    id: 'first-possessive',
    label: 'A possessive form of the FIRST name',
    why: 'The name is never plural or possessive. One guard behaviour now: this used to throw on an external audience and warn otherwise.',
    render: () => <p className="frc-body"><FirstName>{"FIRST's"}</FirstName> season</p>,
  },
  {
    id: 'sponsor-framed',
    label: 'A sponsor mark that is not a floating Cutout',
    why: 'A contact shadow under a corporate logo reads as a rendering error, and a frame fills the alpha region with a backplate.',
    render: () => (
      <SponsorWall>
        <SponsorTier>
          <span slot="name">Lead sponsors</span>
          <Cutout ground="shadow" width={200} height={90} file="sponsor-lead-1.png" />
        </SponsorTier>
      </SponsorWall>
    ),
  },
]

function RefusalsSection() {
  const [open, setOpen] = useState(null)
  const [throwing, setThrowing] = useState(true)
  // The harness flag is what decides throw-vs-marker. Flipping it here is the
  // proof: the SAME component renders a rust marker in a deck and throws here.
  useEffect(() => { setHarnessMode(throwing); return () => setHarnessMode(true) }, [throwing])
  return (
    <Section
      id="refusals"
      title="Invariant guards"
      lede="Five rules are enforced in code rather than written down and hoped for. Every guard RENDERS A VISIBLE RUST FAULT MARKER at run time and THROWS ONLY INSIDE THE DEV HARNESS — a guard that throws during a presentation takes the deck down in front of the room, on the external decks that matter most. Flip the switch to see the same component do both. The marker is not a soft landing: ds:audit fails on one in a template."
    >
      <div className="ds-tabs">
        <Button variant={throwing ? 'primary' : 'ghost'} onClick={() => setThrowing(true)} aria-pressed={throwing}>harness: throws</Button>
        <Button variant={throwing ? 'ghost' : 'primary'} onClick={() => setThrowing(false)} aria-pressed={!throwing}>deck: renders a marker</Button>
      </div>
      {REFUSALS.map((r) => (
        <div key={r.id} className="ds-proof" data-proof={`refusal-${r.id}`}>
          <div className="ds-proof-head">
            <span>{r.label}</span>
            <Button variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Unmount' : 'Mount it'}</Button>
          </div>
          <p className="ds-note">{r.why}</p>
          {open === r.id ? <Boundary key={`${r.id}-${throwing}`}>{r.render()}</Boundary> : null}
        </div>
      ))}
    </Section>
  )
}

/* ---------- 7h. Host transparency ---------- */

/**
 * THE RUNTIME MODEL, AND IT IS A MODEL — SAID PLAINLY.
 *
 * The Claude Design runtime is not available in this harness, so these three
 * wrappers stand in for it. They are built from what the runtime is DESCRIBED to
 * do — wrap the template children of an `x-import` in layout-transparent host
 * nodes — and each one carries a DIFFERENT signal, so the proof does not rest on
 * a single guess about the host's shape:
 *
 *   x-host   a custom element declaring display: contents INLINE
 *   dc-host  a custom element made transparent by a STYLESHEET only, with
 *            nothing readable in its props — the case an inline-style test misses
 *   span     an ordinary element, transparent, carrying the explicit
 *            data-frc-host contract — the case a tag-name test misses
 *
 * Each is mounted twice over: with `slot` hoisted onto the wrapper and with
 * `slot` left on the child inside it, because a runtime may do either and the
 * system must not care which.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. It proves the mechanism holds for a
 * host that declares itself in any of those three ways. It does NOT prove the
 * real runtime's host is one of those three — nobody here can, and if the real
 * host turns out to be an ordinary element made transparent by a stylesheet
 * whose class name we cannot know, `data-frc-host` is the contract that closes
 * it and this section is where that gets measured.
 */
const HOST_KINDS = [
  { id: 'inline', label: 'x-host, display: contents inline', wrap: (child, slot) => <x-host style={{ display: 'contents' }} slot={slot}>{child}</x-host> },
  { id: 'sheet', label: 'dc-host, transparent from a stylesheet only', wrap: (child, slot) => <dc-host slot={slot}>{child}</dc-host> },
  { id: 'contract', label: 'span, data-frc-host contract', wrap: (child, slot) => <span data-frc-host="" style={{ display: 'contents' }} slot={slot}>{child}</span> },
]

/** slot on the WRAPPER, or slot on the CHILD inside it. */
const SLOT_PLACEMENTS = [
  { id: 'on-host', label: 'slot on the host', build: (kind, child) => kind.wrap(child, 'note') },
  { id: 'on-child', label: 'slot on the child inside', build: (kind, child) => kind.wrap(cloneElement(child, { slot: 'note' }), undefined) },
]

const safetyNote = () => (
  <SafetyNote>
    <span slot="title">Mill</span>
    <p className="frc-body-sm">Stock walks if it is not clamped.</p>
    <span slot="rule">Eyes on the cutter, hands on the handles.</span>
  </SafetyNote>
)

/**
 * The cases. `expect: 'pass'` must render the sheet with no fault and no throw;
 * `expect: 'reject'` must still be refused, because looking through a host is
 * not the same as accepting anything.
 */
function hostCases() {
  const out = []
  for (const kind of HOST_KINDS) {
    for (const place of SLOT_PLACEMENTS) {
      out.push({
        id: `${kind.id}-${place.id}`,
        label: `SafetyNote through ${kind.label} · ${place.label}`,
        expect: 'pass',
        node: <SafetySheet label="Safety" footer={false}><span slot="title">The mill</span>{place.build(kind, safetyNote())}</SafetySheet>,
      })
    }
  }
  out.push({
    id: 'direct',
    label: 'SafetyNote as a direct child (the arrangement that already worked)',
    expect: 'pass',
    node: <SafetySheet label="Safety" footer={false}><span slot="title">The mill</span><SafetyNote slot="note"><span slot="title">Mill</span><p className="frc-body-sm">Stock walks if it is not clamped.</p></SafetyNote></SafetySheet>,
  })
  out.push({
    id: 'softened',
    label: 'A Callout through a host — the hazard softened into a normal note',
    expect: 'reject',
    node: <SafetySheet label="Safety" footer={false}><span slot="title">The mill</span><x-host style={{ display: 'contents' }} slot="note"><Callout>Mind the mill.</Callout></x-host></SafetySheet>,
  })
  out.push({
    id: 'buried',
    label: 'A SafetyNote buried inside a Card inside a host — author markup, not a wrapper',
    expect: 'reject',
    node: <SafetySheet label="Safety" footer={false}><span slot="title">The mill</span><x-host style={{ display: 'contents' }} slot="note"><Card>{safetyNote()}</Card></x-host></SafetySheet>,
  })
  out.push({
    id: 'empty',
    label: 'No note at all',
    expect: 'reject',
    node: <SafetySheet label="Safety" footer={false}><span slot="title">The mill</span></SafetySheet>,
  })
  return out
}

/** A deck whose sheets sit inside hosts — what DeckStage and the stylesheet meet. */
function HostedDeck({ probeRef, onPaint }) {
  return (
    <div ref={probeRef} className="frc-deck frc-ground-squadron frc-audience-internal" data-hosted-deck style={{ position: 'relative', height: 300, overflow: 'hidden' }}>
      <DeckStage nav={false} fit={false} thumbs={false} onPaint={onPaint} />
      <div className="frc-stage" data-aspect="4:3" style={{ transform: 'scale(0.2)', transformOrigin: '0 0' }}>
        {/* PAPER on the active sheet on purpose: --bg0 and --edge differ there,
            so a match proves DeckStage read the ACTIVE HOSTED SHEET rather than
            reusing one tone or reading the squadron deck root. */}
        <x-host style={{ display: 'contents' }}>
          <SectionSheet active label="One" className="frc-ground-paper"><span slot="title">One</span></SectionSheet>
        </x-host>
        <dc-host>
          <SectionSheet label="Two"><span slot="title">Two</span></SectionSheet>
        </dc-host>
      </div>
    </div>
  )
}

function HostSection() {
  const [cases] = useState(hostCases)
  const [report, setReport] = useState(null)
  const [painted, setPainted] = useState(null)
  const deckRef = useRef(null)
  const casesRef = useRef(null)
  const slotRef = useRef(null)
  const jumpRef = useRef(null)

  const run = useCallback(() => {
    const root = casesRef.current
    const deck = deckRef.current
    if (!root || !deck) return
    // Guard outcome per case: a rejection is EITHER a thrown error caught by the
    // boundary (harness mode) OR a rust fault marker (deck mode). Both count,
    // and the section does not care which mode the route is in.
    const guards = cases.map((c) => {
      const cell = root.querySelector(`[data-host-case="${c.id}"]`)
      const rejected = Boolean(cell && (cell.querySelector('.ds-error') || cell.querySelector('[data-frc-fault]')))
      const note = Boolean(cell && cell.querySelector('[data-frc="SafetyNote"]'))
      return { ...c, rejected, note, ok: c.expect === 'reject' ? rejected : !rejected && note }
    })

    // The stylesheet end. A hosted sheet under a `>` combinator is not matched
    // at all, so nothing is hidden and every sheet paints on top of every other.
    const stage = deck.querySelector('.frc-stage')
    const sheets = [...stage.querySelectorAll('.frc-sheet')]
    const displays = sheets.map((s) => ({
      active: s.hasAttribute('data-deck-active'),
      display: getComputedStyle(s).display,
      hosted: s.parentElement !== stage,
    }))
    const visibility = displays.every((d) => d.hosted && d.display === (d.active ? 'block' : 'none'))

    // The slotted-copy end: the class must land on the element the author wrote,
    // never on the transparent wrapper, where every box property is lost.
    const slotHost = slotRef.current?.querySelector('x-host')
    const slotInner = slotRef.current?.querySelector('h2')
    const slotOk = Boolean(slotInner && slotInner.classList.contains('frc-sheet-title') && !(slotHost && slotHost.classList.contains('frc-sheet-title')))

    // Positional numbering through hosts: cloning the wrapper hands `index` to
    // something that ignores it, and every card reads Part 01.
    const jumpNums = [...(jumpRef.current?.querySelectorAll('.frc-jump-n') ?? [])].map((n) => n.textContent.trim())
    const jumpOk = jumpNums.join('|') === 'Part 01|Part 02|Part 03'

    setReport({
      guards,
      displays,
      visibility,
      slotOk,
      slotClass: slotInner ? slotInner.className : '(no title element)',
      jumpNums,
      jumpOk,
      hostedSheets: displays.filter((d) => d.hosted).length,
    })
  }, [cases])

  useEffect(() => { const t = setTimeout(run, 60); return () => clearTimeout(t) }, [run])

  const guardsOk = report ? report.guards.every((g) => g.ok) : null
  const stageOk = report ? report.visibility && Boolean(painted) : null
  const all = report ? guardsOk && stageOk && report.slotOk && report.jumpOk : null

  return (
    <Section
      id="host"
      title="Host transparency"
      lede="The Claude Design runtime wraps the template children of an x-import in layout-transparent host nodes, so the child an author wrote is not a direct child of the component it was written inside. Everything below is mounted THROUGH a modelled host — never as a direct child — and measured. The three wrappers carry three different signals and each is mounted with the slot on the wrapper and on the child inside it, because a runtime may do either. This is a MODEL of the runtime, not the runtime: it proves the mechanism holds for a host that declares itself in any of those ways, and cannot prove which one the real runtime uses."
    >
      <div className="ds-tabs"><Verdict state={all}>Host-transparent everywhere it was assumed</Verdict><Button variant="ghost" onClick={run}>Re-measure</Button></div>

      <div className="ds-proof" data-proof="host-guard">
        <div className="ds-proof-head">
          <Verdict state={guardsOk}>The SafetyNote guard passes through a host and still refuses wrong content</Verdict>
        </div>
        <p className="ds-note">A note wrapped by the runtime is the note the author wrote. A note softened into a Callout, or buried inside another component, is different content — and every case marked reject below is still refused.</p>
        <table><tbody>
          {(report?.guards ?? cases.map((c) => ({ ...c }))).map((g) => (
            <tr key={g.id}>
              <td className={g.ok === false ? 'ds-fail' : undefined}>{g.ok == null ? '…' : g.ok ? '✓' : '✗'}</td>
              <td>{g.label}</td>
              <td><code>expect {g.expect}</code></td>
              <td>{g.rejected == null ? '' : g.rejected ? 'refused' : 'rendered'}</td>
            </tr>
          ))}
        </tbody></table>
        <div ref={casesRef} className="ds-host-cases">
          {cases.map((c) => (
            <div key={c.id} data-host-case={c.id} className="ds-host-case">
              <span className="frc-label">{c.label}</span>
              <div className="frc-deck frc-ground-squadron" style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
                <Boundary>{c.node}</Boundary>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ds-proof" data-proof="host-stage">
        <div className="ds-proof-head">
          <Verdict state={stageOk}>DeckStage finds hosted sheets, and the stylesheet still hides the inactive one</Verdict>
        </div>
        <p className="ds-note">Both sheets sit inside a host, so neither is a DOM child of the stage. Filtering stage.children returns nothing and DeckStage then paints nothing; a `&gt;` combinator matches nothing and every sheet paints on top of every other.</p>
        {report ? (
          <table><tbody>
            <tr><td>hosted sheets (not DOM children of the stage)</td><td className={report.hostedSheets === 2 ? undefined : 'ds-fail'}>{report.hostedSheets} of {report.displays.length}</td></tr>
            {report.displays.map((d, i) => <tr key={i}><td>sheet {i + 1}{d.active ? ' (active)' : ''}</td><td><code>display: {d.display}</code></td></tr>)}
            <tr><td>DeckStage painted from the active sheet</td><td>{painted ? <code>--bg0 {painted.bg0} · --edge {painted.edge}</code> : <span className="ds-fail">never painted</span>}</td></tr>
          </tbody></table>
        ) : null}
        <HostedDeck probeRef={deckRef} onPaint={setPainted} />
      </div>

      <div className="ds-proof" data-proof="host-slotted">
        <div className="ds-proof-head">
          <Verdict state={report ? report.slotOk : null}>Slotted copy is painted on the author's element, not on the wrapper</Verdict>
        </div>
        <p className="ds-note">The quiet one. A class on a display: contents host still inherits color and font and silently drops padding, background and border — so the sheet looks nearly right and is not. Measured class: <code>{report?.slotClass ?? '…'}</code></p>
        <div ref={slotRef} className="frc-deck frc-ground-squadron" style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
          <GallerySheet label="Slot" footer={false}>
            <x-host style={{ display: 'contents' }} slot="title"><h2>Title through a host</h2></x-host>
            <x-host style={{ display: 'contents' }} slot="lede"><p>Lede through a host.</p></x-host>
          </GallerySheet>
        </div>
      </div>

      <div className="ds-proof" data-proof="host-index">
        <div className="ds-proof-head">
          <Verdict state={report ? report.jumpOk : null}>Position-derived numbering survives a host</Verdict>
        </div>
        <p className="ds-note">Cloning the wrapper hands `index` to something that ignores it, and every card reads Part 01. Measured: <code>{report ? report.jumpNums.join(' · ') : '…'}</code></p>
        <div ref={jumpRef} className="frc-deck frc-ground-squadron" style={{ padding: 24 }}>
          <JumpGrid cols={3}>
            <x-host style={{ display: 'contents' }}><JumpCard><span slot="title">Brief</span></JumpCard></x-host>
            <dc-host><JumpCard><span slot="title">Roster</span></JumpCard></dc-host>
            <span data-frc-host="" style={{ display: 'contents' }}><JumpCard><span slot="title">Quals</span></JumpCard></span>
          </JumpGrid>
        </div>
      </div>
    </Section>
  )
}

/* ---------- 7g. Sheet patterns ---------- */

const AUDIENCES = ['internal', 'external']

/** The role each pattern's default transition is supposed to match. */
const TRANSITION_ROLE = {
  shutter: 'content, general',
  boot: 'data, telemetry, match, chart',
  banner: 'section divider, statement, quote',
  cut: 'quiet beat',
}
const EXPECTED_TRANSITION = {
  CoverSheet: 'banner', AgendaSheet: 'shutter', SectionSheet: 'banner', StatementSheet: 'banner',
  QuoteSheet: 'banner', HubSheet: 'shutter', ClosingSheet: 'cut', SplitSheet: 'shutter',
  GallerySheet: 'shutter', ProcedureSheet: 'shutter', ComparisonSheet: 'shutter', DataSheet: 'boot',
  TimelineSheet: 'shutter', ScheduleSheet: 'boot', SubteamStatusSheet: 'boot', BlockerSheet: 'boot',
  TargetsSheet: 'boot', SafetySheet: 'shutter', RosterSheet: 'shutter', MatchBreakdownSheet: 'boot',
  ScoutingSheet: 'boot', FieldSheet: 'boot', BOMSheet: 'boot', AwardSheet: 'banner',
  SponsorSheet: 'shutter', SeasonSheet: 'banner',
}

function AudienceTabs({ value, onChange }) {
  return (
    <div className="ds-tabs">
      {AUDIENCES.map((a) => (
        <Button key={a} variant={value === a ? 'primary' : 'ghost'} onClick={() => onChange(a)} aria-pressed={value === a}>
          {`audience: ${a}`}
        </Button>
      ))}
    </div>
  )
}

function SheetsSection() {
  const [ground, setGround] = useState('squadron')
  const [audience, setAudience] = useState('internal')
  const [index, setIndex] = useState(0)
  // Defaults to ALL, so a fresh load mounts every pattern and the wiring count
  // below is the whole registry rather than whichever pattern was on screen.
  const [all, setAll] = useState(true)
  const [ambient, setAmbient] = useState(false)
  const ref = useRef(null)
  const [report, setReport] = useState(null)

  const shown = all ? SHEET_PATTERNS : [SHEET_PATTERNS[index]]

  const run = useCallback(() => {
    const root = ref.current
    if (!root) return
    const rows = withStaticTransitions(root, () => Array.from(root.querySelectorAll('[data-pattern]')).map((fig) => {
      const name = fig.getAttribute('data-pattern')
      const stage = fig.querySelector('.frc-stage')
      const sheet = fig.querySelector('.frc-sheet')
      if (!sheet) return { name, missing: true }
      const hidden = scanHiddenContent(sheet)
      const first = scanFirstZoneAmbient(sheet)
      const team = checkTeamIdentification(sheet)
      const slots = countSlots(sheet)
      const overflow = scanOverflow(stage)
      const transition = readTransition(sheet)
      const expected = EXPECTED_TRANSITION[name]
      return {
        name,
        hidden,
        first,
        team,
        slots,
        overflow,
        transition,
        transitionOk: transition === expected,
        expected,
        ok: hidden.ok && first.ok && team.ok && slots.ok && overflow.ok && transition === expected,
      }
    }))
    setReport({ ground, audience, rows, ok: rows.length > 0 && rows.every((r) => r.ok) })
  }, [ground, audience])

  useEffect(() => { const t = setTimeout(run, 250); return () => clearTimeout(t) }, [run, index, all, ambient])

  return (
    <Section
      id="sheets"
      title="Sheet patterns"
      lede="Twenty-six full-sheet patterns, the architectural core of the system. Every sheet in every deck is one of these; a deck sheet built from raw markup is a defect. Each pattern INHERITS its ground and its audience from the deck - switch the two rows of buttons below and every pattern follows, with no variant and no per-ground branch."
    >
      <GroundTabs
        value={ground}
        onChange={setGround}
        extra={<Button variant={all ? 'secondary' : 'ghost'} onClick={() => setAll((v) => !v)} aria-pressed={all}>{all ? 'showing: all 26' : 'showing: one'}</Button>}
      />
      <div className="ds-tabs">
        <AudienceTabs value={audience} onChange={setAudience} />
        <Button variant={ambient ? 'secondary' : 'ghost'} onClick={() => setAmbient((v) => !v)} aria-pressed={ambient}>
          {ambient ? 'ambient: on' : 'ambient: off'}
        </Button>
      </div>
      {all ? null : (
        <div className="ds-tabs">
          <Button variant="ghost" onClick={() => setIndex((i) => (i + SHEET_PATTERNS.length - 1) % SHEET_PATTERNS.length)}>Prev</Button>
          <select
            className="frc-select"
            style={{ maxWidth: 420 }}
            value={SHEET_PATTERNS[index]}
            onChange={(e) => setIndex(SHEET_PATTERNS.indexOf(e.target.value))}
          >
            {SHEET_PATTERNS.map((p, i) => <option key={p} value={p}>{`${String(i + 1).padStart(2, '0')} · ${p}`}</option>)}
          </select>
          <Button variant="ghost" onClick={() => setIndex((i) => (i + 1) % SHEET_PATTERNS.length)}>Next</Button>
          <span className="ds-note">{`${index + 1} of ${SHEET_PATTERNS.length}`}</span>
        </div>
      )}

      <div className="ds-frame">
        <Zoomed width={1968}>
          <div ref={ref}>
            <SheetsDemoCard ground={ground} audience={audience} only={shown} ambient={ambient} />
          </div>
        </Zoomed>
      </div>

      <div className="ds-proof" data-proof="sheets">
        <div className="ds-proof-head">
          <Verdict state={report ? report.ok : null}>{`Patterns on ${ground} / ${audience}`}</Verdict>
          {report ? <span>{report.rows.length} mounted · hidden content, FIRST zone, team identification, copy in children, overflow, transition</span> : null}
          <Button variant="ghost" onClick={run}>Re-measure</Button>
        </div>
        {report ? (
          <table>
            <thead>
              <tr>
                <th>pattern</th><th>hidden content</th><th>FIRST zone</th><th>5669</th>
                <th>slotted copy</th><th>overflow</th><th>transition</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.name}>
                  <td className={r.ok ? 'ds-okcell' : 'ds-fail'}>{r.name}</td>
                  <td className={r.hidden.ok ? 'ds-okcell' : 'ds-fail'}>
                    {r.hidden.ok ? `0 of ${r.hidden.elements} text elements` : r.hidden.offenders.map((o) => `${o.el} ${o.why}`).join('; ')}
                    {r.hidden.audienceChrome ? ` · ${r.hidden.audienceChrome} audience-chrome switch(es)` : ''}
                    {r.hidden.variantSwitches ? ` · ${r.hidden.variantSwitches} mark-variant switch(es)` : ''}
                  </td>
                  <td className={r.first.ok ? 'ds-okcell' : 'ds-fail'}>
                    {r.first.zone ? `${r.first.layers} ambient layer(s), ${r.first.offenders.length} over the zone` : 'no rail (hub)'}
                  </td>
                  <td className={r.team.ok ? 'ds-okcell' : 'ds-fail'}>
                    {r.team.carriesMark ? (r.team.carriesTeam ? `${r.team.marks} mark(s), 5669 present` : 'MARK WITHOUT 5669') : 'no FIRST mark'}
                  </td>
                  <td className={r.slots.ok ? 'ds-okcell' : 'ds-fail'}>{`${r.slots.slots} slots, ${r.slots.chars} chars`}</td>
                  <td className={r.overflow.ok ? 'ds-okcell' : 'ds-fail'}>{r.overflow.ok ? '0' : r.overflow.offenders.slice(0, 2).map((o) => `${o.el} ${o.over}`).join('; ')}</td>
                  <td className={r.transitionOk ? 'ds-okcell' : 'ds-fail'}>{`${r.transition} (${TRANSITION_ROLE[r.transition] || '?'})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p className="ds-note">
          Hidden content counts every element carrying text whose computed style is display:none, visibility:hidden or opacity:0.
          The audience-chrome switches and the mark-variant switches are counted separately: the first is a deck-level mode on the deck root,
          the second is one mark shipped in its published gold and black artwork with the ground picking which renders. Neither is a sheet&apos;s subject matter.
          The FIRST zone check is geometric - each ambient layer&apos;s painted box, after its clip-path, must not intersect the logo zone.
          Every measurement here is taken with the sheet transitions suspended, so it measures the guaranteed base state rather than a frame of an entrance.
        </p>
      </div>
    </Section>
  )
}

/* ---------- 8. Deck chrome ---------- */

function SheetFillSection() {
  const [ground, setGround] = useState('squadron')
  const ref = useRef(null)
  const [report, setReport] = useState(null)
  const [png, setPng] = useState(null)

  // A real image for the filled media slot, drawn at runtime in whatever this
  // ground resolves --fg-structure to, so the route holds no literal color and
  // no team mark stands in for a member's photo. Same helper the Cutout and
  // RoleCard density proofs use.
  useEffect(() => {
    const probe = document.createElement('span')
    probe.className = cx('frc-deck', GROUND_CLASSES[ground])
    document.body.appendChild(probe)
    const ink = getComputedStyle(probe).getPropertyValue('--fg-structure').trim()
    document.body.removeChild(probe)
    setPng(makeAlphaPng(ink || 'gray', 240))
  }, [ground])

  const run = useCallback(() => {
    const root = ref.current
    if (!root) return
    // Measure the guaranteed base state: the sheets carry entrance animations
    // and this pane does not composite, so a frame-0 transform would be read as
    // real layout. Same discipline as the sheet-pattern proof.
    const local = withStaticTransitions(root, () => {
      const rows = []
      for (const fig of root.querySelectorAll('[data-case]')) {
        const sheet = fig.querySelector('.frc-sheet')
        if (!sheet) continue
        rows.push({ case: fig.getAttribute('data-case'), kind: sheetKind(sheet), ...measureFill(sheet) })
      }
      return rows
    })
    // Every pattern mounted elsewhere on this page - the sheet-pattern section
    // mounts all 26 by default - so the axis table below is real sheets rather
    // than synthetic probes. The count is reported, so a partial read can never
    // pass itself off as the whole set.
    const all = measureFillAll(document)
    setReport({ local, all })
  }, [ground])

  useEffect(() => { const t = setTimeout(run, 300); return () => clearTimeout(t) }, [run, png])

  const gallery = report?.local.find((r) => r.case === 'gallery-rolecards')
  const AXES = ['start', 'center', 'stretch']
  // align is null when the sheet renders no content row at all - cover, section,
  // statement, quote, closing distribute in their own body rule instead. That is
  // a different state from "assigned nothing", and counting it as a miss is how
  // the verdict read FAIL on a correct tree the first time this section ran.
  const unassigned = (report?.all ?? []).filter((r) => r.align != null && !AXES.includes(r.align))
  const chainOk = Boolean(gallery && gallery.fillRow === 'minmax(0, 1fr)' && gallery.mediaRatio === 'auto' && gallery.align === 'stretch')
  const ok = Boolean(report && chainOk && gallery.pct >= 90 && unassigned.length === 0 && report.all.length > 0)

  return (
    <Section
      id="sheet-fill"
      title="Sheet content distribution"
      lede="The sheet body already hands the content row the leftover height as a 1fr track; the axis is what the content does with it. Three values, assigned per kind in tokens/sheets.css - start where the length of the list is the message, center where the content is a fixed composition, stretch where height is readability. Fill below is the lowest PAINTED bottom inside the body box over the height of that box, in true CSS px on the 1920 x 1440 stage: an empty wrapper that happens to stretch is not content reaching the floor."
    >
      <GroundTabs value={ground} onChange={setGround} extra={<Button variant="ghost" onClick={run}>Re-measure</Button>} />
      <div className="ds-proof" data-proof="sheet-fill">
        <div className="ds-proof-head">
          <Verdict state={report ? ok : null}>The stretch chain resolves end to end, the gallery case reaches its frame, and every mounted kind carries one of the three axis values</Verdict>
        </div>
        {report ? (
          <>
            <table>
              <thead><tr><th>case</th><th>body box</th><th>reached</th><th>dead ground</th><th>fill</th></tr></thead>
              <tbody>
                {report.local.map((r) => (
                  <tr key={r.case}>
                    <td>{r.case}</td>
                    <td>{r.bodyHeight}px</td>
                    <td>{r.reached}px</td>
                    <td className={r.dead <= r.bodyHeight * 0.1 ? 'ds-okcell' : 'ds-fail'}>{r.dead}px</td>
                    <td className={r.pct >= 90 ? 'ds-okcell' : 'ds-fail'}>{r.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table>
              <thead><tr><th>the stretch chain, on the gallery case</th><th>resolved</th></tr></thead>
              <tbody>
                <tr><td>.frc-sheet-content align-content</td><td className={gallery?.align === 'stretch' ? 'ds-okcell' : 'ds-fail'}>{gallery?.align ?? '—'}</td></tr>
                <tr><td>--fill-row (inherited by .frc-sample)</td><td className={gallery?.fillRow === 'minmax(0, 1fr)' ? 'ds-okcell' : 'ds-fail'}>{gallery?.fillRow ?? '—'}</td></tr>
                <tr><td>--fill-media-ratio (inherited by .frc-sample-media)</td><td className={gallery?.mediaRatio === 'auto' ? 'ds-okcell' : 'ds-fail'}>{gallery?.mediaRatio ?? '—'}</td></tr>
              </tbody>
            </table>
            <p className="ds-note">{`${report.all.length} sheet pattern(s) mounted elsewhere on this page, measured below. Toggling the sheet-pattern section to "one" measures one; the count is what says which.`}</p>
            <table>
              <thead><tr><th>pattern</th><th>kind</th><th>axis</th><th>fill</th><th>dead ground</th></tr></thead>
              <tbody>
                {report.all.map((r) => (
                  <tr key={r.pattern}>
                    <td>{r.pattern}</td>
                    <td>{r.kind ?? '—'}</td>
                    <td className={AXES.includes(r.align) ? 'ds-okcell' : 'ds-fail'}>{r.align}</td>
                    <td>{r.pct}%</td>
                    <td>{r.dead}px</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </div>
      <div className="ds-frame">
        <Zoomed width={1920}>
          <div ref={ref} className={cx('frc-deck', GROUND_CLASSES[ground], AUDIENCE_CLASSES.internal)}>
            <figure data-case="gallery-rolecards" style={{ margin: 0, display: 'grid', gap: 12 }}>
              <figcaption className="frc-label" style={{ paddingLeft: 8 }}>GallerySheet · four filled compact RoleCards</figcaption>
              <div className="frc-stage" data-aspect="4:3">
                <GallerySheet active cols={4}>
                  <span slot="eyebrow">Subteam leads</span>
                  <h2 slot="title">Who to find in the shop</h2>
                  {ROLE_ROWS.slice(0, 4).map((r) => (
                    <RoleCard key={r.name} density="compact" mediaFile={`${r.file}.png`}>
                      <Cutout slot="media" ground="none" src={png} alt="" width={160} height={160} />
                      <span slot="name">{r.name}</span>
                      <span slot="title">{r.title}</span>
                      <SubteamBadge slot="subteam">{r.subteam}</SubteamBadge>
                      <li slot="cert" data-status={r.status} {...(r.safety ? { 'data-safety': '' } : {})}>{r.cert}</li>
                      <p slot="note">{r.note}</p>
                    </RoleCard>
                  ))}
                </GallerySheet>
              </div>
            </figure>
            <figure data-case="gallery-samples" style={{ margin: 0, display: 'grid', gap: 12, marginTop: 40 }}>
              <figcaption className="frc-label" style={{ paddingLeft: 8 }}>GallerySheet · four Samples, the component-correct composition</figcaption>
              <div className="frc-stage" data-aspect="4:3">
                <GallerySheet active cols={4}>
                  <span slot="eyebrow">Finishes</span>
                  <h2 slot="title">What came off the mill this week</h2>
                  {['Bead blast', 'Anodize', 'Powder coat', 'As machined'].map((n) => (
                    <Sample key={n} src={png} alt="">
                      <span slot="name">{n}</span>
                      <span slot="note">6061, 3mm plate</span>
                    </Sample>
                  ))}
                </GallerySheet>
              </div>
            </figure>
          </div>
        </Zoomed>
      </div>
    </Section>
  )
}

function ChromeSection() {
  const [ground, setGround] = useState('squadron')
  const ref = useRef(null)
  const [scan, setScan] = useState(null)
  const run = useCallback(() => { if (ref.current) setScan(scanForNeutralWhite(ref.current)) }, [])
  useEffect(() => { const t = setTimeout(run, 80); return () => clearTimeout(t) }, [run, ground])
  const layers = ground === 'squadron' ? ['rivet', 'bloom'] : ground === 'field' ? ['fieldgrid', 'hazard', 'bloom'] : ['grid']
  return (
    <Section id="chrome" title="Deck chrome" lede="Canvas, letterbox, footer rail and thumbnail frames follow the active ground bg0 and edge, so a transition never flashes white. The external rail carries the FIRST logo zone on a flat plate with the ambient clipped out beneath it.">
      <GroundTabs value={ground} onChange={setGround} />
      <div className="ds-frame">
        <Zoomed width={2016}>
          <div ref={ref} className={cx('frc-deck', GROUND_CLASSES[ground], 'frc-audience-external', 'ds-letterbox')} data-chrome>
            <div className="frc-stage" data-aspect="4:3">
              <section className="frc-sheet frc-slide-shutter" data-label="Chrome" data-deck-active="">
                {layers.map((l) => <div key={l} className={cx('frc-ambient', `frc-ambient-${l}`)} />)}
                <div className="frc-sheet-body" style={{ display: 'grid', gap: 40, alignContent: 'start' }}>
                  <Eyebrow tone="accent">Part three · Mission</Eyebrow>
                  <StencilTitle size="display">Deck chrome on {ground}</StencilTitle>
                  <PlatePanel style={{ maxWidth: 1100 }}>
                    <p className="frc-body">Ambient layers stop at the rail. The FIRST zone sits on the flat chrome plate, never on texture.</p>
                  </PlatePanel>
                </div>
                <DeckFooter deckName="Specimen deck" parts={PARTS} partIndex={2} sheet={9} total={18} />
              </section>
            </div>
            <nav className="frc-thumbs" aria-label="Sheets">
              {['Cover', 'Agenda', 'Roster', 'Mission'].map((t, i) => <div key={t} className="frc-thumb" data-current={i === 3 ? '' : undefined}>{t}</div>)}
            </nav>
          </div>
        </Zoomed>
      </div>
      <div className="ds-proof" data-proof="chrome">
        <div className="ds-proof-head">
          <Verdict state={scan ? scan.ok : null}>No neutral white in deck chrome</Verdict>
          {scan ? <span>{scan.elements} elements + pseudo-elements scanned for opaque neutral-white backgrounds, borders, outlines, shadows · {scan.offenders.length} offenders</span> : null}
          <Button variant="ghost" onClick={run}>Re-scan</Button>
        </div>
        {scan && scan.offenders.length ? <table><tbody>{scan.offenders.map((o, i) => <tr key={i}><td className="ds-fail">{o.el}</td><td>{o.prop}</td><td><code>{o.value}</code></td></tr>)}</tbody></table> : null}
      </div>
    </Section>
  )
}

/* ---------- 8b. DeckStage ---------- */

// The four broken states below are exactly what a deck generated from Blank
// lands in by default, which is why they are mounted here rather than described.
// Harness mode is switched OFF for this section so the guard renders its marker
// instead of throwing; the toggle puts it back, and the SAME component throws.
const DECKSTAGE_BREAKAGE = [
  { id: 'no-aspect', label: 'stage declares no data-aspect', root: 'frc-deck frc-ground-squadron frc-audience-internal', aspect: null },
  { id: 'no-ground', label: 'no ground class on the root', root: 'frc-deck frc-audience-internal', aspect: '4:3' },
  { id: 'no-audience', label: 'no audience class on the root', root: 'frc-deck frc-ground-squadron', aspect: '4:3' },
  { id: 'two-instances', label: 'two DeckStage instances on one deck', root: 'frc-deck frc-ground-squadron frc-audience-internal', aspect: '4:3', twice: true },
]

function MiniDeck({ rootClass, aspect, twice, ground = 'squadron', innerRef, onPaint }) {
  return (
    <div ref={innerRef} className={rootClass} data-mini>
      <DeckStage nav={false} fit={false} thumbs={false} onPaint={onPaint} />
      {twice ? <DeckStage nav={false} fit={false} thumbs={false} /> : null}
      <div className="frc-stage" {...(aspect ? { 'data-aspect': aspect } : {})} style={{ width: 320, height: 240, transform: 'none' }}>
        <section className={cx('frc-sheet', GROUND_CLASSES[ground])} data-deck-active="" style={{ padding: 16 }}>
          <Eyebrow tone="accent">{ground}</Eyebrow>
        </section>
      </div>
    </div>
  )
}

function DeckStageSection() {
  const [throwing, setThrowing] = useState(false)
  const [mountKey, setMountKey] = useState(0)
  const [scan, setScan] = useState(null)
  const refs = useRef({})

  // The harness flag is a single module global and RefusalsSection also owns it,
  // so this section cannot simply set it and trust the value: effects run in tree
  // order, RefusalsSection sits earlier in the page, and its effect sets the flag
  // back to true after this section has already rendered. So set the flag in a
  // passive effect (which runs AFTER RefusalsSection) and then REMOUNT the broken
  // decks with a key bump, so each guard trips against the value this section
  // wants. Without the remount the decks trip during the first commit, when the
  // flag still belongs to whoever set it last, and throw instead of marking.
  useEffect(() => { setHarnessMode(throwing); setMountKey((k) => k + 1) }, [throwing])
  useEffect(() => () => setHarnessMode(true), [])

  const run = useCallback(() => {
    const correct = GROUNDS.map((g) => {
      const el = refs.current[`ok-${g}`]
      if (!el) return { ground: g, ok: false, note: 'not mounted' }
      const sheet = el.querySelector('.frc-sheet')
      const stage = el.querySelector('.frc-stage')
      const cs = getComputedStyle(sheet)
      const edge = toRgbString(cs.getPropertyValue('--edge').trim())
      const bg0 = toRgbString(cs.getPropertyValue('--bg0').trim())
      const paintedEdge = getComputedStyle(el).backgroundColor
      const paintedBg0 = getComputedStyle(stage).backgroundColor
      const fault = el.querySelector('[data-frc-fault]')
      return {
        ground: g,
        edge, paintedEdge, bg0, paintedBg0,
        edgeOk: norm(paintedEdge) === norm(edge),
        bg0Ok: norm(paintedBg0) === norm(bg0),
        fault: Boolean(fault),
        ok: norm(paintedEdge) === norm(edge) && norm(paintedBg0) === norm(bg0) && !fault,
      }
    })
    const broken = DECKSTAGE_BREAKAGE.map((b) => {
      const el = refs.current[`bad-${b.id}`]
      const marker = el ? el.querySelector('[data-frc-fault="DeckStage"]') : null
      return {
        id: b.id,
        label: b.label,
        marker: Boolean(marker),
        rule: marker ? (marker.querySelector('.frc-fault-rule')?.textContent ?? '') : '',
        ok: Boolean(marker),
      }
    })
    setScan({ correct, broken })
  }, [])

  useEffect(() => { const t = setTimeout(run, 200); return () => clearTimeout(t) }, [run, throwing, mountKey])

  const allOk = scan ? scan.correct.every((c) => c.ok) && scan.broken.every((b) => b.ok) : null

  return (
    <Section
      id="deckstage"
      title="DeckStage"
      lede="Behaviour, not appearance. Mounted ONCE per deck, it renders nothing and paints the canvas, letterbox and thumbnail frames from the ACTIVE sheet's --bg0 and --edge. --edge is the point: paint only --bg0 and the room sees white through the gap the moment a transition moves the sheet. It replaces the stage script that used to live in templates/Deck.dc.html, which is no longer a starting point — nothing can be copied into Claude Design, so a deck starts from Blank and assembles out of the library."
    >
      <div className="ds-tabs">
        <Button variant={throwing ? 'ghost' : 'primary'} onClick={() => setThrowing(false)} aria-pressed={!throwing}>deck: renders a marker</Button>
        <Button variant={throwing ? 'primary' : 'ghost'} onClick={() => setThrowing(true)} aria-pressed={throwing}>harness: throws</Button>
        <Button variant="ghost" onClick={run}>Re-measure</Button>
      </div>

      <h4 className="ds-sub">Correct root, all three grounds</h4>
      <div className="ds-row" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {GROUNDS.map((g) => (
          <Boundary key={g}>
            <MiniDeck
              ground={g}
              rootClass={cx('frc-deck', GROUND_CLASSES[g], 'frc-audience-internal')}
              aspect="4:3"
              innerRef={(el) => { refs.current[`ok-${g}`] = el }}
            />
          </Boundary>
        ))}
      </div>

      <h4 className="ds-sub">Each broken state a deck generated from Blank lands in</h4>
      <div className="ds-row" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {mountKey === 0 ? <p className="frc-micro">settling the harness flag…</p> : DECKSTAGE_BREAKAGE.map((b) => (
          <div key={`${b.id}-${mountKey}`} style={{ maxWidth: 360 }}>
            <p className="frc-micro">{b.label}</p>
            <Boundary>
              <MiniDeck
                rootClass={b.root}
                aspect={b.aspect}
                twice={b.twice}
                innerRef={(el) => { refs.current[`bad-${b.id}`] = el }}
              />
            </Boundary>
          </div>
        ))}
      </div>

      <div className="ds-proof" data-proof="deckstage">
        <div className="ds-proof-head">
          <Verdict state={allOk}>Paints from --edge on every ground, and every broken state shows the marker</Verdict>
          <Button variant="ghost" onClick={run}>Re-measure</Button>
        </div>
        {scan ? (
          <table>
            <tbody>
              {scan.correct.map((c) => (
                <tr key={c.ground}>
                  <td className={c.ok ? 'ds-pass' : 'ds-fail'}>{c.ground}</td>
                  <td>--edge <code>{c.edge}</code> → canvas <code>{c.paintedEdge}</code> {c.edgeOk ? 'match' : 'MISMATCH'}</td>
                  <td>--bg0 <code>{c.bg0}</code> → stage <code>{c.paintedBg0}</code> {c.bg0Ok ? 'match' : 'MISMATCH'}</td>
                </tr>
              ))}
              {scan.broken.map((b) => (
                <tr key={b.id}>
                  <td className={b.ok ? 'ds-pass' : 'ds-fail'}>{b.label}</td>
                  <td colSpan={2}>{b.marker ? <code>{b.rule}</code> : 'no marker — the guard did not trip'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Section>
  )
}

/* ---------- 8c. RoleCard density ---------- */

/* The card owns its type scale, padding and gaps; the grid wrapper owns the
   columns and the gutter. This section MEASURES that rather than asserting it,
   because the failure it exists to catch is a deck hand-writing the four values
   back in - which is exactly what a generated deck did with nine RoleCards
   before `density` existed. Every card below is mounted with NO style prop at
   all, so any padding, gap, font-size or column count read here came from the
   stylesheet. */

const ROLE_BOX = ['padding-top', 'row-gap', 'grid-template-columns']
const DECK_SIDE = ['fontSize', 'padding', 'gap', 'gridTemplateColumns', 'gridTemplateRows']

function trackCount(v) {
  return v && v !== 'none' ? v.trim().split(/\s+/).length : 0
}

function RoleDensitySection() {
  const [ground, setGround] = useState('squadron')
  const ref = useRef(null)
  const [report, setReport] = useState(null)
  const [png, setPng] = useState(null)

  // A real image for the FILLED slot, drawn at runtime in whatever this ground
  // resolves --fg-structure to, so the route holds no literal color and no team
  // mark is stood in for a member's photo. Same helper the Cutout proof uses.
  useEffect(() => {
    const probe = document.createElement('span')
    probe.className = cx('frc-deck', GROUND_CLASSES[ground])
    document.body.appendChild(probe)
    const ink = getComputedStyle(probe).getPropertyValue('--fg-structure').trim()
    document.body.removeChild(probe)
    setPng(makeAlphaPng(ink || 'gray', 240))
  }, [ground])

  const run = useCallback(() => {
    const root = ref.current
    if (!root) return
    const read = (sel) => {
      const card = root.querySelector(sel)
      if (!card) return null
      const name = card.querySelector('.frc-role-name')
      return {
        box: readComputed(card, ROLE_BOX),
        tracks: trackCount(readComputed(card, ['grid-template-columns'])['grid-template-columns']),
        nameSize: name ? readComputed(name, ['font-size'])['font-size'] : null,
      }
    }
    const dflt = read('[data-frc="RoleCard"][data-density="default"]')
    const compact = read('[data-frc="RoleCard"][data-density="compact"]')

    // The empty media slot: the same marked, dashed, transparent affordance the
    // image treatments proof measures on .frc-frame-empty.
    const emptyEl = root.querySelector('[data-probe="role-empty"] .frc-role-media > .frc-frame-empty')
    const emptyStyle = emptyEl ? readComputed(emptyEl, ['border-top-style', 'border-top-width', 'background-color', 'color']) : null
    const filledSlot = root.querySelector('[data-probe="role-filled"] .frc-role-media')
    const filledImg = filledSlot ? filledSlot.querySelector('img') : null

    const gridEl = root.querySelector('.frc-role-grid')
    const gridCols = gridEl ? trackCount(readComputed(gridEl, ['grid-template-columns'])['grid-template-columns']) : 0
    const gridGap = gridEl ? readComputed(gridEl, ['column-gap'])['column-gap'] : null

    // Nothing inside a card sets one of the four deck-side values inline.
    const offenders = []
    for (const card of root.querySelectorAll('[data-frc="RoleCard"]')) {
      for (const el of [card, ...card.querySelectorAll('*')]) {
        const hit = DECK_SIDE.filter((k) => el.style && el.style[k])
        if (hit.length) offenders.push({ el: el.className || el.tagName.toLowerCase(), props: hit.join(', ') })
      }
    }

    setReport({
      dflt,
      compact,
      emptyStyle,
      emptyLegible: Boolean(emptyStyle) && emptyStyle['border-top-style'] === 'dashed' && emptyStyle['border-top-width'] !== '0px' && isTransparent(emptyStyle['background-color']),
      filled: Boolean(filledImg) && !filledSlot.querySelector('.frc-frame-empty'),
      radius: readComputed(root.querySelector('[data-frc="RoleCard"]'), ['border-top-left-radius'])['border-top-left-radius'],
      gridCols,
      gridGap,
      offenders,
    })
  }, [ground])

  useEffect(() => { const t = setTimeout(run, 150); return () => clearTimeout(t) }, [run, png])

  const scalesDiffer = report && report.dflt && report.compact
    && report.dflt.nameSize !== report.compact.nameSize
    && report.dflt.box['padding-top'] !== report.compact.box['padding-top']
  const stacks = report && report.dflt && report.compact && report.dflt.tracks === 2 && report.compact.tracks === 1
  const ok = Boolean(report && scalesDiffer && stacks && report.emptyLegible && report.filled && report.gridCols >= 2 && report.offenders.length === 0 && report.radius === '4px')

  return (
    <Section
      id="role-density"
      title="RoleCard density"
      lede="default puts the media beside the text at the full scale; compact - six or more cards on one sheet - puts it above and drops the whole card to the smaller scale by itself. The wrapper class frc-role-grid carries the columns and the gutter. Every card here is mounted with no style prop, so everything measured below came from the stylesheet."
    >
      <GroundTabs value={ground} onChange={setGround} extra={<Button variant="ghost" onClick={run}>Re-measure</Button>} />
      <div className="ds-proof" data-proof="role-density">
        <div className="ds-proof-head">
          <Verdict state={report ? ok : null}>Card owns its scale, padding and columns; the grid owns the gutter; the empty media slot is marked</Verdict>
        </div>
        {report ? (
          <table>
            <thead><tr><th>measurement</th><th>default</th><th>compact</th></tr></thead>
            <tbody>
              <tr><td>.frc-role-name font-size</td><td className={scalesDiffer ? 'ds-okcell' : 'ds-fail'}>{report.dflt?.nameSize}</td><td className={scalesDiffer ? 'ds-okcell' : 'ds-fail'}>{report.compact?.nameSize}</td></tr>
              <tr><td>.frc-role padding-top</td><td>{report.dflt?.box['padding-top']}</td><td>{report.compact?.box['padding-top']}</td></tr>
              <tr><td>.frc-role row-gap</td><td>{report.dflt?.box['row-gap']}</td><td>{report.compact?.box['row-gap']}</td></tr>
              <tr><td>grid tracks (2 = media beside, 1 = media above)</td><td className={stacks ? 'ds-okcell' : 'ds-fail'}>{report.dflt?.tracks}</td><td className={stacks ? 'ds-okcell' : 'ds-fail'}>{report.compact?.tracks}</td></tr>
              <tr><td>card radius</td><td colSpan={2} className={report.radius === '4px' ? 'ds-okcell' : 'ds-fail'}>{report.radius}</td></tr>
              <tr><td>.frc-role-grid columns / gutter</td><td colSpan={2} className={report.gridCols >= 2 ? 'ds-okcell' : 'ds-fail'}>{report.gridCols} × {report.gridGap}</td></tr>
              <tr><td>filled media slot holds an img and no empty marker</td><td colSpan={2} className={report.filled ? 'ds-okcell' : 'ds-fail'}>{String(report.filled)}</td></tr>
              <tr><td>empty media slot: dashed, transparent, legible</td><td colSpan={2} className={report.emptyLegible ? 'ds-okcell' : 'ds-fail'}>{report.emptyStyle ? `${report.emptyStyle['border-top-style']} ${report.emptyStyle['border-top-width']} on ${report.emptyStyle['background-color']}` : 'absent'}</td></tr>
              <tr><td>inline font-size / padding / gap / grid-template on a card or its children</td><td colSpan={2} className={report.offenders.length === 0 ? 'ds-okcell' : 'ds-fail'}>{report.offenders.length === 0 ? 'none' : report.offenders.map((o) => `${o.el}: ${o.props}`).join(' · ')}</td></tr>
            </tbody>
          </table>
        ) : null}
      </div>
      <div className="ds-frame">
        <Zoomed width={1920}>
          <div ref={ref} className={cx('frc-deck', GROUND_CLASSES[ground])} style={{ padding: 48, display: 'grid', gap: 40 }}>
            <RoleCard data-probe="role-filled" mediaFile="rivera-portrait.png">
              <Cutout slot="media" ground="none" src={png} alt="" width={160} height={160} />
              <span slot="name">A. Rivera</span>
              <span slot="title">Drive coach, class of 2027</span>
              <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
              <li slot="cert" data-status="certified" data-safety>Mill</li>
              <li slot="cert" data-status="in_progress">Lathe</li>
              <p slot="note">Calls the match and runs the pit checklist before every queue.</p>
            </RoleCard>
            <div className="frc-role-grid">
              {ROLE_ROWS.map((r, i) => (
                <RoleCard key={r.name} density="compact" data-probe={i === 0 ? 'role-empty' : undefined} mediaFile={`${r.file}.png`}>
                  <span slot="name">{r.name}</span>
                  <span slot="title">{r.title}</span>
                  <SubteamBadge slot="subteam">{r.subteam}</SubteamBadge>
                  <li slot="cert" data-status={r.status} {...(r.safety ? { 'data-safety': '' } : {})}>{r.cert}</li>
                  <p slot="note">{r.note}</p>
                </RoleCard>
              ))}
            </div>
          </div>
        </Zoomed>
      </div>
    </Section>
  )
}

/* ---------- 9. Wiring ---------- */

function WiringSection() {
  const [counts, setCounts] = useState(null)
  const run = useCallback(() => setCounts(countMounted(document)), [])
  useEffect(() => { const t = setTimeout(run, 150); return () => clearTimeout(t) }, [run])
  const expected = [
    'Button', 'Eyebrow', 'Divider', 'ChevronRail', 'TeamWordmark',
    'SealMark', 'MarkGlyph', 'Logotype', 'DeckFooter', 'ProgramLockup', 'SeasonLockup', 'FirstName', 'HudFrame', 'PlatePanel', 'StencilTitle', 'DeckStage',
    'Badge', 'Chip', 'SubteamBadge', 'Field', 'StatBlock', 'Readout', 'SpecTable', 'SpecRow', 'FocusTable', 'FocusRow',
    'BarChart', 'Bar', 'GanttChart', 'GanttBar', 'DecisionMatrix', 'Timeline', 'TimelineItem', 'MatchClock', 'BuildCountdown',
    'ScoutTable', 'ScoutRow', 'AllianceSplit',
    'Card', 'Callout', 'SafetyNote', 'ImageFrame', 'Cutout', 'StepCard', 'Step', 'ProcessPipeline', 'PipelineStep',
    'CompareSplit', 'CompareRow', 'SampleGrid', 'Sample', 'JumpGrid', 'JumpCard', 'CalloutDrawing', 'CalloutPin',
    'QuoteBlock', 'RoleCard', 'PartCallout', 'FieldDiagram', 'SponsorWall', 'SponsorTier', 'AwardPlate', 'ResultBanner',
    'Input', 'Select',
    'CoverSheet', 'AgendaSheet', 'SectionSheet', 'StatementSheet', 'QuoteSheet', 'HubSheet', 'ClosingSheet',
    'SplitSheet', 'GallerySheet', 'ProcedureSheet', 'ComparisonSheet', 'DataSheet', 'TimelineSheet', 'ScheduleSheet',
    'SubteamStatusSheet', 'SubteamStatus', 'BlockerSheet', 'Blocker', 'TargetsSheet', 'SafetySheet', 'RosterSheet',
    'MatchBreakdownSheet', 'ScoutingSheet', 'FieldSheet', 'BOMSheet', 'AwardSheet', 'SponsorSheet', 'SeasonSheet',
  ]
  const missing = counts ? expected.filter((n) => !counts[n]) : []
  return (
    <Section id="wiring" title="Wiring" lede="This route mounts the real components. Each component root carries data-frc, so the count below is live DOM, not a list. To prove it: change something observable inside a component file, reload, see it here, restore.">
      <div className="ds-proof" data-proof="wiring">
        <div className="ds-proof-head"><Verdict state={counts ? missing.length === 0 : null}>All {expected.length} component roots mounted from source</Verdict><Button variant="ghost" onClick={run}>Recount</Button></div>
        {counts ? (
          <table><thead><tr><th>component</th><th>instances on this page</th></tr></thead><tbody>
            {expected.map((n) => <tr key={n}><td className={counts[n] ? 'ds-okcell' : 'ds-fail'}>{n}</td><td>{counts[n] || 0}</td></tr>)}
          </tbody></table>
        ) : null}
      </div>
    </Section>
  )
}

/* ---------- capture mode ---------- */

/**
 * CaptureView — `/_ds?capture=CoverSheet&ground=field&audience=external`.
 *
 * One sheet, one ground, one audience, at the real 1920 x 1440, with no route
 * chrome around it. `npm run ds:capture` drives this to write a PNG per
 * pattern per ground per audience, which is the only way a human review pass of
 * this system is possible at all: DOM measurement confirms an alias resolved,
 * never that a sheet reads well or that two elements are not colliding.
 *
 * Guards do NOT throw here even though this is the harness: a capture run has
 * to produce the image of a tripped guard, and the audit is what fails on a
 * fault marker. `?harness=throw` restores throwing for a proof run.
 */
function CaptureView({ params }) {
  const pattern = params.get('capture')
  const ground = GROUNDS.includes(params.get('ground')) ? params.get('ground') : 'squadron'
  const audience = params.get('audience') === 'external' ? 'external' : 'internal'
  const ambient = params.get('ambient') === 'on'
  const known = SHEET_PATTERNS.includes(pattern)
  useEffect(() => {
    document.title = `${pattern} · ${ground} · ${audience}`
    document.documentElement.setAttribute('data-ds-capture', '')
  }, [pattern, ground, audience])
  if (!known) {
    return <pre className="ds-error" data-capture-error>Unknown pattern: {String(pattern)}</pre>
  }
  return (
    <div className="ds-capture" data-capture={pattern} data-ground={ground} data-audience={audience}>
      <SheetsDemoCard ground={ground} audience={audience} only={[pattern]} ambient={ambient} />
    </div>
  )
}

/* ---------- page ---------- */

export default function SpecimenPage() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const capturing = params.has('capture')
  // The dev harness: a guard throws here instead of rendering a fault marker,
  // so a proof run fails loudly rather than quietly producing a rust block.
  // A capture run needs the image of that block, so it opts out.
  setHarnessMode(!capturing || params.get('harness') === 'throw')
  useEffect(() => { if (!capturing) document.title = `${NAMESPACE} — specimen` }, [capturing])
  // An unfilled AssetSlot renders NOTHING by default, so that a deck never ships
  // a dashed placeholder box into the room. This route is the one place that
  // wants the opposite: seeing which files have not landed is the whole point of
  // the specimen, and of the captured PNGs the review pass reads. The capture
  // view is wrapped too — it is the same harness, one sheet at a time.
  if (capturing) return <AssetSlotPlaceholders><CaptureView params={params} /></AssetSlotPlaceholders>
  return (
    <AssetSlotPlaceholders>
    <div className="frc-deck frc-ground-squadron frc-audience-internal ds-root" data-ds-root>
      <header className="ds-header">
        <span className="ds-header-title">{NAMESPACE}</span>
        <span>v{VERSION} · /_ds · dev only</span>
        <nav className="ds-nav">
          {['grounds', 'tokens', 'type', 'motion', 'surfaces', 'core', 'brand', 'data', 'surfaces-group', 'forms', 'role-density', 'images', 'cutout', 'clock', 'alliance', 'sheets', 'sheet-fill', 'host', 'refusals', 'chrome', 'wiring'].map((id) => <a key={id} href={`#${id}`}>{id}</a>)}
        </nav>
      </header>
      <main className="ds-main">
        <GroundsSection />
        <TokensSection />
        <TypeSection />
        <MotionSection />
        <AmbientSection />
        <CardSection id="core" title="Core components" lede="Button, Eyebrow, Divider, ChevronRail, TeamWordmark — the components/core demo card, mounted as-is." render={(ground, run) => <CoreDemoCard ground={ground} run={run} />} />
        <CardSection id="brand" title="Brand components" lede="SealMark, MarkGlyph, Logotype, DeckFooter, ProgramLockup, SeasonLockup, FirstName, HudFrame, PlatePanel, StencilTitle — the components/brand demo card, mounted as-is. Mark slots stay empty until the SVGs and PNGs land." render={(ground, run) => <BrandDemoCard ground={ground} run={run} />} />
        <CardSection id="data" title="Data components" lede="Badge, Chip, SubteamBadge, Field, StatBlock, Readout, SpecTable, FocusTable, BarChart, GanttChart, DecisionMatrix, Timeline, MatchClock, BuildCountdown, ScoutTable, AllianceSplit — the components/data demo card, mounted as-is." render={(ground, run) => <DataDemoCard ground={ground} run={run} />} />
        <CardSection id="surfaces-group" title="Surface components" lede="Card, Callout, SafetyNote, ImageFrame, Cutout, StepCard, ProcessPipeline, CompareSplit, SampleGrid, JumpGrid, CalloutDrawing, QuoteBlock, RoleCard, PartCallout, FieldDiagram, SponsorWall, AwardPlate, ResultBanner — the components/surfaces demo card, mounted as-is." render={(ground, run) => <SurfacesDemoCard ground={ground} run={run} />} />
        <CardSection id="forms" title="Form controls" lede="Input and Select — the components/forms demo card, mounted as-is." render={(ground, run) => <FormsDemoCard ground={ground} run={run} />} />
        <RoleDensitySection />
        <ImageTreatmentSection />
        <CutoutSection />
        <ClockSection />
        <AllianceSection />
        <SheetsSection />
        <SheetFillSection />
        <HostSection />
        <RefusalsSection />
        <section className="ds-section"><ExternalEnforcement /></section>
        <ChromeSection />
        <DeckStageSection />
        <WiringSection />
      </main>
    </div>
    </AssetSlotPlaceholders>
  )
}
