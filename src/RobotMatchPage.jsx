import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { downloadText } from './download'
import { KIND_LABELS, REAL_KINDS, ballsIn, wasted, notReadyReasons, fmt } from './robotMatches'
import { loadMatchLog, useMatchWriter } from './RobotMatchesPage'
import './BatteriesPage.css'
import './RobotMatches.css'

// One robot match (0038, ledger 0028): the scorecard, the battery by phase,
// why the shooter was not ready, the timeline, the crew, and the notes and
// video people add. Writers (staff, robot.matches) edit the people's fields.

const when = (iso) => new Date(iso).toLocaleString('en-US', { weekday: undefined, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
const TOWER = [['', 'Not recorded'], ['none', 'No climb'], ['level1', 'LEVEL 1'], ['level2', 'LEVEL 2'], ['level3', 'LEVEL 3'], ['failed', 'Tried, failed']]
const NOTE_FIELDS = [['notes_driver', 'Driver'], ['notes_operator', 'Operator'], ['notes_coach', 'Drive coach'], ['notes_human_player', 'Human player'], ['notes_pit', 'Pit']]
const CREW = [['driver_id', 'Driver'], ['operator_id', 'Operator'], ['coach_id', 'Drive coach'], ['human_player_id', 'Human player']]
const EDITABLE = ['driver_id', 'operator_id', 'coach_id', 'human_player_id', 'battery_id', 'routine_id', 'event_id', 'match_label', 'scorer_balls_in', 'tower', 'fouls',
  'match_score', 'ranking_points', 'notes_driver', 'notes_operator', 'notes_coach', 'notes_human_player', 'notes_pit', 'video_url', 'wpilog_file']
const asForm = (m) => Object.fromEntries(EDITABLE.map((k) => [k, m[k] === null || m[k] === undefined ? '' : String(m[k])]))

function Bars({ items, unit, digits = 1, low }) {
  const hi = Math.max(...items.map((x) => x.value ?? 0), 0.001)
  return (
    <ul className="rm-bars">
      {items.map((x) => (
        <li key={x.label} className={`rm-bar${low && x.value !== null && x.value < low ? ' rm-bar-low' : ''}`}>
          <span>{x.label}</span>
          <span className="rm-bar-track" aria-hidden="true"><span className="rm-bar-fill" style={{ display: 'block', width: `${x.value === null ? 0 : Math.max(2, (x.value / hi) * 100)}%` }} /></span>
          <b>{fmt(x.value, digits)}{x.value === null ? '' : unit}</b>
        </li>
      ))}
    </ul>
  )
}

export default function RobotMatchPage({ hasRole = () => false }) {
  const { id } = useParams()
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  const parentOnly = hasRole('parent') && !isStaff
  const writer = useMatchWriter(isStaff)
  const [s, setS] = useState({ loading: true })
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const [one, ctx] = await Promise.all([supabase.from('robot_matches').select('*').eq('id', id).maybeSingle(), loadMatchLog()])
    if (one.error) { setS({ loading: false, missing: isSchemaMissing(one.error), error: isSchemaMissing(one.error) ? null : one.error }); return }
    setS({ loading: false, match: one.data, ...ctx })
    if (one.data) setForm(asForm(one.data))
  }, [id])
  useEffect(() => { if (!parentOnly) load() }, [load, parentOnly])

  const back = <Link className="ba-back" to="/robot/matches">← Match log</Link>
  if (parentOnly) return <main className="ba-wrap"><Link className="ba-back" to="/dashboard">← Home</Link><p className="ba-muted">The match log is for students and staff.</p></main>
  if (s.loading) return <main className="ba-wrap"><p className="ba-muted">Loading the match…</p></main>
  if (s.missing) return <main className="ba-wrap">{back}<div className="ba-empty"><h2>Not set up yet</h2><p>The match log fills once migration 0038 is applied to the database.</p></div></main>
  if (s.error) return <main className="ba-wrap">{back}<p className="ba-error">{s.error.message}</p></main>
  const m = s.match
  if (!m) return <main className="ba-wrap">{back}<div className="ba-empty"><h2>No such match</h2><p>It may have been merged into another record. Open the log to find it.</p></div></main>

  const raw = m.raw ?? null
  const nameOf = (x) => s.allNames?.get(x) ?? 'Unknown'
  const bat = s.batteries?.find((b) => b.id === m.battery_id)
  const routine = s.routines?.find((r) => r.id === m.routine_id)
  const event = s.events?.find((e) => e.id === m.event_id)
  const phases = Array.isArray(raw?.phases) ? raw.phases : []
  const events = Array.isArray(raw?.events) ? raw.events : []
  const reasons = notReadyReasons(raw)
  const bi = ballsIn(m); const w = wasted(m)
  const score = [
    ['Balls in', fmt(bi), false, m.scorer_balls_in !== null && m.scorer_balls_in !== undefined ? 'scorer count' : 'robot count'],
    ['Into a closed hub', fmt(w), w > 0], ['Passes', fmt(m.passes)], ['Auto balls', fmt(m.auto_balls)],
    ['Ready while RT held', m.ready_pct === null ? '--' : `${fmt(m.ready_pct)}%`, m.ready_pct !== null && Number(m.ready_pct) < 70],
    ['Hung at', m.hang_at_seconds === null ? '--' : `${fmt(m.hang_at_seconds, 1)} s`], ['TOWER', TOWER.find(([k]) => k === (m.tower ?? ''))?.[1] ?? '--'],
    ['Battery min', m.battery_min === null ? '--' : `${fmt(m.battery_min, 2)} V`, m.battery_min !== null && Number(m.battery_min) < 10.5],
    ['Brownouts', fmt(m.brownouts), m.brownouts > 0], ['Distance', m.distance_m === null ? '--' : `${fmt(m.distance_m)} m`],
    ['Alliance score', fmt(m.match_score), false, m.official_source === 'tba' ? 'The Blue Alliance' : m.official_source === 'manual' ? 'typed in' : null],
    ['Ranking points', fmt(m.ranking_points, 0)],
  ]

  async function save(e) {
    e.preventDefault()
    if (busy) return
    const fields = {}
    for (const k of EDITABLE) if ((form[k] ?? '') !== asForm(m)[k]) fields[k] = form[k] === '' ? null : ['scorer_balls_in', 'match_score'].includes(k) ? Number(form[k]) : k === 'ranking_points' ? Number(form[k]) : form[k]
    if (!Object.keys(fields).length) { setMsg('Nothing changed.'); return }
    setBusy('save'); setMsg('')
    const r = await writeVia(supabase, 'robot_match_update', { p_id: m.id, p_fields: fields })
    setBusy('')
    if (r.error || r.via !== 'function') { setMsg(r.error?.message || 'The match log is not set up yet. Nothing was saved.'); return }
    setMsg('Saved.')
    await load()
  }

  async function fillOfficial() {
    setBusy('tba'); setMsg('')
    const r = await writeVia(supabase, 'robot_match_fill_official', { p_id: m.id })
    setBusy('')
    if (r.error || r.via !== 'function') { setMsg(r.error?.message || 'The match log is not set up yet.'); return }
    setMsg(r.data?.official === 'filled' ? 'Score and RP filled from The Blue Alliance.' : 'No Blue Alliance result for this match yet. Import the event’s results on Scouting, then try again.')
    await load()
  }

  const field = (k, label, props = {}) => (
    <label className="ba-field" key={k}><span>{label}</span><input value={form?.[k] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} {...props} /></label>
  )

  return (
    <main className="ba-wrap rm-wrap" data-page="robot-match">
      {back}
      <header className="ba-head">
        <div>
          <span className="ba-eyebrow">{KIND_LABELS[m.kind]}{event ? ` · ${event.title}` : ''}</span>
          <h1 className="ba-title" data-label>{m.match_label ?? KIND_LABELS[m.kind]}</h1>
          <p className="ba-sub">{when(m.started_at)}{m.alliance ? ` · ${m.alliance} ${m.station ?? ''}` : ''}{m.duration_s !== null ? ` · ${fmt(m.duration_s)} s` : ''} · {m.source === 'both' ? 'Robot file + Match Sim' : m.source === 'sim_page' ? 'Match Sim only' : 'Robot file'}</p>
        </div>
        {m.video_url && <div className="ba-head-actions"><a className="ba-primary" href={m.video_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Watch video ↗</a></div>}
      </header>
      {msg && <p className="ba-msg" role="status">{msg}</p>}

      <div className="rm-score" data-scorecard>
        {score.map(([label, v, bad, note]) => <div key={label} className={bad ? 'rm-bad' : ''}><b>{v}</b><i>{label}</i>{note && <span className="ba-muted" style={{ display: 'block', margin: 0, fontSize: '0.72rem' }}>{note}</span>}</div>)}
      </div>

      <div className="rm-cols">
        <section className="rm-section" data-battery-phases>
          <h2>Battery by phase{bat ? ` · ${bat.label}` : ''}</h2>
          {phases.length ? <Bars items={phases.map((p) => ({ label: p.phase, value: typeof p.batteryMin === 'number' ? p.batteryMin : null }))} unit=" V" digits={2} low={10.5} /> : <p className="ba-muted">No phase data (this record came from the Match Sim page).</p>}
          {raw?.battery && <p className="ba-muted">Start {fmt(raw.battery.start, 2)} V · end {fmt(raw.battery.end, 2)} V · lowest {fmt(raw.battery.min, 2)} V{raw.battery.minWhere ? ` at ${raw.battery.minWhere}` : ''} · {fmt(raw.battery.secondsBelow10V, 1)} s below 10 V</p>}
          {phases.length > 0 && <p className="ba-muted">Shots by phase: {phases.map((p) => `${p.phase} ${p.shots ?? '--'}`).join(' · ')}</p>}
        </section>
        <section className="rm-section" data-not-ready>
          <h2>Why it was not ready to fire</h2>
          {reasons.length ? <Bars items={reasons.map((r) => ({ label: r.reason, value: r.seconds }))} unit=" s" /> : <p className="ba-muted">{raw ? 'Ready every second RT was held, or no reason was recorded.' : 'Only the robot file records this.'}</p>}
          {raw?.aim && <p className="ba-muted">Aim on {fmt(raw.aim.aimOnPct)}% · position known {fmt(raw.aim.positionKnownPct)}% · longest without a vision fix {fmt(raw.aim.longestSecondsWithoutVisionFix, 1)} s</p>}
          {raw?.drive && <p className="ba-muted">Defense {fmt(raw.drive.defenseSeconds)} s · top speed {fmt(raw.drive.topSpeedMps, 1)} m/s · peak drive current {fmt(raw.drive.driveSupplyAmpsPeak)} A</p>}
        </section>
      </div>

      <section className="rm-section" data-timeline>
        <h2>Timeline</h2>
        {events.length ? <ol className="rm-timeline">{events.map((e, i) => <li key={i}><span>{e.clock ?? fmt(e.t, 1)}</span><span>{e.phase ?? ''}</span><p>{e.text}</p></li>)}</ol> : <p className="ba-muted">No timeline (only the robot file records one).</p>}
      </section>

      <section className="rm-section" data-crew>
        <h2>Crew and links</h2>
        <dl className="ba-facts">
          {CREW.map(([k, label]) => <div key={k}><dt>{label}</dt><dd>{m[k] ? nameOf(m[k]) : '--'}{m.crew_typed?.[k.replace('_id', '')] ? <span className="rm-typed"> · typed “{m.crew_typed[k.replace('_id', '')]}”</span> : null}</dd></div>)}
          <div><dt>Battery</dt><dd>{bat?.label ?? '--'}{m.crew_typed?.battery ? <span className="rm-typed"> · typed “{m.crew_typed.battery}”</span> : null}</dd></div>
          <div><dt>Auto</dt><dd>{routine?.name ?? m.auto_name ?? '--'}</dd></div>
          <div><dt>Event</dt><dd>{event?.title ?? (REAL_KINDS.includes(m.kind) ? 'Not linked' : '--')}</dd></div>
          <div><dt>Log file</dt><dd>{m.wpilog_file ?? '--'}</dd></div>
        </dl>
        <p className="ba-muted">{m.battery_run_id ? 'Logged one battery run.' : 'No battery run logged.'} {m.drive_session_id ? 'Logged the driver’s drive time.' : 'No drive time logged.'}</p>
      </section>

      <section className="rm-section" data-notes>
        <h2>Notes</h2>
        {NOTE_FIELDS.some(([k]) => m[k]) ? <dl className="ba-facts">{NOTE_FIELDS.filter(([k]) => m[k]).map(([k, l]) => <div key={k}><dt>{l}</dt><dd className="ba-note">{m[k]}</dd></div>)}</dl> : <p className="ba-muted">No notes yet.</p>}
        {m.fouls && <p className="ba-muted">Fouls: {m.fouls}</p>}
      </section>

      {writer && form && (
        <details className="ba-staff" data-edit>
          <summary>Edit this match</summary>
          <form className="ba-form" onSubmit={save}>
            <div className="rm-edit-grid">
              {CREW.map(([k, label]) => (
                <label className="ba-field" key={k}><span>{label}</span>
                  <select value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}><option value="">Nobody</option>{s.members.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              ))}
              <label className="ba-field"><span>Battery</span><select value={form.battery_id} onChange={(e) => setForm((f) => ({ ...f, battery_id: e.target.value }))}><option value="">None</option>{s.batteries.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
              <label className="ba-field"><span>Auto routine</span><select value={form.routine_id} onChange={(e) => setForm((f) => ({ ...f, routine_id: e.target.value }))}><option value="">None</option>{s.routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
              <label className="ba-field"><span>Event</span><select value={form.event_id} onChange={(e) => setForm((f) => ({ ...f, event_id: e.target.value }))}><option value="">None</option>{s.events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
              {field('match_label', 'Label', { maxLength: 40 })}
              {field('scorer_balls_in', 'Scorer count of balls in', { inputMode: 'numeric', pattern: '[0-9]*' })}
              <label className="ba-field"><span>TOWER</span><select value={form.tower} onChange={(e) => setForm((f) => ({ ...f, tower: e.target.value }))}>{TOWER.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              {field('match_score', 'Alliance score', { inputMode: 'numeric', pattern: '[0-9]*' })}
              {field('ranking_points', 'Ranking points', { inputMode: 'decimal' })}
              {field('fouls', 'Fouls', { maxLength: 500 })}
              {field('video_url', 'Video link', { type: 'url', placeholder: 'https://' })}
              {field('wpilog_file', '.wpilog file name', { maxLength: 160 })}
            </div>
            {NOTE_FIELDS.map(([k, l]) => (
              <label className="ba-field" key={k}><span>{l} notes</span><textarea data-note={k} maxLength={2000} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} /></label>
            ))}
            <div className="ba-row">
              <button type="submit" className="ba-primary" disabled={!!busy} data-save>{busy === 'save' ? 'Saving…' : 'Save'}</button>
              {m.event_id && <button type="button" className="ba-btn" disabled={!!busy} onClick={fillOfficial}>Fill score from The Blue Alliance</button>}
            </div>
          </form>
        </details>
      )}

      {raw && (
        <details className="ba-rules" data-raw>
          <summary>The robot’s file</summary>
          <p className="ba-muted">{m.file_name} · schema {m.schema_version}. Every field is kept, including ones this page does not show yet.</p>
          <button type="button" className="ba-btn" onClick={() => downloadText(JSON.stringify(raw, null, 2), m.file_name, 'application/json')}>Download</button>
          <pre className="rm-raw">{JSON.stringify(raw, null, 2)}</pre>
        </details>
      )}
    </main>
  )
}
