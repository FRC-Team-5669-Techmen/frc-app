import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { displayName } from './names'
import { PHASES, MATCH_SECONDS, matchState, cueTimes, fmtClock, TOWER_POINTS } from './matchSim'
import { RESULTS } from './autos'
import { readNumber } from './batteries'
import './BatteriesPage.css'
import './MatchSim.css'

// The match simulator (ledger 0017, part D3). Mr. Pina: "Simulated matches
// should include a human player. Full simulation, as good as possible." The
// clock and the HUB order follow the 2026 Game Manual (src/matchSim.js). The
// after-screen saves one simulated match, which also logs the auto run (D2)
// and the battery run (B1) in the same database call (sim_save_match, 0028).

function done(r) {
  if (r.error) throw r.error
  if (r.via !== 'function') throw { code: 'PGRST202', message: 'The match simulator is not set up yet. Nothing was saved.' }
  return r.data
}
const errText = (e) => e?.message || 'Something went wrong. Nothing was changed.'
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) : '')
const TOWERS = [['none', 'None'], ['level1', 'Level 1'], ['level2', 'Level 2'], ['level3', 'Level 3'], ['failed', 'Tried, failed']]

// Audio cues through WebAudio, so nothing is downloaded: start a rising
// triple, a phase change a double tone, the warning three short beeps, the end
// a long low tone. A browser allows sound only after a tap, which Start is.
function useCues() {
  const ctx = useRef(null)
  const beep = (freq, start, dur, gain = 0.25) => {
    const c = ctx.current; if (!c) return
    const o = c.createOscillator(), g = c.createGain()
    o.type = 'square'; o.frequency.value = freq
    g.gain.setValueAtTime(gain, c.currentTime + start); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
    o.connect(g).connect(c.destination); o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05)
  }
  return {
    unlock() { try { ctx.current = ctx.current ?? new (window.AudioContext || window.webkitAudioContext)(); ctx.current.resume?.() } catch { ctx.current = null } },
    play(kind) {
      if (kind === 'start') { beep(660, 0, 0.18); beep(880, 0.22, 0.18); beep(1320, 0.44, 0.4) }
      else if (kind === 'phase') { beep(990, 0, 0.2); beep(990, 0.28, 0.2) }
      else if (kind === 'warning') { beep(1200, 0, 0.12); beep(1200, 0.2, 0.12); beep(1200, 0.4, 0.12) }
      else if (kind === 'end') beep(330, 0, 1.4, 0.35)
    },
  }
}

