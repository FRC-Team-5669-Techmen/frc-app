// /_ds — the dev-guarded specimen route.
// Mounts the REAL components (never a copy of their markup), shows the three
// grounds, the token layer, the type scale, every motion class, the ambient
// layers, the core and brand demo cards, and the deck chrome, and PROVES the
// load-bearing rules in the live browser. Touches no auth and no Supabase.
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Button, Eyebrow, Divider, TeamWordmark,
  IconPlay, IconRotateCcw,
  DeckFooter, FirstName, FirstNameScope, HudFrame, PlatePanel, StencilTitle,
  CoreDemoCard, BrandDemoCard, tokens,
} from '../index.js'
import { cx } from '../components/cx.js'
import { proveGrounds, scanForGold, scanForNeutralWhite, auditMotionGate, measureStatic, replay, countMounted } from './proofs.js'
import './specimen.css'

const { GROUNDS, GROUND_CLASSES, BRAND, RAMPS, PARTITION, PROGRAM, SEASON_DEFAULT, TYPE_SCALE, FONTS, RADII, MOTION, AMBIENT, VERSION, NAMESPACE } = tokens
const PARTS = ['Brief', 'Roster', 'Quals', 'Mission', 'Muster']

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

/* ---------- 8. Deck chrome ---------- */

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

/* ---------- 9. Wiring ---------- */

function WiringSection() {
  const [counts, setCounts] = useState(null)
  const run = useCallback(() => setCounts(countMounted(document)), [])
  useEffect(() => { const t = setTimeout(run, 150); return () => clearTimeout(t) }, [run])
  const expected = ['Button', 'Eyebrow', 'Divider', 'ChevronRail', 'TeamWordmark', 'SealMark', 'MarkGlyph', 'Logotype', 'DeckFooter', 'ProgramLockup', 'SeasonLockup', 'FirstName', 'HudFrame', 'PlatePanel', 'StencilTitle']
  const missing = counts ? expected.filter((n) => !counts[n]) : []
  return (
    <Section id="wiring" title="Wiring" lede="This route mounts the real components. Each component root carries data-frc, so the count below is live DOM, not a list. To prove it: change something observable inside a component file, reload, see it here, restore.">
      <div className="ds-proof" data-proof="wiring">
        <div className="ds-proof-head"><Verdict state={counts ? missing.length === 0 : null}>All 15 components mounted from source</Verdict><Button variant="ghost" onClick={run}>Recount</Button></div>
        {counts ? (
          <table><thead><tr><th>component</th><th>instances on this page</th></tr></thead><tbody>
            {expected.map((n) => <tr key={n}><td className={counts[n] ? 'ds-okcell' : 'ds-fail'}>{n}</td><td>{counts[n] || 0}</td></tr>)}
          </tbody></table>
        ) : null}
      </div>
    </Section>
  )
}

/* ---------- page ---------- */

export default function SpecimenPage() {
  useEffect(() => { document.title = `${NAMESPACE} — specimen` }, [])
  return (
    <div className="frc-deck frc-ground-squadron frc-audience-internal ds-root" data-ds-root>
      <header className="ds-header">
        <span className="ds-header-title">{NAMESPACE}</span>
        <span>v{VERSION} · /_ds · dev only</span>
        <nav className="ds-nav">
          {['grounds', 'tokens', 'type', 'motion', 'surfaces', 'core', 'brand', 'chrome', 'wiring'].map((id) => <a key={id} href={`#${id}`}>{id}</a>)}
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
        <section className="ds-section"><ExternalEnforcement /></section>
        <ChromeSection />
        <WiringSection />
      </main>
    </div>
  )
}
