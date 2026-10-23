import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { displayName } from './names'
import { toCsv } from './csv'
import { downloadText, laStamp } from './download'
import {
  CHECK_THRESHOLDS, CHARGE_STATES, RUN_KINDS, BROWNOUT, STATUSES, FILTERS,
  batteryBoard, applyFilter, chargeLabel, statusLabel, kindLabel, brownoutLabel,
  readNumber, runProblem, runArgs, canEditRun, CSV_COLUMNS, csvRows,
} from './batteries'
import './BatteriesPage.css'

// The battery log (migration 0026, ledger 0017). Every write is a database
// function through writeVia with NO direct fallback: before 0026 is pasted the
// page reads "not set up yet", and a write that finds no function is reported
// as not set up, never as saved.

const REMEMBER = 'techmen:battery-log:last'
const recall = () => { try { return JSON.parse(localStorage.getItem(REMEMBER) || 'null') ?? {} } catch { return {} } }
const remember = (v) => { try { localStorage.setItem(REMEMBER, JSON.stringify(v)) } catch { /* private window */ } }

const when = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) : 'Never'
const volts = (v) => (v === null || v === undefined ? '--' : Number(v).toFixed(2))
const errText = (e) => e?.message || 'Something went wrong. Nothing was changed.'

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
  if (state.missing) return <main className="ba-wrap"><Link className="ba-back" to="/dashboard">← Home</Link><h1 className="ba-title">Batteries</h1><div className="ba-empty"><h2>Not set up yet</h2><p>The battery log starts when migration 0026 is pasted into Supabase. Everything else in the app works as before.</p></div></main>
  if (state.error) return <main className="ba-wrap"><h1 className="ba-title">Batteries</h1><p className="ba-error" role="alert">{errText(state.error)}</p><button className="ba-btn" onClick={load}>Try again</button></main>

  const opened = open ? board.find((b) => b.id === open) : null
  const last = recall()
  return (
    <main className="ba-wrap" data-page="batteries">
      <Link className="ba-back" to="/dashboard">← Home</Link>
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
                  <span><b className="hud-tnum">{volts(b.restingVolts ?? b.lastVolts)}</b><i>rest V</i></span>
                  <span className={b.brownouts ? 'ba-bad' : ''}><b className="hud-tnum">{b.brownouts}</b><i>brownouts</i></span>
                  <span><b className="hud-tnum">{b.runCount}</b><i>runs</i></span>
                </span>
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
        <p>A brownout in the last {CHECK_THRESHOLDS.BROWNOUT_LOOKBACK} runs, a resting voltage before a match under {CHECK_THRESHOLDS.MIN_RESTING_VOLTS} V, or resistance over {CHECK_THRESHOLDS.MAX_RESISTANCE_MOHM} mΩ. These are proposed defaults. A measurement left blank is not recorded, never zero. Logging a match marks a charged battery as needing a charge.</p>
      </details>

      {isStaff && <StaffBatteries onDone={async (text) => { setMsg(text); await load() }} />}

      {opened && <BatterySheet b={opened} isStaff={isStaff} uid={uid} names={state.names} events={state.events}
        onClose={() => setOpen(null)} onLog={(run) => { setOpen(null); setLogFor({ batteryId: opened.id, run }) }}
        onSaved={async (text) => { setMsg(text); await load() }} />}
      {logFor && <RunForm board={board} events={state.events} start={logFor} onClose={() => setLogFor(null)}
        onSaved={async (text) => { setLogFor(null); setMsg(text); await load() }} />}
    </main>
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
        <div><dt>Resting before a match</dt><dd className="hud-tnum">{b.restingVolts === null ? 'Not measured' : `${volts(b.restingVolts)} V`}</dd></div>
        <div><dt>Resistance</dt><dd className="hud-tnum">{b.resistance === null ? 'Not measured' : `${b.resistance} mΩ`}</dd></div>
      </dl>
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
                <span>{r.resistance_mohm === null ? '-- mΩ' : `${r.resistance_mohm} mΩ`}</span>
                <span>{r.minutes === null ? '-- min' : `${r.minutes} min`}</span>
                <span>Brownout: {brownoutLabel(r.brownout)}</span>
                {r.performance && <span>Perf {r.performance}/5</span>}
              </div>
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