export default function MatchSimPage({ session, hasRole = () => false }) {
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  const parentOnly = hasRole('parent') && !isStaff
  const [data, setData] = useState({ loading: true })
  const [stage, setStage] = useState('setup') // setup | running | after
  const [setup, setSetup] = useState({ alliance: 'red', inactiveFirst: 'random', driver: '', operator: '', human: '', coach: '', battery: '', routine: '' })
  const [run, setRun] = useState(null) // { startedAt, inactiveFirst, endedAt }
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const [m, b, a, s] = await Promise.all([
      supabase.from('profiles').select('id, full_name, nickname, approved, status').eq('approved', true).eq('status', 'active'),
      supabase.from('batteries').select('id, label, status, charge_state'),
      supabase.from('auto_routines').select('id, name, active'),
      supabase.from('sim_matches').select('*').order('started_at', { ascending: false }).limit(30),
    ])
    if (s.error && isSchemaMissing(s.error)) { setData({ loading: false, missing: true }); return }
    setData({ loading: false, members: (m.data ?? []).map((p) => ({ id: p.id, name: displayName(p) })).sort((x, y) => x.name.localeCompare(y.name)),
      batteries: (b.error ? [] : b.data ?? []).filter((x) => x.status !== 'retired'), routines: (a.error ? [] : a.data ?? []).filter((x) => x.active !== false), history: s.data ?? [] })
  }, [])
  useEffect(() => { if (!parentOnly) load() }, [load, parentOnly])

  if (parentOnly) return <main className="ba-wrap"><h1 className="ba-title">Match simulator</h1><p className="ba-muted">The simulator is for students and staff.</p></main>
  if (data.loading) return <main className="ba-wrap"><h1 className="ba-title">Match simulator</h1><p className="ba-muted" role="status">Loading…</p></main>
  if (data.missing) return <main className="ba-wrap"><Link className="ba-back" to="/robot">← Robot</Link><h1 className="ba-title">Match simulator</h1><div className="ba-empty"><h2>Not set up yet</h2><p>The simulator saves matches once migration 0028 is pasted into Supabase.</p></div></main>

  const nameOf = (id) => data.members.find((m) => m.id === id)?.name ?? ''
  if (stage === 'running') return <Runner run={run} alliance={setup.alliance} crew={{ driver: nameOf(setup.driver), operator: nameOf(setup.operator), human: nameOf(setup.human), coach: nameOf(setup.coach) }}
    battery={data.batteries.find((b) => b.id === setup.battery)?.label} routine={data.routines.find((r) => r.id === setup.routine)?.name}
    onEnd={(endedAt) => { setRun({ ...run, endedAt }); setStage('after') }} onAbort={() => { setStage('setup'); setRun(null) }} />
  if (stage === 'after') return <After setup={setup} run={run} data={data} onSaved={async (t) => { setMsg(t); setStage('setup'); setRun(null); await load() }} onDiscard={() => { setStage('setup'); setRun(null) }} />

  const sel = (key, label, opts, none = 'Not set') => (
    <label className="ba-field"><span>{label}</span><select value={setup[key]} onChange={(e) => setSetup({ ...setup, [key]: e.target.value })}><option value="">{none}</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name ?? o.label}</option>)}</select></label>)
  return (
    <main className="ba-wrap" data-page="match-sim">
      <Link className="ba-back" to="/robot">← Robot</Link>
      <header className="ba-head"><div><span className="ba-eyebrow">Drive practice</span><h1 className="ba-title">Match simulator</h1>
        <p className="ba-sub">A full 2026 REBUILT match on the official clock: AUTO, TRANSITION, four SHIFTS with the HUBS alternating, END GAME. Full screen, with sound.</p></div></header>
      {msg && <p className="ba-msg" role="status">{msg}</p>}
      <section className="ms-setup">
        <h2 className="ba-h3">Drive team</h2>
        <div className="ba-grid2">{sel('driver', 'Driver', data.members)}{sel('operator', 'Operator', data.members)}{sel('human', 'Human player', data.members)}{sel('coach', 'Drive coach', data.members)}</div>
        <h2 className="ba-h3">Robot</h2>
        <div className="ba-grid2">{sel('battery', 'Battery', data.batteries)}{sel('routine', 'Auto routine', data.routines, 'No auto')}</div>
        <h2 className="ba-h3">Field</h2>
        <fieldset className="ba-seg"><legend>Our alliance</legend><div className="ba-seg-opts">{[['red', 'Red'], ['blue', 'Blue']].map(([k, l]) => <button key={k} type="button" className={`ms-${k}`} aria-pressed={setup.alliance === k} onClick={() => setSetup({ ...setup, alliance: k })}>{l}</button>)}</div></fieldset>
        <fieldset className="ba-seg"><legend>HUB inactive first (in a real match, the alliance that scored more FUEL in AUTO)</legend><div className="ba-seg-opts">
          {[['random', 'Random, like a tie'], ['red', 'Red'], ['blue', 'Blue']].map(([k, l]) => <button key={k} type="button" aria-pressed={setup.inactiveFirst === k} onClick={() => setSetup({ ...setup, inactiveFirst: k })}>{l}</button>)}</div></fieldset>
        <button className="ba-primary ms-start" onClick={() => { const inactiveFirst = setup.inactiveFirst === 'random' ? (Math.random() < 0.5 ? 'red' : 'blue') : setup.inactiveFirst; setRun({ startedAt: new Date().toISOString(), inactiveFirst }); setStage('running') }}>Start match</button>
      </section>
      <section className="ms-history">
        <h2 className="ba-h3">Simulated matches <span className="hud-tnum">{data.history.length}</span></h2>
        {!data.history.length ? <p className="ba-muted">None yet.</p> : <ol className="ba-history">{data.history.map((m) => (
          <li key={m.id}><div className="ba-run-top"><strong>{when(m.started_at)} · {m.alliance} alliance</strong><span className="hud-mono">{m.auto_fuel ?? '--'} + {m.teleop_fuel ?? '--'} FUEL · TOWER {TOWERS.find((t) => t[0] === m.tower)?.[1] ?? '--'}</span></div>
            <div className="ba-run-nums hud-mono"><span>Driver {nameOf(m.driver_id) || '--'}</span><span>HP {nameOf(m.human_player_id) || '--'}</span><span>Auto {m.auto_result ?? '--'}</span><span>{m.voltage_before ?? '--'} → {m.voltage_after ?? '--'} V</span><span>Brownout {m.brownout}</span></div>
            {(m.human_notes || m.problems) && <p className="ba-run-note">{m.human_notes}{m.human_notes && m.problems ? ' · ' : ''}{m.problems}</p>}</li>))}</ol>}
      </section>
    </main>
  )
}

