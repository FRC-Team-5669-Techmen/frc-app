import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import './ActivityPage.css'

// Staff-only live view of today's attendance, plus a manual override control
// to check any member in or out (bypassing the geofence).
export default function ActivityPage({ hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [events, setEvents]     = useState(null)
  const [members, setMembers]   = useState([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy]         = useState(false)
  const [pageError, setPageError] = useState('')

  const load = useCallback(async () => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const { data, error } = await supabase
      .from('attendance_events')
      // Two FKs point at profiles now (user_id, overridden_by) so name the FK
      .select('id, type, event_time, location, overridden_by, member:profiles!attendance_events_user_fkey(full_name, nickname)')
      .gte('event_time', start.toISOString())
      .order('event_time', { ascending: false })
    if (error) { setPageError(error.message); setEvents([]); return }
    setEvents(data ?? [])
  }, [])

  useEffect(() => {
    if (!isStaff) return
    load()
    supabase.from('profiles').select('id, full_name, nickname').order('full_name')
      .then(({ data }) => setMembers(data ?? []))

    const timer = setInterval(load, 60_000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [isStaff, load])

  async function override(newType) {
    if (!selected) return
    setBusy(true)
    const { error } = await supabase.rpc('staff_override_attendance', {
      target_member: selected,
      new_type: newType,
    })
    setBusy(false)
    if (error) { setPageError(error.message); return }
    load()
  }

  if (!isStaff) {
    return (
      <div className="activity-wrap">
        <div className="activity-denied">Staff access only.</div>
      </div>
    )
  }

  return (
    <div className="activity-wrap">
      <div className="activity-body">
        <h1 className="activity-title">Today's Activity</h1>

        {pageError && (
          <p className="activity-error" onClick={() => setPageError('')}>{pageError}</p>
        )}

        <div className="activity-override">
          <select
            className="activity-select"
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            <option value="">Select a member…</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{displayName(m)}</option>
            ))}
          </select>
          <button
            className="activity-btn activity-btn-in"
            disabled={!selected || busy}
            onClick={() => override('in')}
          >
            Check in
          </button>
          <button
            className="activity-btn activity-btn-out"
            disabled={!selected || busy}
            onClick={() => override('out')}
          >
            Check out
          </button>
        </div>

        {events === null ? (
          <div className="activity-loading"><div className="activity-spinner" /></div>
        ) : events.length === 0 ? (
          <p className="activity-empty">No check-ins yet today.</p>
        ) : (
          <div className="activity-table-wrap">
            <table className="activity-table">
              <thead>
                <tr>
                  <th className="activity-th">Member</th>
                  <th className="activity-th">Status</th>
                  <th className="activity-th">Time</th>
                  <th className="activity-th">Location</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} className="activity-row">
                    <td className="activity-td activity-name">
                      {displayName(ev.member)}
                      {ev.overridden_by && <span className="activity-badge">override</span>}
                    </td>
                    <td className="activity-td">
                      <span className={`activity-type activity-type-${ev.type}`}>
                        {ev.type === 'in' ? 'In' : 'Out'}
                      </span>
                    </td>
                    <td className="activity-td">
                      {new Date(ev.event_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td className="activity-td activity-loc">{(ev.location || '—').replace(/-/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
