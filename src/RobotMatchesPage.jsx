import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from './supabase'
import { isSchemaMissing } from './schemaMissing'
import { displayName } from './names'
import { CAP_ROBOT_MATCHES } from './permissions'
import { KINDS, KIND_LABELS, REAL_KINDS, ballsIn, wasted, driverTrends, batteryTrends, compareMatches, filterMatches, fmt } from './robotMatches'
import RobotMatchImport from './RobotMatchImport'
import './BatteriesPage.css'
import './RobotMatches.css'

// The robot match log (migration 0038, ledger 0028): every match the robot
// plays, practice or real, one record each, joining what the robot measured
// with what people saw. Log, trends and compare read one list; the detail is
// /robot/matches/:id. Every write is a database function (writeVia), and
// before 0038 is applied the page says not set up, never 0.

const LIST_COLUMNS = 'id, source, file_name, sim_match_id, kind, started_at, match_label, event_id, alliance, station, robot_match, fms_match_number, auto_name, routine_id, auto_winner, '
  + 'auto_balls, open_balls, closed_balls, passes, balls_total, ready_pct, battery_start, battery_min, battery_end, brownouts, hang_at_seconds, distance_m, duration_s, '
  + 'crew_typed, driver_id, operator_id, coach_id, human_player_id, battery_id, scorer_balls_in, tower, match_score, ranking_points, battery_run_id, drive_session_id'
const when = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
const MAX_COMPARE = 6

/** Everything the log, the detail and the import read, in one place. */
export async function loadMatchLog() {
  const [m, p, b, r, e] = await Promise.all([
    supabase.from('robot_matches').select(LIST_COLUMNS).order('started_at', { ascending: false }).limit(2000),
    supabase.from('profiles').select('id, full_name, nickname, approved, status'),
    supabase.from('batteries').select('id, label, status'),
    supabase.from('auto_routines').select('id, name, active'),
    supabase.from('events').select('id, title, kind, starts_at, ends_at').eq('kind', 'competition').order('starts_at', { ascending: false }).limit(60),
  ])
  if (m.error) return { missing: isSchemaMissing(m.error), error: isSchemaMissing(m.error) ? null : m.error }
  const members = (p.data ?? []).filter((x) => x.approved !== false && (x.status ?? 'active') === 'active').map((x) => ({ ...x, name: displayName(x) }))
    .sort((a, c) => a.name.localeCompare(c.name))
  return { matches: m.data ?? [], members, allNames: new Map((p.data ?? []).map((x) => [x.id, displayName(x)])), batteries: b.data ?? [], routines: r.data ?? [], events: e.data ?? [] }
}

/** Staff, or a member holding robot.matches (0038's _robot_match_writer). */
export function useMatchWriter(isStaff) {
  const [can, setCan] = useState(isStaff)
  useEffect(() => {
    if (isStaff) { setCan(true); return undefined }
    let live = true
    supabase.rpc('has_capability', { p_capability: CAP_ROBOT_MATCHES }).then(({ data }) => { if (live) setCan(data === true) })
    return () => { live = false }
  }, [isStaff])
  return can
}

function Spark({ values, label }) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v !== null && v !== undefined)
  if (pts.length < 2) return <p className="ba-muted">{pts.length ? 'One match so far.' : 'No data yet.'}</p>
  const ys = pts.map(([, v]) => v)
  const lo = Math.min(...ys); const hi = Math.max(...ys); const span = hi - lo || 1
  const n = Math.max(1, values.length - 1)
  const xy = pts.map(([i, v]) => [(i / n) * 100, 44 - ((v - lo) / span) * 40])
  return (
    <figure style={{ margin: 0 }}>
      <svg className="rm-spark" viewBox="0 0 100 48" preserveAspectRatio="none" role="img" aria-label={`${label}: ${ys.map((v) => fmt(v, 1)).join(', ')}`}>
        <line x1="0" y1="46" x2="100" y2="46" />
        <polyline points={xy.map(([x, y]) => `${x},${y}`).join(' ')} />
      </svg>
      <figcaption className="rm-spark-label">{label} · {fmt(lo, 1)} to {fmt(hi, 1)}</figcaption>
    </figure>
  )
}