function Runner({ run, alliance, crew, battery, routine, onEnd, onAbort }) {
  const [now, setNow] = useState(() => Date.now())
  const [paused, setPaused] = useState(false)
  const offset = useRef(0) // ms spent paused
  const pausedAt = useRef(null)
  const fired = useRef(new Set())
  const cues = useCues()
  const root = useRef(null)
  const start = Date.parse(run.startedAt)
  useEffect(() => { cues.unlock(); root.current?.requestFullscreen?.().catch(() => {}); return () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}) } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (paused) return undefined; const t = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(t) }, [paused])
  const elapsed = Math.max(0, (now - start - offset.current) / 1000)
  const st = matchState(elapsed, run.inactiveFirst)
  useEffect(() => {
    for (const c of cueTimes()) {
      const key = `${c.kind}:${c.at}`
      if (elapsed >= c.at && elapsed < c.at + 1.5 && !fired.current.has(key)) { fired.current.add(key); cues.play(c.kind) }
    }
    if (st.done) onEnd(new Date().toISOString())
  }, [elapsed]) // eslint-disable-line react-hooks/exhaustive-deps
  const ours = st.active[alliance], theirs = st.active[alliance === 'red' ? 'blue' : 'red']
  const warn = MATCH_SECONDS - elapsed <= 10 && !st.done
  const next = PHASES[st.index + 1]
  return (
    <div ref={root} className={`ms-run ms-run-${alliance}${warn ? ' ms-warn' : ''}`} data-phase={st.phase.key} role="timer" aria-live="off">
      <div className="ms-top"><span className="ms-crew">{crew.driver && `D ${crew.driver}`}{crew.operator && ` · O ${crew.operator}`}{crew.human && ` · HP ${crew.human}`}{crew.coach && ` · C ${crew.coach}`}</span>
        <span className="ms-meta">{battery ? `Battery ${battery}` : ''}{routine ? ` · Auto ${routine}` : ''}</span></div>
      <div className="ms-phase" data-testid="sim-phase">{st.phase.label}</div>
      <div className="ms-clock hud-tnum" data-testid="sim-clock">{fmtClock(st.periodClock)}</div>
      <div className="ms-sub hud-tnum">{st.phase.period === 'teleop' ? `${fmtClock(st.remainingInPhase)} left in ${st.phase.label}` : st.phase.period === 'pause' ? 'Field scoring AUTO' : 'Robots on their own'}{next ? ` · next ${next.label}` : ''}</div>
      <div className="ms-hubs">
        <div className={`ms-hub ms-hub-${alliance}${ours ? ' ms-hub-on' : ''}`} data-testid="sim-our-hub"><span>OUR HUB</span><b>{ours ? 'ACTIVE' : 'INACTIVE'}</b><i>{ours ? 'Score FUEL' : 'Collect, shuttle, defend'}</i></div>
        <div className={`ms-hub ms-hub-${alliance === 'red' ? 'blue' : 'red'}${theirs ? ' ms-hub-on' : ''}`}><span>THEIR HUB</span><b>{theirs ? 'ACTIVE' : 'INACTIVE'}</b></div>
      </div>
      <div className="ms-bar" aria-hidden="true">{PHASES.map((p, i) => <i key={p.key} style={{ flexGrow: p.seconds }} className={i < st.index ? 'ms-done' : i === st.index ? 'ms-now' : ''} />)}</div>
      <div className="ms-controls">
        <button className="ba-btn" onClick={() => { if (paused) { offset.current += Date.now() - pausedAt.current; setPaused(false) } else { pausedAt.current = Date.now(); setPaused(true) } }}>{paused ? 'Resume' : 'Pause'}</button>
        <button className="ba-btn" onClick={() => onEnd(new Date().toISOString())}>End now</button>
        <button className="ba-btn" onClick={onAbort}>Abandon</button>
      </div>
    </div>
  )
}

