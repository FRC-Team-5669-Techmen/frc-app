import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import { CATEGORIES, categoryLabel, categoryColor, sessionsFromEvents, fmtHours } from './hoursUtils'
import './MemberHoursAdmin.css'

// Per-member admin hours management, embedded in the staff VerifyHoursPage (the
// same view as the correction-request queues — not a parallel screen). Staff pick
// a member, then edit/delete their logged_hours rows, add/edit/delete individual
// attendance_events (sessions recompute downstream — nothing is stored), and post
// labeled signed hour_adjustments. Every mutation goes through a SECURITY DEFINER
// RPC (admin_hours_management.sql); RLS would silently drop a direct client write.

const todayStr = () => new Date().toISOString().slice(0, 10)
const fmtDate = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtDT = iso => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const toLocalInput = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function MemberHoursAdmin() {
  const [profiles,    setProfiles]    = useState([])
  const [q,           setQ]           = useState('')
  const [sel,         setSel]         = useState(null)
  const [logged,      setLogged]      = useState(null)
  const [events,      setEvents]      = useState(null)
  const [adjustments, setAdjustments] = useState(null)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, nickname')
      .then(({ data }) => setProfiles((data ?? []).map(p => ({ ...p, name: displayName(p) }))))
  }, [])

  async function loadMember(id) {
    const [{ data: lh }, { data: ae }, { data: adj }] = await Promise.all([
      supabase.from('logged_hours').select('id, date, hours, type, description, status').eq('member_id', id).order('date', { ascending: false }),
      supabase.from('attendance_events').select('id, type, event_time, category, location, method, manual_entry').eq('user_id', id).order('event_time', { ascending: false }),
      supabase.from('hour_adjustments').select('id, category, hours, reason, created_at').eq('member_id', id).order('created_at', { ascending: false }),
    ])
    setLogged(lh ?? []); setEvents(ae ?? []); setAdjustments(adj ?? [])
  }

  function pick(p) {
    setSel(p); setQ('')
    setLogged(null); setEvents(null); setAdjustments(null)
    loadMember(p.id)
  }
  const reload = () => { if (sel) loadMember(sel.id) }

  const matches = q.trim()
    ? profiles.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : []

  // Computed sessions for the selected member — proves the events recompute
  // through the shared sessionsFromEvents path (no stored session rows).
  const sessions = events ? sessionsFromEvents(events) : []
  const sessionMs = sessions.reduce((s, x) => s + x.ms, 0)

  return (
    <div className="mha">
      <div className="mha-picker">
        {sel ? (
          <div className="mha-selected">
            <span className="mha-selected-name">{sel.name}</span>
            <button className="mha-change" onClick={() => { setSel(null); setLogged(null); setEvents(null); setAdjustments(null) }}>Change member</button>
          </div>
        ) : (
          <div className="mha-search-wrap">
            <input
              className="mha-search"
              placeholder="Search a member by name…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            {matches.length > 0 && (
              <ul className="mha-results">
                {matches.map(p => (
                  <li key={p.id}><button className="mha-result" onClick={() => pick(p)}>{p.name}</button></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {sel && (logged === null || events === null || adjustments === null) && (
        <div className="mha-loading"><div className="vh-spinner" /></div>
      )}

      {sel && logged !== null && events !== null && adjustments !== null && (
        <div className="mha-panels">

          {/* ── Logged hours ── */}
          <div className="mha-panel">
            <div className="mha-panel-head">Logged hours <span className="mha-count">{logged.length}</span></div>
            {logged.length === 0 ? (
              <p className="mha-empty">No logged-hours entries.</p>
            ) : (
              <div className="mha-list">
                {logged.map(row => <LoggedRow key={row.id} row={row} onDone={reload} />)}
              </div>
            )}
          </div>

          {/* ── Attendance events ── */}
          <div className="mha-panel">
            <div className="mha-panel-head">
              Attendance events <span className="mha-count">{events.length}</span>
              <span className="mha-head-note">{sessions.length} session{sessions.length === 1 ? '' : 's'} · {fmtHours(sessionMs / 3600000)} computed</span>
            </div>
            <AddEventForm memberId={sel.id} onDone={reload} />
            {events.length === 0 ? (
              <p className="mha-empty">No attendance events.</p>
            ) : (
              <div className="mha-list">
                {events.map(ev => <EventRow key={ev.id} ev={ev} onDone={reload} />)}
              </div>
            )}
          </div>

          {/* ── Hour adjustments ── */}
          <div className="mha-panel">
            <div className="mha-panel-head">Hour adjustments <span className="mha-count">{adjustments.length}</span></div>
            <AddAdjustForm memberId={sel.id} onDone={reload} />
            {adjustments.length === 0 ? (
              <p className="mha-empty">No adjustments.</p>
            ) : (
              <div className="mha-list">
                {adjustments.map(a => (
                  <div key={a.id} className="mha-adj">
                    <span className="mha-dot" style={{ background: categoryColor(a.category) }} />
                    <span className="mha-adj-cat">{categoryLabel(a.category)}</span>
                    <span className={`mha-adj-amt ${a.hours >= 0 ? 'mha-credit' : 'mha-debit'}`}>
                      {a.hours >= 0 ? '+' : '−'}{fmtHours(Math.abs(a.hours))}
                    </span>
                    <span className="mha-adj-reason">{a.reason}</span>
                    <span className="mha-adj-date">{fmtDate(a.created_at.slice(0, 10))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Logged-hours row: edit (category/hours/date) or delete ──
function LoggedRow({ row, onDone }) {
  const [edit, setEdit] = useState(false)
  const [type, setType] = useState(row.type)
  const [hours, setHours] = useState(String(parseFloat(row.hours)))
  const [date, setDate] = useState(row.date)
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    const hrs = parseFloat(hours)
    if (!hrs || hrs <= 0 || hrs > 24) { setErr('Hours must be 0.25–24.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('staff_edit_logged_hours', { p_entry: row.id, p_type: type, p_hours: hrs, p_date: date })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setEdit(false); onDone()
  }
  async function del() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('staff_delete_logged_hours', { p_entry: row.id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  if (edit) {
    return (
      <div className="mha-row mha-row-edit">
        <select className="mha-input" value={type} onChange={e => setType(e.target.value)}>
          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input className="mha-input mha-input-sm" type="number" min="0.25" max="24" step="0.25" value={hours} onChange={e => setHours(e.target.value)} />
        <input className="mha-input" type="date" max={todayStr()} value={date} onChange={e => setDate(e.target.value)} />
        {err && <span className="mha-err">{err}</span>}
        <div className="mha-row-actions">
          <button className="mha-btn" onClick={() => { setEdit(false); setErr('') }} disabled={busy}>Cancel</button>
          <button className="mha-btn mha-btn-go" onClick={save} disabled={busy}>{busy ? '…' : 'Save'}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mha-row">
      <span className="mha-dot" style={{ background: categoryColor(row.type) }} />
      <span className="mha-row-main">{categoryLabel(row.type)} · {parseFloat(row.hours)}h · {fmtDate(row.date)}</span>
      <span className={`mha-status mha-status-${row.status}`}>{row.status}</span>
      {err && <span className="mha-err">{err}</span>}
      <div className="mha-row-actions">
        {confirmDel ? (
          <>
            <button className="mha-btn" onClick={() => setConfirmDel(false)} disabled={busy}>Cancel</button>
            <button className="mha-btn mha-btn-danger" onClick={del} disabled={busy}>{busy ? '…' : 'Confirm delete'}</button>
          </>
        ) : (
          <>
            <button className="mha-btn" onClick={() => setEdit(true)}>Edit</button>
            <button className="mha-btn mha-btn-danger" onClick={() => setConfirmDel(true)}>Delete</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Attendance event row: edit (type/time/category, reason) or delete (reason) ──
function EventRow({ ev, onDone }) {
  const [edit, setEdit] = useState(false)
  const [type, setType] = useState(ev.type)
  const [time, setTime] = useState(toLocalInput(ev.event_time))
  const [cat, setCat] = useState(ev.category ?? 'build')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!reason.trim()) { setErr('A reason is required.'); return }
    if (!time) { setErr('A time is required.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('staff_set_event', {
      p_event: ev.id, p_type: type, p_event_time: new Date(time).toISOString(), p_category: cat, p_reason: reason.trim(),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setEdit(false); onDone()
  }
  async function del() {
    if (!reason.trim()) { setErr('A reason is required to delete.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('staff_void_event', { p_event: ev.id, p_reason: reason.trim() })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  if (edit) {
    return (
      <div className="mha-row mha-row-edit mha-row-edit-col">
        <div className="mha-edit-fields">
          <select className="mha-input mha-input-sm" value={type} onChange={e => setType(e.target.value)}>
            <option value="in">in</option>
            <option value="out">out</option>
          </select>
          <input className="mha-input" type="datetime-local" value={time} onChange={e => setTime(e.target.value)} />
          <select className="mha-input" value={cat} onChange={e => setCat(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <input className="mha-input" type="text" maxLength={300} placeholder="Reason (required)…" value={reason} onChange={e => setReason(e.target.value)} />
        {err && <span className="mha-err">{err}</span>}
        <div className="mha-row-actions">
          <button className="mha-btn" onClick={() => { setEdit(false); setErr(''); setReason('') }} disabled={busy}>Cancel</button>
          <button className="mha-btn mha-btn-danger" onClick={del} disabled={busy}>{busy ? '…' : 'Delete'}</button>
          <button className="mha-btn mha-btn-go" onClick={save} disabled={busy}>{busy ? '…' : 'Save'}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mha-row">
      <span className={`mha-evt-type mha-evt-${ev.type}`}>{ev.type}</span>
      <span className="mha-row-main">{fmtDT(ev.event_time)} · {categoryLabel(ev.category)}{ev.manual_entry ? ' · manual' : ''}</span>
      <div className="mha-row-actions">
        <button className="mha-btn" onClick={() => setEdit(true)}>Edit / delete</button>
      </div>
    </div>
  )
}

// ── Add a single attendance event (e.g. a forgotten OUT) ──
function AddEventForm({ memberId, onDone }) {
  const [openF, setOpenF] = useState(false)
  const [type, setType] = useState('out')
  const [time, setTime] = useState(`${todayStr()}T18:00`)
  const [cat, setCat] = useState('build')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function add() {
    if (!reason.trim()) { setErr('A reason is required.'); return }
    if (!time) { setErr('A time is required.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('staff_add_event', {
      p_member: memberId, p_type: type, p_event_time: new Date(time).toISOString(), p_category: cat, p_reason: reason.trim(),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setOpenF(false); setReason('')
    onDone()
  }

  if (!openF) return <button className="mha-add-toggle" onClick={() => setOpenF(true)}>+ Add event</button>

  return (
    <div className="mha-addform">
      <div className="mha-edit-fields">
        <select className="mha-input mha-input-sm" value={type} onChange={e => setType(e.target.value)}>
          <option value="in">in</option>
          <option value="out">out</option>
        </select>
        <input className="mha-input" type="datetime-local" value={time} onChange={e => setTime(e.target.value)} />
        <select className="mha-input" value={cat} onChange={e => setCat(e.target.value)}>
          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <input className="mha-input" type="text" maxLength={300} placeholder="Reason (required)…" value={reason} onChange={e => setReason(e.target.value)} />
      {err && <span className="mha-err">{err}</span>}
      <div className="mha-row-actions">
        <button className="mha-btn" onClick={() => { setOpenF(false); setErr(''); setReason('') }} disabled={busy}>Cancel</button>
        <button className="mha-btn mha-btn-go" onClick={add} disabled={busy}>{busy ? '…' : 'Add event'}</button>
      </div>
    </div>
  )
}

// ── Add a labeled signed hour adjustment (credit or debit) ──
function AddAdjustForm({ memberId, onDone }) {
  const [openF, setOpenF] = useState(false)
  const [cat, setCat] = useState('build')
  const [hours, setHours] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function add() {
    const hrs = parseFloat(hours)
    if (!hrs || hrs === 0) { setErr('Enter non-zero hours (negative debits a member).'); return }
    if (!reason.trim()) { setErr('A reason is required.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('staff_add_hour_adjustment', {
      p_member: memberId, p_category: cat, p_hours: hrs, p_reason: reason.trim(),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setOpenF(false); setHours(''); setReason('')
    onDone()
  }

  if (!openF) return <button className="mha-add-toggle" onClick={() => setOpenF(true)}>+ Add adjustment</button>

  return (
    <div className="mha-addform">
      <div className="mha-edit-fields">
        <select className="mha-input" value={cat} onChange={e => setCat(e.target.value)}>
          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input className="mha-input mha-input-sm" type="number" step="0.25" placeholder="±hours" value={hours} onChange={e => setHours(e.target.value)} />
      </div>
      <input className="mha-input" type="text" maxLength={300} placeholder="Reason (required)…" value={reason} onChange={e => setReason(e.target.value)} />
      <p className="mha-hint">Positive credits, negative debits. Folds into the member's category totals.</p>
      {err && <span className="mha-err">{err}</span>}
      <div className="mha-row-actions">
        <button className="mha-btn" onClick={() => { setOpenF(false); setErr(''); setHours(''); setReason('') }} disabled={busy}>Cancel</button>
        <button className="mha-btn mha-btn-go" onClick={add} disabled={busy}>{busy ? '…' : 'Add adjustment'}</button>
      </div>
    </div>
  )
}
