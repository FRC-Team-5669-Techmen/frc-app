import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { displayName } from './names'
import { AUTO_READY_STREAK, RATE_WINDOW, RESULTS, resultLabel, routineBoard } from './autos'
import './BatteriesPage.css'
import './Autos.css'

// The auto routine log (0028, ledger 0017, part D2). Mr. Pina: "Autos have to
// work more than twice in a row." Each routine shows its streak, its rate over
// the last ten runs, and Ready at AUTO_READY_STREAK successes in a row.
// Logging a run is three taps: the routine, the result, Save.

function done(r) {
  if (r.error) throw r.error
  if (r.via !== 'function') throw { code: 'PGRST202', message: 'The auto log is not set up yet. Nothing was saved.' }
  return r.data
}
const errText = (e) => e?.message || 'Something went wrong. Nothing was changed.'
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) : 'Never')
const REMEMBER = 'techmen:auto-log:last'
const recall = () => { try { return JSON.parse(localStorage.getItem(REMEMBER) || 'null') ?? {} } catch { return {} } }

export default function AutosPage({ session, hasRole = () => false }) {
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  const parentOnly = hasRole('parent') && !isStaff
  const [s, setS] = useState({ loading: true })
  const [msg, setMsg] = useState('')
  const [logFor, setLogFor] = useState(null)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    const [a, r, b] = await Promise.all([
      supabase.from('auto_routines').select('*'),
      supabase.from('auto_runs').select('*').order('ran_at', { ascending: false }).limit(2000),
      supabase.from('batteries').select('id, label, status'),
    ])
    if (a.error || r.error) { const e = a.error || r.error; setS({ loading: false, missing: isSchemaMissing(e), error: isSchemaMissing(e) ? null : e }); return }
    const ids = [...new Set((r.data ?? []).map((x) => x.member_id))]
    const p = ids.length ? await supabase.from('profiles').select('id, full_name, nickname').in('id', ids) : { data: [] }
    setS({ loading: false, routines: a.data ?? [], runs: r.data ?? [], batteries: (b.data ?? []).filter((x) => x.status !== 'retired'), names: new Map((p.data ?? []).map((x) => [x.id, displayName(x)])) })
  }, [])
  useEffect(() => { if (!parentOnly) load() }, [load, parentOnly])

  if (parentOnly) return <main className="ba-wrap"><h1 className="ba-title">Autos</h1><p className="ba-muted">The auto log is for students and staff.</p></main>
  if (s.loading) return <main className="ba-wrap"><h1 className="ba-title">Autos</h1><p className="ba-muted" role="status">Loading…</p></main>
  if (s.missing) return <main className="ba-wrap"><Link className="ba-back" to="/robot">← Robot</Link><h1 className="ba-title">Autos</h1><div className="ba-empty"><h2>Not set up yet</h2><p>The auto log starts when migration 0028 is pasted into Supabase.</p></div></main>
  if (s.error) return <main className="ba-wrap"><h1 className="ba-title">Autos</h1><p className="ba-error" role="alert">{errText(s.error)}</p></main>

  const board = routineBoard(s.routines, s.runs)
  const live = board.filter((r) => r.active !== false)
  const opened = board.find((r) => r.id === openId)
  return (
    <main className="ba-wrap" data-page="autos">
      <Link className="ba-back" to="/robot">← Robot</Link>
      <header className="ba-head">
        <div><span className="ba-eyebrow">Programming</span><h1 className="ba-title">Autos</h1>
          <p className="ba-sub">Ready means {AUTO_READY_STREAK} successes in a row. A partial or a fail starts the count over.</p></div>
        <div className="ba-head-actions"><button className="ba-primary" disabled={!live.length} onClick={() => setLogFor(live.find((r) => r.id === recall().routine)?.id ?? live[0]?.id)}>Log a run</button></div>
      </header>
      <div className="ba-tally"><span><b className="hud-tnum">{live.filter((r) => r.ready).length}</b> competition-ready</span><span><b className="hud-tnum">{live.length}</b> routines</span><span><b className="hud-tnum">{s.runs.length}</b> runs logged</span></div>
      {msg && <p className="ba-msg" role="status">{msg}</p>}
      {!board.length ? <div className="ba-empty"><h2>No routines yet</h2><p>{isStaff ? 'Add the first routine below.' : 'A mentor adds the routines. Ask one to add them.'}</p></div> : (
        <ul className="au-list">{board.map((r) => (
          <li key={r.id} className={`au-card${r.ready ? ' au-ready' : ''}${r.active === false ? ' ba-card-retired' : ''}`} data-routine={r.name}>
            <button className="au-open" onClick={() => setOpenId(r.id)}>
              <span className="au-name">{r.name}</span>
              <span className="au-start">{r.start_position || 'Start not recorded'}</span>
              <span className="au-streak"><b className="hud-tnum">{r.streak}</b><i>in a row</i></span>
              <span className="au-rate"><b className="hud-tnum">{r.rate === null ? '--' : `${Math.round(r.rate * 100)}%`}</b><i>last {r.rateN || RATE_WINDOW}</i></span>
              <span className="au-pips" aria-label={`Last runs: ${r.runs.slice(0, 10).map((x) => x.result).join(', ') || 'none'}`}>{r.runs.slice(0, 10).reverse().map((x) => <i key={x.id} className={`au-pip au-${x.result}`} />)}</span>
              {r.ready ? <span className="ba-pill ba-pill-ready au-badge">Competition-ready</span> : <span className="au-need">{r.active === false ? 'Retired' : `${Math.max(0, AUTO_READY_STREAK - r.streak)} more to ready`}</span>}
            </button>
            {r.active !== false && <button className="ba-btn au-log" onClick={() => setLogFor(r.id)}>Log run</button>}
          </li>))}</ul>
      )}
      {isStaff && <RoutineEditor onSaved={async (t) => { setMsg(t); await load() }} />}
      {opened && <div className="rb-assign au-history" role="dialog" aria-label={`${opened.name} history`}>
        <div className="rb-assign-head"><h2>{opened.name}</h2><button className="ba-btn" onClick={() => setOpenId(null)}>Close</button></div>
        <p className="ba-muted">{opened.description || 'No description.'} Best streak {opened.best}. {opened.runCount} runs.</p>
        {isStaff && <RoutineEditor routine={opened} onSaved={async (t) => { setMsg(t); setOpenId(null); await load() }} />}
        <ol className="ba-history">{opened.runs.slice(0, 50).map((x) => <li key={x.id} className={x.result !== 'success' ? 'ba-run-bad' : ''}>
          <div className="ba-run-top"><strong>{resultLabel(x.result)}</strong><span className="hud-mono">{when(x.ran_at)}</span></div>
          {(x.problem || x.location) && <p className="ba-run-note">{x.location ? `${x.location}. ` : ''}{x.problem}</p>}
          <div className="ba-run-foot"><span className="ba-muted">{s.names.get(x.member_id) ?? 'Member'}{x.battery_id ? ` · ${s.batteries.find((b) => b.id === x.battery_id)?.label ?? 'battery'}` : ''}{x.sim_match_id ? ' · simulated match' : ''}</span></div>
        </li>)}</ol>
      </div>}
      {logFor && <RunSheet routines={live} batteries={s.batteries} start={logFor} onClose={() => setLogFor(null)} onSaved={async (t) => { setLogFor(null); setMsg(t); await load() }} />}
    </main>
  )
}