function After({ setup, run, data, onSaved, onDiscard }) {
  const [v, setV] = useState({ autoResult: '', autoFuel: '', teleopFuel: '', tower: '', vb: '', va: '', brownout: 'no', human: '', problems: '' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const num = (s) => { const n = readNumber(s); return n === null ? null : n }
  async function save(e) {
    e.preventDefault()
    if (setup.routine && !v.autoResult) { setErr('How did the auto go?'); return }
    for (const [k, label] of [['autoFuel', 'Auto FUEL'], ['teleopFuel', 'Teleop FUEL']]) { const n = num(v[k]); if (Number.isNaN(n) || (n !== null && (!Number.isInteger(n) || n < 0 || n > 500))) { setErr(`${label} is a whole number from 0 to 500.`); return } }
    setSaving(true); setErr('')
    try {
      done(await writeVia(supabase, 'sim_save_match', {
        p_started_at: run.startedAt, p_ended_at: run.endedAt ?? new Date().toISOString(), p_alliance: setup.alliance, p_inactive_first: run.inactiveFirst,
        p_driver: setup.driver || null, p_operator: setup.operator || null, p_human_player: setup.human || null, p_drive_coach: setup.coach || null,
        p_battery: setup.battery || null, p_routine: setup.routine || null, p_auto_result: v.autoResult || null, p_auto_fuel: num(v.autoFuel), p_teleop_fuel: num(v.teleopFuel),
        p_tower: v.tower || null, p_voltage_before: num(v.vb), p_voltage_after: num(v.va), p_brownout: v.brownout, p_human_notes: v.human.trim() || null, p_problems: v.problems.trim() || null,
      }))
      await onSaved(`Match saved${setup.routine ? ', auto run logged' : ''}${setup.battery ? ', battery run logged' : ''}.`)
    } catch (x) { setErr(errText(x)); setSaving(false) }
  }
  const points = (num(v.autoFuel) ?? 0) + (num(v.teleopFuel) ?? 0) + (TOWER_POINTS[v.tower] ?? 0)
  return (
    <main className="ba-wrap" data-page="match-sim-after">
      <header className="ba-head"><div><span className="ba-eyebrow">Match over</span><h1 className="ba-title">Log this match</h1><p className="ba-sub">One screen: it feeds the auto log and the battery log too. Leave a field blank if nobody counted it.</p></div></header>
      <form className="ba-form ms-after" onSubmit={save}>
        {setup.routine && <fieldset className="ba-seg"><legend>Auto ({data.routines.find((r) => r.id === setup.routine)?.name})</legend><div className="ba-seg-opts au-results">{RESULTS.map((x) => <button type="button" key={x.key} className={`au-res-${x.key}`} aria-pressed={v.autoResult === x.key} onClick={() => setV({ ...v, autoResult: x.key })}>{x.label}</button>)}</div></fieldset>}
        <div className="ba-grid2">
          <label className="ba-num"><span>FUEL in auto</span><span className="ba-num-box"><input inputMode="numeric" value={v.autoFuel} onChange={(e) => setV({ ...v, autoFuel: e.target.value })} placeholder="--" aria-label="FUEL in auto" /></span></label>
          <label className="ba-num"><span>FUEL in teleop</span><span className="ba-num-box"><input inputMode="numeric" value={v.teleopFuel} onChange={(e) => setV({ ...v, teleopFuel: e.target.value })} placeholder="--" aria-label="FUEL in teleop" /></span></label>
        </div>
        <fieldset className="ba-seg"><legend>TOWER</legend><div className="ba-seg-opts">{TOWERS.map(([k, l]) => <button key={k} type="button" aria-pressed={v.tower === k} onClick={() => setV({ ...v, tower: v.tower === k ? '' : k })}>{l}</button>)}</div></fieldset>
        {setup.battery && <><div className="ba-grid2">
          <label className="ba-num"><span>Battery before</span><span className="ba-num-box"><input inputMode="decimal" value={v.vb} onChange={(e) => setV({ ...v, vb: e.target.value })} placeholder="--" aria-label="Battery before" /><i>V</i></span></label>
          <label className="ba-num"><span>After</span><span className="ba-num-box"><input inputMode="decimal" value={v.va} onChange={(e) => setV({ ...v, va: e.target.value })} placeholder="--" aria-label="Battery after" /><i>V</i></span></label>
        </div>
        <fieldset className="ba-seg"><legend>Brownout</legend><div className="ba-seg-opts">{[['no', 'No'], ['yes', 'Yes'], ['unknown', 'Not sure']].map(([k, l]) => <button key={k} type="button" aria-pressed={v.brownout === k} onClick={() => setV({ ...v, brownout: k })}>{l}</button>)}</div></fieldset></>}
        <label className="ba-field"><span>Human player</span><textarea value={v.human} onChange={(e) => setV({ ...v, human: e.target.value })} rows={2} maxLength={1000} placeholder="FUEL fed from the CHUTE, timing, misses" /></label>
        <label className="ba-field"><span>Problems</span><textarea value={v.problems} onChange={(e) => setV({ ...v, problems: e.target.value })} rows={2} maxLength={1000} placeholder="What broke, stuck or went wrong" /></label>
        <p className="ba-muted">Rough points from what you entered: <b className="hud-tnum">{points}</b> (1 per FUEL in an active HUB, TOWER {TOWER_POINTS[v.tower] ?? 0}). The match clock was the official one; the HUB inactive first was {run.inactiveFirst}.</p>
        {err && <p className="ba-error" role="alert">{err}</p>}
        <div className="ba-row"><button className="ba-primary ba-save" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save match'}</button><button type="button" className="ba-btn" onClick={onDiscard}>Discard</button></div>
      </form>
    </main>
  )
}
