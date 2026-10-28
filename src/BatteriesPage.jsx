import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { displayName } from './names'
import { toCsv } from './csv'
import { downloadText, laStamp } from './download'
import {
  CHECK_THRESHOLDS, CHARGE_STATES, RUN_KINDS, BROWNOUT, STATUSES, FILTERS, ROBOT_R, REST_V, LEVEL_LABELS,
  batteryBoard, applyFilter, chargeLabel, statusLabel, kindLabel, brownoutLabel, fleetLine, verdictItems, verdictText, robotLevel,
  readNumber, runProblem, runArgs, canEditRun, CSV_COLUMNS, csvRows,
} from './batteries'
import { fetchBatteryHistory, parseBatteryHistory, planLoadTests, loadTestRows } from './robotMatches'
import { useMatchWriter } from './RobotMatchesPage'
import './BatteriesPage.css'

// The battery log (migration 0026, ledger 0017). Every write is a database
// function through writeVia with NO direct fallback: before 0026 is pasted the
// page reads "not set up yet", and a write that finds no function is reported
// as not set up, never as saved.
//
// Robot telemetry (migration 0041, ledger 0031): the robot's own resistance
// reading (battery + main wiring, its own thresholds, never the Beak column),
// the fleet line that tells a worn battery from robot wiring, the latest
// verdict, and the pit load tests imported from the robot repo. Runs are read
// with select('*'), so before 0041 the new columns are simply absent and every
// robot reading shows as not measured; the load-test import reports not set
// up through isSchemaMissing.

const REMEMBER = 'techmen:battery-log:last'
const recall = () => { try { return JSON.parse(localStorage.getItem(REMEMBER) || 'null') ?? {} } catch { return {} } }
const remember = (v) => { try { localStorage.setItem(REMEMBER, JSON.stringify(v)) } catch { /* private window */ } }

const when = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) : 'Never'
const volts = (v) => (v === null || v === undefined ? '--' : Number(v).toFixed(2))
const errText = (e) => e?.message || 'Something went wrong. Nothing was changed.'
const mohm = (v) => (v === null || v === undefined ? '--' : Number(v).toFixed(1))

/** The robot R readings, oldest first, as a small line with the 22 and 28 lines behind it. */
function RTrend({ values, label }) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v !== null && v !== undefined)
  if (pts.length < 2) return null
  const lo = Math.min(...pts.map(([, v]) => v), ROBOT_R.OK_UNDER - 6), hi = Math.max(...pts.map(([, v]) => v), ROBOT_R.PULL_OVER + 4)
  const y = (v) => 30 - ((v - lo) / (hi - lo)) * 28
  const n = Math.max(1, values.length - 1)
  return (
    <svg className="ba-trend" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={`${label}: ${pts.map(([, v]) => mohm(v)).join(', ')} mΩ, oldest first`}>
      <line className="ba-trend-pull" x1="0" x2="100" y1={y(ROBOT_R.PULL_OVER)} y2={y(ROBOT_R.PULL_OVER)} />
      <line className="ba-trend-watch" x1="0" x2="100" y1={y(ROBOT_R.OK_UNDER)} y2={y(ROBOT_R.OK_UNDER)} />
      <polyline points={pts.map(([i, v]) => `${(i / n) * 100},${y(v)}`).join(' ')} />
    </svg>
  )
}

/** The verdict in plain words: the tag in bold, then what the robot said after it. */
function VerdictList({ verdict }) {
  const items = verdictItems(verdict)
  if (!items.length) return null
  return <ul className="ba-vlist">{items.map((x, i) => <li key={i} className={`ba-vitem-${x.key}`}>{x.label && <b>{x.label}</b>} {verdictText(x)}</li>)}</ul>
}

function VerdictTags({ verdict }) {
  const tags = verdictItems(verdict).filter((x) => x.key !== 'detail')
  if (!tags.length) return null
  return <span className="ba-verdict">{tags.map((x, i) => <span key={i} className={`ba-vtag ba-vtag-${x.key}`}>{x.label}</span>)}</span>
}

// Each call site is a literal writeVia so tests/connector-coverage.test.js
// checks its function and argument names against the SQL.
function done(r) {
  if (r.error) throw r.error
  if (r.via !== 'function') throw { code: 'PGRST202', message: 'The battery log is not set up yet. Nothing was saved.' }
  return r.data
}

