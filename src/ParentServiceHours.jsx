import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { zonedToIso } from './eventHub'
import { PARENT_SERVICE_COLUMNS, parentServiceRows, parentServiceCsv } from './parentService'
import './Operations.css'

export default function ParentServiceHours({ event }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ parent: '', student: '', school_id: '', name: '', start: '', end: '' })
  const load = useCallback(async () => {
    const r = await supabase.rpc('staff_parent_service', { p_event: event.id })
    setError(r.error ? (isSchemaMissing(r.error) ? 'Named parent hours are not set up yet.' : 'Could not load parent hours. Retry before exporting.') : '')
    if (!r.error) setData(r.data)
  }, [event.id])
  useEffect(() => { load() }, [load])
  const field = key => ({ value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) })
  async function save(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    try {
      const iso = v => { const [d, t] = v.split('T'); return zonedToIso(d, t, event.timezone) }
      const r = await writeVia(supabase, 'staff_save_parent_service', { p_event: event.id, p_parent: form.parent || null, p_student: form.student || null,
        p_school_id: form.school_id, p_name: form.name, p_start: iso(form.start), p_end: iso(form.end), p_session: null, p_delete: false })
      if (r.error || r.via !== 'function') throw r.error || new Error('Not set up yet.')
      setMsg('Service time saved.'); setForm(f => ({ ...f, start: '', end: '' })); await load()
    } catch (e) { setMsg(e.message || 'Could not save service time.') } finally { setBusy(false) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([parentServiceCsv(data.parents, event)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'parent-service-hours.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const rows = data ? parentServiceRows(data.parents, event) : []
  return <section className="eh-card ops-section" aria-label="Named parent service hours">
    <h3 className="eh-label">Parent service hours</h3>
    <p className="eh-hint">Record each parent by name and their actual service times. Link one student and school ID to each parent. Times use {event.timezone}. Adult sign-up counts do not create hours.</p>
    {error ? <p role="alert">{error} <button className="eh-btn" onClick={load}>Retry</button></p> : !data ? <p role="status">Loading parent hours…</p> : <>
      <form className="ops-form ops-no-print" onSubmit={save}>
        <label>Parent record<select aria-label="Parent record" className="eh-input" {...field('parent')}><option value="">New named parent</option>{data.parents.map(p => <option key={p.id} value={p.id}>{p.name} · {p.student} · {p.school_id}</option>)}</select></label>
        {!form.parent && <><label>Parent full name<input className="eh-input" required maxLength={120} {...field('name')} /></label>
          <label>Student<select aria-label="Student" className="eh-input" required {...field('student')}><option value="">Choose student</option>{data.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Student school ID<input className="eh-input" required maxLength={60} {...field('school_id')} /></label></>}
        <label>Service starts<input className="eh-input" type="datetime-local" required {...field('start')} /></label>
        <label>Service ends<input className="eh-input" type="datetime-local" required {...field('end')} /></label>
        <button className="eh-btn eh-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save service time'}</button>
      </form>
      {msg && <p role="status">{msg}</p>}
      <div className="eh-inline ops-no-print"><button className="eh-btn eh-btn-primary" disabled={!rows.length} onClick={download} data-parent-csv>Download service hours CSV</button>
        <button className="eh-btn" disabled={!rows.length} onClick={() => window.print()} data-parent-print>Print service hours</button></div>
      <div className="ops-print" data-parent-report><h3>{event.title}</h3><p>Named parent service hours · {event.timezone}</p>
        <div className="ops-scroll" tabIndex={0} role="region" aria-label="Parent service hours table"><table className="ehm-table"><thead><tr>{PARENT_SERVICE_COLUMNS.slice(1).map(([k, h]) => <th key={k}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{PARENT_SERVICE_COLUMNS.slice(1).map(([k]) => <td key={k}>{r[k]}</td>)}</tr>)}</tbody></table></div>
        {!rows.length && <p>No named service times recorded for this event.</p>}
      </div>
      <details className="ops-no-print"><summary>Correct a service entry</summary><p>Choose an entry to remove. Enter the corrected times above.</p>{data.parents.flatMap(p => p.sessions.map(s => <p key={s.id}>{p.name} · {s.starts_at} to {s.ends_at} <button className="eh-btn" disabled={busy} onClick={async () => {
        setBusy(true); const r = await writeVia(supabase, 'staff_save_parent_service', { p_event: event.id, p_parent: p.id, p_student: null, p_school_id: '', p_name: '', p_start: null, p_end: null, p_session: s.id, p_delete: true }); setMsg(r.error ? 'Could not remove service entry.' : 'Service entry removed.'); await load(); setBusy(false)
      }}>Remove entry</button></p>))}</details>
    </>}
  </section>
}