export default function RobotMatchesPage({ hasRole = () => false }) {
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  const parentOnly = hasRole('parent') && !isStaff
  const writer = useMatchWriter(isStaff)
  const [params, setParams] = useSearchParams()
  const tab = ['log', 'trends', 'compare'].includes(params.get('view')) ? params.get('view') : 'log'
  const f = { kind: params.get('kind') || '', event: params.get('event') || '', driver: params.get('driver') || '', battery: params.get('battery') || '', from: params.get('from') || '', to: params.get('to') || '' }
  const picked = (params.get('ids') || '').split(',').filter(Boolean)
  const [data, setData] = useState({ loading: true })

  const load = useCallback(async () => setData({ loading: false, ...(await loadMatchLog()) }), [])
  useEffect(() => { if (!parentOnly) load() }, [load, parentOnly])

  const set = (patch) => setParams((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k) } return n }, { replace: true })
  const matches = data.matches ?? []
  const shown = useMemo(() => filterMatches(matches, f), [matches, f.kind, f.event, f.driver, f.battery, f.from, f.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = (id) => data.allNames?.get(id) ?? 'Unknown'
  const labelOf = (id) => data.batteries?.find((b) => b.id === id)?.label ?? 'Unknown'
  const drivers = useMemo(() => driverTrends(shown, nameOf), [shown, data.allNames]) // eslint-disable-line react-hooks/exhaustive-deps
  const packs = useMemo(() => batteryTrends(shown, labelOf), [shown, data.batteries]) // eslint-disable-line react-hooks/exhaustive-deps
  const compared = picked.map((id) => matches.find((m) => m.id === id)).filter(Boolean)
  const toggle = (id) => set({ ids: (picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-MAX_COMPARE)).join(',') })

  if (parentOnly) return <main className="ba-wrap"><Link className="ba-back" to="/dashboard">← Home</Link><h1 className="ba-title">Match log</h1><p className="ba-muted">The match log is for students and staff.</p></main>
  if (data.loading) return <main className="ba-wrap rm-wrap"><p className="ba-muted">Loading matches…</p></main>
  if (data.missing) return <main className="ba-wrap rm-wrap"><Link className="ba-back" to="/robot">← Robot</Link><h1 className="ba-title">Match log</h1><div className="ba-empty"><h2>Not set up yet</h2><p>The match log fills once migration 0038 is applied to the database.</p></div></main>
  if (data.error) return <main className="ba-wrap rm-wrap"><Link className="ba-back" to="/robot">← Robot</Link><h1 className="ba-title">Match log</h1><p className="ba-error">{data.error.message}</p></main>

  const real = matches.filter((m) => REAL_KINDS.includes(m.kind)).length
  const usedDrivers = [...new Set(matches.map((m) => m.driver_id).filter(Boolean))].map((id) => [id, nameOf(id)]).sort((a, b) => a[1].localeCompare(b[1]))
  const usedBatteries = [...new Set(matches.map((m) => m.battery_id).filter(Boolean))].map((id) => [id, labelOf(id)]).sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
  const usedEvents = (data.events ?? []).filter((e) => matches.some((m) => m.event_id === e.id))
  const filtered = Object.values(f).some(Boolean)

  return (
    <main className="ba-wrap rm-wrap" data-page="robot-matches">
      <Link className="ba-back" to="/robot">← Robot</Link>
      <header className="ba-head">
        <div>
          <span className="ba-eyebrow">Robot</span>
          <h1 className="ba-title">Match log</h1>
          <p className="ba-sub">Every match the robot plays, practice or real: what it measured, joined with what people saw.</p>
        </div>
        <div className="ba-head-actions"><Link className="ba-link" to="/match-sim">Match simulator →</Link></div>
      </header>
      <div className="ba-tally" data-tally>
        <span><b>{matches.length}</b>matches</span>
        <span><b>{real}</b>on a real field</span>
        <span><b>{matches.filter((m) => m.file_name).length}</b>from the robot</span>
        <span>{matches[0] ? `Last ${when(matches[0].started_at)}` : 'None yet'}</span>
      </div>
      {writer && <RobotMatchImport members={data.members} batteries={data.batteries} routines={data.routines} events={data.events} matches={matches} onDone={load} />}

      <div className="rm-tabs" role="group" aria-label="View">
        {[['log', 'Log', shown.length], ['trends', 'Trends', null], ['compare', 'Compare', picked.length]].map(([k, l, n]) => (
          <button key={k} type="button" className="rm-tab" aria-pressed={tab === k} onClick={() => set({ view: k === 'log' ? '' : k })}>{l}{n !== null && <span>{n}</span>}</button>
        ))}
      </div>

      {tab !== 'compare' && (
        <div className="rm-filters" data-filters>
          <label className="ba-field"><span>Kind</span>
            <select value={f.kind} onChange={(e) => set({ kind: e.target.value })} aria-label="Kind">
              <option value="">All kinds</option><option value="real">Real field only</option>
              {KINDS.filter((k) => matches.some((m) => m.kind === k)).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select></label>
          <label className="ba-field"><span>Event</span>
            <select value={f.event} onChange={(e) => set({ event: e.target.value })} aria-label="Event">
              <option value="">Any event</option>{usedEvents.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select></label>
          <label className="ba-field"><span>Driver</span>
            <select value={f.driver} onChange={(e) => set({ driver: e.target.value })} aria-label="Driver">
              <option value="">Any driver</option>{usedDrivers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select></label>
          <label className="ba-field"><span>Battery</span>
            <select value={f.battery} onChange={(e) => set({ battery: e.target.value })} aria-label="Battery">
              <option value="">Any battery</option>{usedBatteries.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select></label>
          <label className="ba-field"><span>From</span><input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} aria-label="From" /></label>
          <label className="ba-field"><span>To</span><input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} aria-label="To" /></label>
          {filtered && <button type="button" className="ba-btn rm-filter-clear" onClick={() => set({ kind: '', event: '', driver: '', battery: '', from: '', to: '' })}>Clear filters</button>}
        </div>
      )}

      {tab === 'log' && (shown.length ? (
        <>
          <ul className="rm-list" data-list>
            {shown.map((m) => {
              const bi = ballsIn(m); const w = wasted(m)
              return (
                <li key={m.id} className={`rm-item${REAL_KINDS.includes(m.kind) ? ' rm-item-real' : ''}`} data-match={m.match_label}>
                  <label className="rm-pick" title="Compare"><input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} aria-label={`Compare ${m.match_label}`} /></label>
                  <Link className="rm-open" to={`/robot/matches/${m.id}`}>
                    <span className="rm-top">
                      <span className="rm-label">{m.match_label ?? KIND_LABELS[m.kind]}</span>
                      <span className={`rm-pill${REAL_KINDS.includes(m.kind) ? ' rm-pill-real' : ''}`}>{KIND_LABELS[m.kind]}</span>
                      {m.source !== 'robot_file' && <span className="rm-pill">{m.source === 'both' ? 'Robot + Match Sim' : 'Match Sim only'}</span>}
                      <span className="rm-when">{when(m.started_at)}</span>
                    </span>
                    <span className="rm-crew">{[m.driver_id && `Driver ${nameOf(m.driver_id)}`, m.battery_id && `Battery ${labelOf(m.battery_id)}`, m.auto_name].filter(Boolean).join(' · ') || 'No crew linked'}</span>
                    <span className="rm-nums">
                      <span><b>{fmt(bi)}</b><i>Balls in</i></span>
                      <span className={w > 0 ? 'rm-bad' : ''}><b>{fmt(w)}</b><i>Closed hub</i></span>
                      <span><b>{fmt(m.ready_pct)}</b><i>Ready %</i></span>
                      <span className={m.battery_min !== null && Number(m.battery_min) < 10.5 ? 'rm-bad' : ''}><b>{fmt(m.battery_min, 1)}</b><i>Min V</i></span>
                      <span className={m.brownouts > 0 ? 'rm-bad' : ''}><b>{fmt(m.brownouts)}</b><i>Brownouts</i></span>
                      <span><b>{fmt(m.hang_at_seconds, 1)}</b><i>Hung at s</i></span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          {picked.length > 0 && (
            <div className="rm-compare-bar"><span className="hud-mono">{picked.length} picked (up to {MAX_COMPARE})</span>
              <span className="ba-row" style={{ margin: 0 }}>
                <button type="button" className="ba-btn" onClick={() => set({ ids: '' })}>Clear</button>
                <button type="button" className="ba-primary" disabled={picked.length < 2} onClick={() => set({ view: 'compare' })} data-compare>Compare {picked.length}</button>
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="ba-empty"><h2>{filtered ? 'No matches fit these filters' : 'No matches yet'}</h2><p>{filtered ? 'Clear a filter to see more.' : writer ? 'Pull the robot’s files from GitHub above, or save a match on the Match simulator.' : 'A drive-team lead imports the robot’s files after each session.'}</p></div>
      ))}

      {tab === 'compare' && (compared.length >= 2 ? (
        <section className="rm-section" data-compare-table>
          <h2>Side by side</h2>
          <div className="rm-table-box">
            <table className="rm-table">
              <thead><tr><th scope="col">Match</th>{compared.map((m) => <th key={m.id} scope="col"><Link to={`/robot/matches/${m.id}`}>{m.match_label}</Link><br />{when(m.started_at)}<br />{m.driver_id ? nameOf(m.driver_id) : 'No driver'}</th>)}</tr></thead>
              <tbody>
                {compareMatches(compared).map((row) => (
                  <tr key={row.key} data-row={row.key}><th scope="row">{row.label}</th>{row.values.map((v, i) => <td key={compared[i].id} className={row.best !== null && v === row.best ? 'rm-best' : ''}>{fmt(v, Number.isInteger(v) || v === null ? 0 : 1)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ba-muted">▲ marks the best value where higher or lower is better. -- means the match has no number for it, never 0.</p>
        </section>
      ) : <div className="ba-empty"><h2>Pick two or more matches</h2><p>Tick the box beside each match in the Log, then press Compare.</p><button type="button" className="ba-primary" onClick={() => set({ view: '' })}>Go to the log</button></div>)}

      {tab === 'trends' && (
        <>
          <h2 className="ba-h3">Drivers</h2>
          {drivers.length ? <div className="rm-trends" data-trends="drivers">{drivers.map((d) => (
            <article key={d.id} className="rm-trend" data-driver={d.name}>
              <h3>{d.name}</h3><span className="rm-when">{d.matches} match{d.matches === 1 ? '' : 'es'}</span>
              <div className="rm-nums">
                <span><b>{fmt(d.avg.ballsIn, 1)}</b><i>Avg balls in</i></span>
                <span className={d.avg.wasted > 0 ? 'rm-bad' : ''}><b>{fmt(d.avg.wasted, 1)}</b><i>Avg closed hub</i></span>
                <span><b>{fmt(d.avg.ready, 0)}</b><i>Avg ready %</i></span>
                <span><b>{fmt(d.avg.hang, 1)}</b><i>Avg hung at s</i></span>
              </div>
              <Spark values={d.points.map((p) => p.ballsIn)} label="Balls in, oldest first" />
              <Spark values={d.points.map((p) => p.ready)} label="Ready %, oldest first" />
            </article>
          ))}</div> : <p className="ba-muted">No match has a driver linked yet.</p>}
          <h2 className="ba-h3">Batteries</h2>
          {packs.length ? <div className="rm-trends" data-trends="batteries">{packs.map((b) => (
            <article key={b.id} className="rm-trend" data-battery={b.label}>
              <h3>{b.label}</h3><span className="rm-when">{b.runs} match{b.runs === 1 ? '' : 'es'}</span>
              <div className="rm-nums">
                <span className={b.lowest !== null && b.lowest < 10.5 ? 'rm-bad' : ''}><b>{fmt(b.lowest, 2)}</b><i>Lowest V</i></span>
                <span><b>{fmt(b.avgMin, 2)}</b><i>Avg min V</i></span>
                <span className={b.brownouts > 0 ? 'rm-bad' : ''}><b>{fmt(b.brownouts)}</b><i>Brownouts</i></span>
              </div>
              <Spark values={b.points.map((p) => p.min)} label="Minimum V, oldest first" />
            </article>
          ))}</div> : <p className="ba-muted">No match has a battery linked yet.</p>}
        </>
      )}
    </main>
  )
}