function RunSheet({ routines, batteries, start, onClose, onSaved }) {
  const last = recall()
  const [v, setV] = useState({ routine: start, result: '', problem: '', battery: last.battery ?? '', location: last.location ?? 'Shop field' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const r = routines.find((x) => x.id === v.routine)
  async function save(e) {
    e.preventDefault()
    if (!v.result) { setErr('Choose success, partial or fail.'); return }
    setSaving(true); setErr('')
    try {
      done(await writeVia(supabase, 'auto_log_run', { p_routine: v.routine, p_result: v.result, p_problem: v.problem.trim() || null, p_battery: v.battery || null, p_location: v.location.trim() || null }))
      try { localStorage.setItem(REMEMBER, JSON.stringify({ routine: v.routine, battery: v.battery, location: v.location })) } catch { /* private window */ }
      await onSaved(`${r?.name}: ${resultLabel(v.result)} logged.`)
    } catch (x) { setErr(errText(x)); setSaving(false) }
  }
  return (
    <div className="rb-assign au-sheet" role="dialog" aria-label="Log an auto run">
      <div className="rb-assign-head"><h2>Log an auto run</h2><button className="ba-btn" onClick={onClose}>Close</button></div>
      <form className="ba-form" onSubmit={save}>
        <fieldset className="ba-seg"><legend>Routine</legend><div className="ba-seg-opts">{routines.map((x) => <button type="button" key={x.id} aria-pressed={v.routine === x.id} onClick={() => setV({ ...v, routine: x.id })}>{x.name}</button>)}</div></fieldset>
        <fieldset className="ba-seg"><legend>Result</legend><div className="ba-seg-opts au-results">{RESULTS.map((x) => <button type="button" key={x.key} className={`au-res-${x.key}`} aria-pressed={v.result === x.key} onClick={() => setV({ ...v, result: x.key })}>{x.label}</button>)}</div></fieldset>
        {v.result && v.result !== 'success' && <label className="ba-field"><span>What went wrong</span><input value={v.problem} onChange={(e) => setV({ ...v, problem: e.target.value })} maxLength={500} placeholder="Missed the second piece" /></label>}
        <div className="ba-grid2">
          <label className="ba-field"><span>Battery</span><select value={v.battery} onChange={(e) => setV({ ...v, battery: e.target.value })}><option value="">Not recorded</option>{batteries.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
          <label className="ba-field"><span>Where</span><input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} maxLength={80} /></label>
        </div>
        {err && <p className="ba-error" role="alert">{err}</p>}
        <button className="ba-primary ba-save" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save run'}</button>
      </form>
    </div>
  )
}

function RoutineEditor({ routine = null, onSaved }) {
  const [v, setV] = useState({ name: routine?.name ?? '', start: routine?.start_position ?? '', description: routine?.description ?? '', active: routine?.active !== false })
  const [err, setErr] = useState('')
  async function save(e) {
    e.preventDefault(); setErr('')
    try { done(await writeVia(supabase, 'auto_save_routine', { p_id: routine?.id ?? null, p_name: v.name, p_start: v.start || null, p_description: v.description || null, p_active: v.active })); await onSaved(`${v.name} saved.`); if (!routine) setV({ name: '', start: '', description: '', active: true }) } catch (x) { setErr(errText(x)) }
  }
  const body = (
    <form className="ba-form" onSubmit={save}>
      <div className="ba-grid2">
        <label className="ba-field"><span>Name</span><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={60} required placeholder="Two-piece left" /></label>
        <label className="ba-field"><span>Starting position</span><input value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} maxLength={60} placeholder="Left of the HUB" /></label>
      </div>
      <label className="ba-field"><span>What it does</span><textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={2} maxLength={1000} /></label>
      {routine && <label className="au-check"><input type="checkbox" checked={!v.active} onChange={(e) => setV({ ...v, active: !e.target.checked })} /> Retired</label>}
      {err && <p className="ba-error" role="alert">{err}</p>}
      <button className="ba-primary" type="submit">{routine ? 'Save routine' : 'Add routine'}</button>
    </form>
  )
  return routine ? <div className="ba-editor">{body}</div> : <details className="ba-staff"><summary>Add a routine <span className="ba-muted">staff</span></summary>{body}</details>
}