export default function BatteriesPage({ session, hasRole = () => false }) {
  const uid = session?.user?.id
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  const parentOnly = hasRole('parent') && !isStaff
  const writer = useMatchWriter(isStaff)
  const [state, setState] = useState({ loading: true })
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null) // battery id whose sheet is open
  const [logFor, setLogFor] = useState(null) // { batteryId, run? } when the run form is open
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const [b, r, ev] = await Promise.all([
      supabase.from('batteries').select('*'),
      supabase.from('battery_runs').select('*').order('ran_at', { ascending: false }).limit(3000),
      supabase.from('events').select('id, title, kind, starts_at').in('kind', ['competition', 'build', 'training', 'meeting'])
        .gte('starts_at', new Date(Date.now() - 30 * 864e5).toISOString()).order('starts_at', { ascending: true }).limit(60),
    ])
    if (b.error || r.error) {
      const e = b.error || r.error
      setState({ loading: false, missing: isSchemaMissing(e), error: isSchemaMissing(e) ? null : e })
      return
    }
    const ids = [...new Set((r.data ?? []).map((x) => x.member_id))]
    const p = ids.length ? await supabase.from('profiles').select('id, full_name, nickname').in('id', ids) : { data: [] }
    setState({ loading: false, batteries: b.data ?? [], runs: r.data ?? [], events: ev.data ?? [], names: new Map((p.data ?? []).map((x) => [x.id, displayName(x)])) })
  }, [])
  useEffect(() => { if (!parentOnly) load() }, [load, parentOnly])

  const board = useMemo(() => batteryBoard(state.batteries ?? [], state.runs ?? []), [state.batteries, state.runs])
  const fleet = useMemo(() => fleetLine(board), [board])
  const shown = applyFilter(board, filter)
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, applyFilter(board, f.key).length])), [board])

  async function setCharge(b, next) {
    if (busy || b.charge_state === next) return
    setBusy(b.id); setMsg('')
    // Shown at once; put back if the save fails.
    setState((s) => ({ ...s, batteries: s.batteries.map((x) => x.id === b.id ? { ...x, charge_state: next } : x) }))
    try { done(await writeVia(supabase, 'battery_set_charge', { p_battery: b.id, p_state: next })); setMsg(`${b.label}: ${chargeLabel(next)}`) } catch (e) {
      setState((s) => ({ ...s, batteries: s.batteries.map((x) => x.id === b.id ? { ...x, charge_state: b.charge_state } : x) }))
      setMsg(errText(e))
    }
    setBusy('')
  }

  function exportCsv() {
    const rows = csvRows(state.batteries, state.runs, { nameOf: (id) => state.names.get(id) ?? '', eventOf: (id) => state.events.find((e) => e.id === id)?.title ?? '' })
    downloadText(toCsv(CSV_COLUMNS, rows, { note: `Techmen battery log, exported ${laStamp()}. Blank voltage or resistance means not measured, never zero.` }), `techmen-batteries-${laStamp()}.csv`)
  }

  if (parentOnly) return <main className="ba-wrap"><h1 className="ba-title">Batteries</h1><p className="ba-muted">The battery log is for students and staff.</p><Link className="ba-link" to="/dashboard">Back to Home</Link></main>
  if (state.loading) return <main className="ba-wrap"><h1 className="ba-title">Batteries</h1><p className="ba-muted" role="status">Loading the battery log…</p></main>
  if (state.missing) return <main className="ba-wrap"><Link className="ba-back" to="/robot">← Robot</Link><h1 className="ba-title">Batteries</h1><div className="ba-empty"><h2>Not set up yet</h2><p>The battery log starts when migration 0026 is pasted into Supabase. Everything else in the app works as before.</p></div></main>
  if (state.error) return <main className="ba-wrap"><h1 className="ba-title">Batteries</h1><p className="ba-error" role="alert">{errText(state.error)}</p><button className="ba-btn" onClick={load}>Try again</button></main>

  const opened = open ? board.find((b) => b.id === open) : null
  const last = recall()
  return (
    <main className="ba-wrap" data-page="batteries">
      <Link className="ba-back" to="/robot">← Robot</Link>
      <header className="ba-head">
        <div>
          <span className="ba-eyebrow">Pit electrical</span>
          <h1 className="ba-title">Batteries</h1>
          <p className="ba-sub">Worst first. Tap a battery for its history.</p>
        </div>
        <div className="ba-head-actions">
          <button className="ba-primary" disabled={!board.some((b) => b.status !== 'retired')}
            onClick={() => setLogFor({ batteryId: board.find((b) => b.id === last.battery && b.status !== 'retired')?.id ?? board.find((b) => b.status !== 'retired')?.id })}>Log a run</button>
          <button className="ba-btn" onClick={exportCsv} disabled={!state.runs.length}>CSV</button>
        </div>
      </header>

      <div className="ba-tally" aria-label="Battery summary">
        <span><b className="hud-tnum">{counts.ready}</b> match-ready</span>
        <span className={counts.check ? 'ba-tally-warn' : ''}><b className="hud-tnum">{counts.check}</b> to check</span>
        <span><b className="hud-tnum">{counts.all}</b> in service</span>
      </div>

      {board.length > 0 && <FleetLine fleet={fleet} />}

      <nav className="ba-filters" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.key} className="ba-filter" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label} <span className="hud-tnum">{counts[f.key]}</span>
          </button>
        ))}
      </nav>
      {msg && <p className="ba-msg" role="status">{msg}</p>}

      {!board.length ? (
        <div className="ba-empty">
          <h2>No batteries yet</h2>
          <p>{isStaff ? 'Add the team set below, for example B01 through B12.' : 'A mentor adds the team batteries. Ask one to add them.'}</p>
        </div>
      ) : !shown.length ? (
        <div className="ba-empty"><h2>{filter === 'ready' ? 'Nothing is match-ready' : 'Nothing here'}</h2><p>{filter === 'ready' ? 'Match-ready means a competition battery that is charged and not flagged. Charge one, or check the flagged ones.' : 'Try another filter.'}</p><button className="ba-btn" onClick={() => setFilter('all')}>Show all</button></div>
      ) : (
        <ul className="ba-board">
          {shown.map((b) => (
            <li key={b.id} className={`ba-card${b.check ? ' ba-card-check' : ''}${b.status === 'retired' ? ' ba-card-retired' : ''}${b.matchReady ? ' ba-card-ready' : ''}`} data-battery={b.label}>
              <button className="ba-card-open" onClick={() => setOpen(b.id)} aria-label={`${b.label}: open history`}>
                <span className="ba-label">{b.label}</span>
                <span className="ba-pills">
                  <span className={`ba-pill ba-pill-${b.status}`}>{statusLabel(b.status)}</span>
                  {b.check && <span className="ba-pill ba-pill-check">Check</span>}
                  {b.matchReady && <span className="ba-pill ba-pill-ready">Ready</span>}
                </span>
                <span className="ba-stats">
                  <span className={b.restLevel ? `ba-lvl-${b.restLevel}` : ''} data-stat="rest"><b className="hud-tnum">{volts(b.restingVolts ?? b.lastVolts)}</b><i>rest V</i></span>
                  <span className={b.robotLevel ? `ba-lvl-${b.robotLevel}` : ''} data-stat="robot-r"><b className="hud-tnum">{mohm(b.robotR)}</b><i>robot mΩ</i></span>
                  <span className={b.brownouts ? 'ba-bad' : ''}><b className="hud-tnum">{b.brownouts}</b><i>brownouts</i></span>
                  <span><b className="hud-tnum">{b.runCount}</b><i>runs</i></span>
                </span>
                {(b.robotTrend.length > 1 || b.verdict || b.standsOut) && (
                  <span className="ba-telemetry">
                    <RTrend values={b.robotTrend} label={`${b.label} robot resistance`} />
                    {b.standsOut && <span className="ba-vtag ba-vtag-standout">Stands out</span>}
                    <VerdictTags verdict={b.verdict} />
                  </span>
                )}
                <span className="ba-last hud-mono">{b.lastUsed ? `Last used ${when(b.lastUsed)}` : 'Not used yet'}</span>
                {b.check && <span className="ba-reason">{b.reasons[0]}</span>}
              </button>
              {b.status !== 'retired' && (
                <div className="ba-charge" role="group" aria-label={`${b.label} charge state`}>
                  {CHARGE_STATES.map((c) => (
                    <button key={c.key} className={`ba-charge-btn ba-charge-${c.key}`} aria-pressed={b.charge_state === c.key}
                      disabled={busy === b.id} onClick={() => setCharge(b, c.key)}>{c.short}</button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="ba-rules">
        <summary>What flags Check</summary>
        <p>A brownout in the last {CHECK_THRESHOLDS.BROWNOUT_LOOKBACK} runs, a resting voltage before a match under {CHECK_THRESHOLDS.MIN_RESTING_VOLTS} V, Battery Beak resistance over {CHECK_THRESHOLDS.MAX_RESISTANCE_MOHM} mΩ, or the robot reading over {ROBOT_R.PULL_OVER} mΩ last time. These are proposed defaults. A measurement left blank is not recorded, never zero. Logging a match marks a charged battery as needing a charge.</p>
      </details>
      <RobotRHelp />

      {writer && <LoadTests board={board} runs={state.runs} onDone={async (text) => { setMsg(text); await load() }} />}
      {isStaff && <StaffBatteries onDone={async (text) => { setMsg(text); await load() }} />}

      {opened && <BatterySheet b={opened} isStaff={isStaff} uid={uid} names={state.names} events={state.events}
        onClose={() => setOpen(null)} onLog={(run) => { setOpen(null); setLogFor({ batteryId: opened.id, run }) }}
        onSaved={async (text) => { setMsg(text); await load() }} />}
      {logFor && <RunForm board={board} events={state.events} start={logFor} onClose={() => setLogFor(null)}
        onSaved={async (text) => { setLogFor(null); setMsg(text); await load() }} />}
    </main>
  )
}

function FleetLine({ fleet }) {
  const tone = fleet.diagnosis === 'wiring' ? 'pull' : fleet.diagnosis === 'battery' ? 'watch' : fleet.diagnosis === 'ok' ? 'ok' : 'none'
  return (
    <section className={`ba-fleet ba-fleet-${tone}`} aria-label="Fleet robot resistance" data-fleet={fleet.diagnosis}>
      <div className="ba-fleet-num">
        <b className="hud-tnum">{mohm(fleet.median)}</b>
        <i>fleet median robot mΩ{fleet.readings ? ` · ${fleet.readings} batteries` : ''}</i>
      </div>
      <div className="ba-fleet-say">
        <strong>{fleet.diagnosis === 'wiring' ? 'Robot wiring' : fleet.diagnosis === 'battery' ? 'This battery' : fleet.diagnosis === 'ok' ? 'Fleet normal' : 'Not enough readings'}</strong>
        <span>{fleet.says}</span>
      </div>
    </section>
  )
}

function RobotRHelp() {
  return (
    <details className="ba-rules" data-help="robot-r">
      <summary>Robot mΩ vs Beak mΩ</summary>
      <p>The robot measures resistance from its own load, so it counts the battery <b>plus</b> the main wiring (SB50, 120 A breaker, PDH lugs, leads). It reads 5 to 10 mΩ above a Battery Beak on the battery alone, so the two are kept apart.</p>
      <ul className="ba-help-list">
        <li><b className="ba-lvl-ok">OK</b> under {ROBOT_R.OK_UNDER} mΩ · <b className="ba-lvl-watch">Watch</b> {ROBOT_R.OK_UNDER} to {ROBOT_R.PULL_OVER} · <b className="ba-lvl-pull">Pull</b> over {ROBOT_R.PULL_OVER}, or over the fleet median + {ROBOT_R.FLEET_MARGIN}</li>
        <li>Rested before a match: <b className="ba-lvl-ok">OK</b> {REST_V.OK} V and up · <b className="ba-lvl-watch">Watch</b> {REST_V.PULL_UNDER} to {REST_V.OK} · <b className="ba-lvl-pull">Pull</b> under {REST_V.PULL_UNDER}</li>
        <li><b>One battery high</b>, the others normal on the same robot: that battery.</li>
        <li><b>Most batteries high</b> (median over {ROBOT_R.WIRING_MEDIAN}): the robot wiring. Inspect the main breaker, SB50 contacts and PDH terminals.</li>
      </ul>
    </details>
  )
}

/** Writers: the pit load tests in the robot repo battery-history.csv, checked, then imported in one step. */
function LoadTests({ board, runs, onDone }) {
  const [s, setS] = useState({})
  async function check() {
    setS({ busy: 'check' })
    const got = await fetchBatteryHistory()
    if (got.error) { setS({ error: got.error }); return }
    if (got.missing) { setS({ plans: [], note: 'The robot has not pushed a battery history yet. It comes with Sync Match Data.' }); return }
    const parsed = parseBatteryHistory(got.text)
    if (parsed.error) { setS({ error: parsed.error }); return }
    setS({ plans: planLoadTests(parsed.rows, { batteries: board, runs }) })
  }
  async function run() {
    const rows = loadTestRows(s.plans)
    setS((x) => ({ ...x, busy: 'import' }))
    const r = await writeVia(supabase, 'battery_import_load_tests', { p_rows: rows })
    if (r.error || r.via !== 'function') {
      setS((x) => ({ ...x, busy: '', error: r.error && !isSchemaMissing(r.error) ? errText(r.error) : 'Load-test import is not set up yet (migration 0041). Nothing was saved.' }))
      return
    }
    const made = r.data?.imported ?? []
    setS({})
    await onDone(`${made.length} load test${made.length === 1 ? '' : 's'} imported${made.length ? `: ${made.map((x) => `${x.battery} ${mohm(x.robot_resistance_mohm)} mΩ`).join(', ')}` : ''}.`)
  }
  const fresh = (s.plans ?? []).filter((p) => p.status === 'new')
  const already = (s.plans ?? []).filter((p) => p.status === 'already').length
  const skipped = (s.plans ?? []).filter((p) => p.status === 'skip')
  return (
    <details className="ba-lt" data-loadtests>
      <summary>Pit load tests <span className="ba-muted">from the robot</span></summary>
      <div className="ba-form">
        <p className="ba-muted">Drive Tests tab, "Test: Battery Load": a 2 s shooter spin-up that measures robot mΩ cleanly. Same robot, every battery: a fair comparison.</p>
        {!s.plans && <button type="button" className="ba-btn" onClick={check} disabled={s.busy === 'check'}>{s.busy === 'check' ? 'Checking GitHub…' : 'Check GitHub for load tests'}</button>}
        {s.note && <p className="ba-muted">{s.note}</p>}
        {s.plans && !s.note && (
          <>
            <p className="ba-muted" data-loadtest-summary>{fresh.length} new · {already} already in the log{skipped.length ? ` · ${skipped.length} skipped` : ''}</p>
            {fresh.length > 0 && <ul className="ba-lt-list">{fresh.map((p) => (
              <li key={`${p.battery.id}-${p.time}`}><b>{p.battery.label}</b> <span className={`hud-tnum ba-lvl-${robotLevel(p.resistance)}`}>{mohm(p.resistance)} mΩ</span> <span className="hud-mono ba-muted">{when(p.at)}</span></li>
            ))}</ul>}
            {skipped.length > 0 && <ul className="ba-lt-list ba-lt-skip">{skipped.map((p, i) => <li key={i}><span className="hud-mono">{p.typed || 'no battery'}</span> {p.reason}</li>)}</ul>}
            <div className="ba-row">
              {fresh.length > 0 && <button type="button" className="ba-primary" onClick={run} disabled={s.busy === 'import'}>{s.busy === 'import' ? 'Importing…' : `Import ${fresh.length}`}</button>}
              <button type="button" className="ba-btn" onClick={() => setS({})}>Done</button>
            </div>
          </>
        )}
        {s.error && <p className="ba-error" role="alert">{s.error}</p>}
      </div>
    </details>
  )
}

function Sheet({ title, eyebrow, onClose, children, label }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current, opener = document.activeElement
    d?.showModal?.()
    return () => { d?.close?.(); if (opener?.isConnected) opener.focus() }
  }, [])
  return (
    <dialog ref={ref} className="ba-sheet" aria-label={label ?? title} onCancel={(e) => { e.preventDefault(); onClose() }}>
      <div className="ba-sheet-head">
        <div>{eyebrow && <span className="ba-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        <button className="ba-btn" onClick={onClose}>Close</button>
      </div>
      <div className="ba-sheet-body">{children}</div>
    </dialog>
  )
}

function BatterySheet({ b, isStaff, uid, names, events, onClose, onLog, onSaved }) {
  const [edit, setEdit] = useState(false)
  return (
    <Sheet title={b.label} eyebrow={`${statusLabel(b.status)} · ${chargeLabel(b.charge_state)}`} onClose={onClose}>
      {b.check && <ul className="ba-reasons">{b.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      <dl className="ba-facts">
        <div><dt>Brand and model</dt><dd>{b.brand_model || 'Not recorded'}</dd></div>
        <div><dt>Year</dt><dd>{b.year_acquired ?? 'Not recorded'}</dd></div>
        <div><dt>Resting before a match</dt><dd className={`hud-tnum${b.restLevel ? ` ba-lvl-${b.restLevel}` : ''}`}>{b.restingVolts === null ? 'Not measured' : `${volts(b.restingVolts)} V · ${LEVEL_LABELS[b.restLevel]}`}</dd></div>
        <div><dt>Robot resistance (battery + wiring)</dt><dd className={`hud-tnum${b.robotLevel ? ` ba-lvl-${b.robotLevel}` : ''}`} data-fact="robot-r">{b.robotR === null ? 'Not measured' : `${mohm(b.robotR)} mΩ · ${LEVEL_LABELS[b.robotLevel]}${b.standsOut ? ' · stands out' : ''}`}</dd></div>
        <div><dt>Beak resistance (battery only)</dt><dd className="hud-tnum">{b.resistance === null ? 'Not measured' : `${b.resistance} mΩ`}</dd></div>
        <div><dt>Lowest voltage</dt><dd className="hud-tnum">{b.minVolts === null ? 'Not measured' : `${volts(b.minVolts)} V`}</dd></div>
      </dl>
      {b.robotTrend.length > 1 && <div className="ba-sheet-trend"><RTrend values={b.robotTrend} label={`${b.label} robot resistance`} /><span className="ba-muted">Robot mΩ, last {b.robotTrend.length} readings, oldest first. Lines at {ROBOT_R.OK_UNDER} and {ROBOT_R.PULL_OVER}.</span></div>}
      {b.verdict && (
        <div className="ba-verdict-box" data-verdict>
          <h3 className="ba-h3">Robot verdict · {when(b.verdictAt)}</h3>
          <VerdictList verdict={b.verdict} />
        </div>
      )}
      {b.notes && <p className="ba-note">{b.notes}</p>}
      <div className="ba-row">
        {b.status !== 'retired' && <button className="ba-primary" onClick={() => onLog(null)}>Log a run</button>}
        {isStaff && <button className="ba-btn" onClick={() => setEdit((x) => !x)}>{edit ? 'Cancel edit' : 'Edit battery'}</button>}
      </div>
      {edit && <BatteryEditor b={b} onSaved={async (t) => { setEdit(false); await onSaved(t) }} />}
      <h3 className="ba-h3">History <span className="hud-tnum">{b.runCount}</span></h3>
      {!b.runs.length ? <p className="ba-muted">No runs logged yet.</p> : (
        <ol className="ba-history">
          {b.runs.map((r) => (
            <li key={r.id} className={r.brownout === 'yes' ? 'ba-run-bad' : ''}>
              <div className="ba-run-top">
                <strong>{kindLabel(r.kind)}{r.match_label ? ` · ${r.match_label}` : ''}</strong>
                <span className="hud-mono">{when(r.ran_at)}</span>
              </div>
              <div className="ba-run-nums hud-mono">
                <span>{volts(r.voltage_before)} → {volts(r.voltage_after)} V</span>
                <span>{r.resistance_mohm === null ? 'Beak --' : `Beak ${r.resistance_mohm} mΩ`}</span>
                {r.robot_resistance_mohm !== null && r.robot_resistance_mohm !== undefined && <span className={`ba-lvl-${robotLevel(r.robot_resistance_mohm)}`}>Robot {mohm(r.robot_resistance_mohm)} mΩ</span>}
                {r.min_volts !== null && r.min_volts !== undefined && <span>Low {volts(r.min_volts)} V</span>}
                <span>{r.minutes === null ? '-- min' : `${r.minutes} min`}</span>
                <span>Brownout: {brownoutLabel(r.brownout)}</span>
                {r.performance && <span>Perf {r.performance}/5</span>}
              </div>
              {r.verdict && <VerdictTags verdict={r.verdict} />}
              {(r.notes || r.event_id) && <p className="ba-run-note">{r.event_id ? `${events.find((e) => e.id === r.event_id)?.title ?? 'Event'}. ` : ''}{r.notes}</p>}
              <div className="ba-run-foot">
                <span className="ba-muted">{names.get(r.member_id) ?? 'Member'}</span>
                {canEditRun(r, { uid, isStaff }) && <button className="ba-link-btn" onClick={() => onLog(r)}>Correct</button>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  )
}

function Seg({ label, value, options, onChange, name }) {
  return (
    <fieldset className="ba-seg">
      <legend>{label}</legend>
      <div className="ba-seg-opts">
        {options.map((o) => <button type="button" key={o.key} aria-pressed={value === o.key} onClick={() => onChange(o.key)} data-name={name}>{o.label}</button>)}
      </div>
    </fieldset>
  )
}

function NumField({ label, unit, value, onChange, step = 'decimal', hint }) {
  return (
    <label className="ba-num">
      <span>{label}</span>
      <span className="ba-num-box">
        <input inputMode={step} enterKeyHint="next" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder="--" aria-label={label} />
        <i>{unit}</i>
      </span>
      {hint && <small>{hint}</small>}
    </label>
  )
}

function RunForm({ board, events, start, onClose, onSaved }) {
  const editing = start.run ?? null
  const last = recall()
  const live = board.filter((b) => b.status !== 'retired')
  const [v, setV] = useState(() => editing ? {
    battery_id: editing.battery_id, kind: editing.kind, event_id: editing.event_id ?? '', match_label: editing.match_label ?? '',
    vb: editing.voltage_before ?? '', va: editing.voltage_after ?? '', res: editing.resistance_mohm ?? '', min: editing.minutes ?? '',
    brownout: editing.brownout, performance: editing.performance ?? null, notes: editing.notes ?? '',
  } : {
    battery_id: start.batteryId ?? '', kind: last.kind ?? 'match', event_id: last.event ?? '', match_label: '',
    vb: '', va: '', res: '', min: '', brownout: 'no', performance: null, notes: '',
  })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k, x) => setV((s) => ({ ...s, [k]: x }))
  const battery = board.find((b) => b.id === v.battery_id)
  const soonEvents = events.filter((e) => Math.abs(Date.parse(e.starts_at) - Date.now()) < 14 * 864e5)

  async function save(e) {
    e.preventDefault()
    if (saving) return
    const values = { battery_id: v.battery_id, kind: v.kind, event_id: v.event_id, match_label: v.match_label, voltage_before: readNumber(v.vb), voltage_after: readNumber(v.va),
      resistance_mohm: readNumber(v.res), minutes: readNumber(v.min), brownout: v.brownout, performance: v.performance, notes: v.notes }
    const problem = runProblem(values)
    if (problem) { setErr(problem); return }
    setSaving(true); setErr('')
    try {
      if (editing) {
        const a = runArgs(values)
        done(await writeVia(supabase, 'battery_edit_run', { p_run: editing.id, p_kind: a.p_kind, p_event: a.p_event, p_match: a.p_match, p_voltage_before: a.p_voltage_before,
          p_voltage_after: a.p_voltage_after, p_resistance: a.p_resistance, p_minutes: a.p_minutes, p_brownout: a.p_brownout, p_performance: a.p_performance, p_notes: a.p_notes }))
        await onSaved(`${battery?.label ?? 'Run'} corrected.`)
      } else {
        const a = runArgs(values)
        const out = done(await writeVia(supabase, 'battery_log_run', { p_battery: a.p_battery, p_kind: a.p_kind, p_event: a.p_event, p_match: a.p_match, p_voltage_before: a.p_voltage_before,
          p_voltage_after: a.p_voltage_after, p_resistance: a.p_resistance, p_minutes: a.p_minutes, p_brownout: a.p_brownout, p_performance: a.p_performance, p_notes: a.p_notes }))
        remember({ battery: v.battery_id, kind: v.kind, event: v.event_id })
        await onSaved(`${out?.battery_label ?? battery?.label} logged${out?.charge_state === 'needs_charge' && out?.previous_charge_state !== 'needs_charge' ? '. Marked needs charge.' : '.'}`)
      }
    } catch (x) { setErr(errText(x)); setSaving(false) }
  }

  return (
    <Sheet title={editing ? `Correct run · ${battery?.label ?? ''}` : 'Log a run'} eyebrow={editing ? 'Your run, within 24 hours' : 'Battery log'} onClose={onClose}>
      <form className="ba-form" onSubmit={save}>
        {!editing && (
          <fieldset className="ba-seg">
            <legend>Battery</legend>
            <div className="ba-seg-opts ba-seg-batteries">
              {live.map((b) => <button type="button" key={b.id} aria-pressed={v.battery_id === b.id} onClick={() => set('battery_id', b.id)} className={b.check ? 'ba-opt-check' : ''}>{b.label}</button>)}
            </div>
          </fieldset>
        )}
        <Seg label="What was it" value={v.kind} options={RUN_KINDS} onChange={(k) => set('kind', k)} name="kind" />
        <div className="ba-grid2">
          <NumField label="Resting before" unit="V" value={v.vb} onChange={(x) => set('vb', x)} />
          <NumField label="After" unit="V" value={v.va} onChange={(x) => set('va', x)} />
        </div>
        <Seg label="Brownout" value={v.brownout} options={BROWNOUT} onChange={(k) => set('brownout', k)} name="brownout" />
        <label className="ba-field"><span>Match</span><input value={v.match_label} onChange={(e) => set('match_label', e.target.value)} placeholder="qm12" maxLength={40} autoComplete="off" /></label>
        <details className="ba-more" open={!!(v.res || v.min || v.performance || v.notes || v.event_id)}>
          <summary>More: resistance, minutes, event, notes</summary>
          <div className="ba-grid2">
            <NumField label="Resistance" unit="mΩ" value={v.res} onChange={(x) => set('res', x)} hint="Battery Beak" />
            <NumField label="Minutes" unit="min" value={v.min} onChange={(x) => set('min', x)} step="numeric" />
          </div>
          {soonEvents.length > 0 && (
            <label className="ba-field"><span>Event</span>
              <select value={v.event_id} onChange={(e) => set('event_id', e.target.value)}>
                <option value="">No event</option>
                {soonEvents.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </label>
          )}
          <fieldset className="ba-seg"><legend>How it performed (1 weak, 5 strong)</legend>
            <div className="ba-seg-opts">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} aria-pressed={v.performance === n} onClick={() => set('performance', v.performance === n ? null : n)}>{n}</button>)}</div>
          </fieldset>
          <label className="ba-field"><span>Notes</span><textarea value={v.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} rows={2} placeholder="What happened" /></label>
        </details>
        {err && <p className="ba-error" role="alert">{err}</p>}
        <button className="ba-primary ba-save" type="submit" disabled={saving || !v.battery_id}>{saving ? 'Saving…' : editing ? 'Save correction' : `Log ${battery?.label ?? 'run'}`}</button>
      </form>
    </Sheet>
  )
}

function BatteryEditor({ b, onSaved }) {
  const [v, setV] = useState({ label: b.label, brand: b.brand_model ?? '', year: b.year_acquired ?? '', status: b.status, notes: b.notes ?? '' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  async function save(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      done(await writeVia(supabase, 'battery_save', { p_id: b.id, p_label: v.label, p_brand_model: v.brand || null, p_year: v.year === '' ? null : Number(v.year), p_status: v.status, p_notes: v.notes || null }))
      await onSaved(`${v.label} saved.`)
    } catch (x) { setErr(errText(x)) }
    setSaving(false)
  }
  return (
    <form className="ba-form ba-editor" onSubmit={save}>
      <div className="ba-grid2">
        <label className="ba-field"><span>Label</span><input value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} maxLength={20} required /></label>
        <label className="ba-field"><span>Year</span><input inputMode="numeric" value={v.year} onChange={(e) => setV({ ...v, year: e.target.value.replace(/\D/g, '') })} maxLength={4} /></label>
      </div>
      <label className="ba-field"><span>Brand and model</span><input value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} maxLength={80} /></label>
      <Seg label="Status" value={v.status} options={STATUSES} onChange={(k) => setV({ ...v, status: k })} name="status" />
      <label className="ba-field"><span>Notes</span><textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} maxLength={2000} /></label>
      {err && <p className="ba-error" role="alert">{err}</p>}
      <button className="ba-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save battery'}</button>
    </form>
  )
}

function StaffBatteries({ onDone }) {
  const [v, setV] = useState({ prefix: 'B', from: '1', to: '12', brand: '', year: String(new Date().getFullYear()), status: 'competition' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  async function add(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const out = done(await writeVia(supabase, 'battery_add_set', { p_prefix: v.prefix, p_from: Number(v.from), p_to: Number(v.to), p_brand_model: v.brand || null, p_year: v.year ? Number(v.year) : null, p_status: v.status }))
      const made = out?.created ?? [], skipped = out?.skipped ?? []
      await onDone(`${made.length} added${made.length ? ` (${made[0]} to ${made[made.length - 1]})` : ''}${skipped.length ? `; ${skipped.length} already existed` : ''}.`)
    } catch (x) { setErr(errText(x)) }
    setSaving(false)
  }
  return (
    <details className="ba-staff">
      <summary>Add batteries <span className="ba-muted">staff</span></summary>
      <form className="ba-form" onSubmit={add}>
        <div className="ba-grid3">
          <label className="ba-field"><span>Letters</span><input value={v.prefix} onChange={(e) => setV({ ...v, prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} maxLength={6} /></label>
          <label className="ba-field"><span>From</span><input inputMode="numeric" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value.replace(/\D/g, '') })} /></label>
          <label className="ba-field"><span>To</span><input inputMode="numeric" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value.replace(/\D/g, '') })} /></label>
        </div>
        <p className="ba-muted">Makes {v.prefix || 'B'}{String(v.from || 0).padStart(2, '0')} through {v.prefix || 'B'}{String(v.to || 0).padStart(2, '0')}. Labels that already exist are skipped.</p>
        <div className="ba-grid2">
          <label className="ba-field"><span>Brand and model</span><input value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} placeholder="MK ES17-12" maxLength={80} /></label>
          <label className="ba-field"><span>Year</span><input inputMode="numeric" value={v.year} onChange={(e) => setV({ ...v, year: e.target.value.replace(/\D/g, '') })} maxLength={4} /></label>
        </div>
        <Seg label="Status" value={v.status} options={STATUSES.filter((s) => s.key !== 'retired')} onChange={(k) => setV({ ...v, status: k })} name="newstatus" />
        {err && <p className="ba-error" role="alert">{err}</p>}
        <button className="ba-primary" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add the set'}</button>
      </form>
    </details>
  )
}
