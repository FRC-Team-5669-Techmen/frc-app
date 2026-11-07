import { useState } from 'react'
import { supabase } from './supabase'
import { isSchemaMissing } from './schemaMissing'
import { sessionsFromEvents, laDateKey, fmtDuration } from './hoursUtils'

const when = t => t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No record'
const SOURCE = { session_at_start: 'Session open at the start', attendance_in: 'Check-in during the meeting', meeting_checkin: 'Meeting scan' }

// Staff-only read, on demand. The database independently enforces the gate.
export default function StandingEvidence({ record }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function load() {
    setOpen(true); setBusy(true); setError('')
    try {
      const r = await supabase.rpc('staff_standing_evidence', { p_record: record.id })
      if (r.error) throw r.error
      setData(r.data)
      if (!r.data) setError('No source record was found. Refresh standing.')
    } catch (e) { setError(isSchemaMissing(e) ? 'Standing explanations are not set up yet.' : 'Could not load the source records. Try again.') }
    finally { setBusy(false) }
  }
  const excluded = new Map((data?.reviews ?? []).filter(r => ['pending', 'voided'].includes(r.status)).map(r => [r.checkout_id, r.status]))
  const sessions = data ? sessionsFromEvents(data.attendance ?? []).filter(s => laDateKey(s.inTime) >= data.from && laDateKey(s.inTime) <= data.to) : []
  return <div className="st-evidence">
    <button type="button" className="st-btn" aria-expanded={open} onClick={() => open ? setOpen(false) : load()}>Why this record?</button>
    {open && <div data-standing-evidence>
      {busy && <p role="status">Loading source records…</p>}
      {error && <p role="alert">{error} <button type="button" className="st-btn" onClick={load}>Retry</button></p>}
      {data && <>
        <p>{data.origin === 'evaluation' ? 'Source records saved when this standing record opened.' : 'Reconstructed from current records. The original details were not saved and later corrections or schedule changes may differ.'}</p>
        <p>{data.from} to {data.to}, Los Angeles. {data.reason}</p>
        {data.judged_week && <p>Evaluated week: {data.judged_week.hours} of {data.judged_week.required} FRC hours, including verified logs; {data.judged_week.misses} missed meetings.</p>}
        {data.judged_month && <p>Evaluated month: {data.judged_month.attended} attended of {data.judged_month.counted} counted; {data.judged_month.lates} lates, {data.judged_month.misses} misses. Every third late subtracts one attended meeting.</p>}
        <ul className="st-list">{(data.meetings ?? []).map(m => <li key={m.event_id}>
          <b>{m.title}</b> · {when(m.starts_at)} to {when(m.ends_at)}
          <p>{m.before_standards && data.origin === 'evaluation' ? 'Not counted: before the standards began for this member.' : !m.recorded ? 'Not counted: attendance was not taken.' : m.scan ? `${m.scan === 'present' ? 'Present' : 'Late'}: ${SOURCE[m.source] || m.source}.` : m.excused ? 'Excused absence.' : m.on_break ? 'Not counted: posted break week.' : m.suspended ? 'Not counted: suspended.' : 'Absent: no meeting scan, check-in during the meeting, or session open at its start within the 12-hour limit.'}</p>
          {m.source_id && <small>Source record: {m.source_id} · {when(m.source_at)}{m.manual ? ' · Staff entry' : ''}{m.geo_ok === false ? ' · Location override recorded' : ''}</small>}
          <small>Meeting record: {m.event_id}</small>
        </li>)}</ul>
        {!data.meetings?.length && <p>No meetings in this period.</p>}
        <ul className="st-list">{sessions.map(s => <li key={s.inId}>
          {when(s.inTime)} to {s.outTime ? when(s.outTime) : 'no checkout'} · {fmtDuration(s.ms)}
          {s.pausedMs > 0 && ` · ${fmtDuration(s.pausedMs)} paused, excluded`}
          <p>{s.open ? 'Not counted for standing: no checkout.' : s.category === 'volunteer' ? 'FLL volunteer counts separately.' : excluded.has(s.outId) ? `Not counted: ${excluded.get(s.outId)} review.` : 'Counted signed-in time.'}</p>
          <small>IN: {s.inId} · OUT: {s.outId || 'none'}</small>
        </li>)}</ul>
        <ul className="st-list">{(data.logged_hours ?? []).map(l => <li key={l.id}>
          {l.date} · {l.hours}h · {l.type} · {l.status}
          <p>{l.status === 'verified' && !['volunteer','volunteering'].includes(l.type) ? 'Counted verified FRC work.' : l.status !== 'verified' ? 'Not counted until verified.' : 'FLL volunteer counts separately.'}</p>
          <small>Logged-hours record: {l.id}</small>
        </li>)}</ul>
        {(data.event_attendance ?? []).map(a => <p key={`${a.event_id}-${a.day}`}>Event attendance: {a.event_id} · {a.day} · {a.status}</p>)}
        <p>Withdraw an incorrect probation through Confirm after reviewing the evidence.</p>
      </>}
    </div>}
  </div>
}
