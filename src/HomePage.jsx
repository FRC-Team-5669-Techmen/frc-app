import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import TeamStatus from './TeamStatus'
import { computeHoursMs, fmtDuration } from './hoursUtils'
import './HomePage.css'

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function HomePage({ session, hasRole }) {
  const [allEvents, setAllEvents] = useState(null)
  const [acting, setActing] = useState(false)

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_events')
      .select('id, type, event_time, location')
      .eq('user_id', session.user.id)
      .order('event_time', { ascending: true })
    setAllEvents(data ?? [])
  }, [session.user.id])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  async function handleCheckOut() {
    if (acting) return
    setActing(true)
    await supabase.from('attendance_events').insert({
      user_id:  session.user.id,
      type:     'out',
      location: 'button',
      method:   null,
    })
    await fetchEvents()
    setActing(false)
  }

  if (allEvents === null) {
    return (
      <div className="home-loading">
        <div className="home-spinner" />
      </div>
    )
  }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayEvents = allEvents.filter(e => new Date(e.event_time) >= startOfToday)
  const lastToday = todayEvents.at(-1)
  const isIn = lastToday?.type === 'in'
  const todayHours = fmtDuration(computeHoursMs(todayEvents))
  const seasonHours = fmtDuration(computeHoursMs(allEvents))

  return (
    <div className="home-wrap">
      <div className="home-body">
        <TeamStatus />

        <div className="status-card" data-tour="status-card">
          <div className={`status-badge ${isIn ? 'status-in' : 'status-out'}`}>
            {isIn ? 'Checked in' : 'Not checked in'}
          </div>
          {isIn && lastToday && (
            <p className="status-since">since {fmtTime(lastToday.event_time)}</p>
          )}
          <div className="stats-row">
            <div className="stat">
              <span className="stat-value">{todayHours || '0m'}</span>
              <span className="stat-label">Today</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-value">{seasonHours || '0m'}</span>
              <span className="stat-label">Season</span>
            </div>
          </div>
        </div>

        {isIn ? (
          <button className="toggle-btn toggle-out" data-tour="checkout" onClick={handleCheckOut} disabled={acting}>
            {acting ? '…' : 'Check Out'}
          </button>
        ) : (
          <p className="nfc-hint">Tap your NFC tag to check in</p>
        )}

        <section className="events-section" data-tour="today-activity">
          <h2 className="events-heading">Today's activity</h2>
          {todayEvents.length === 0 ? (
            <p className="events-empty">No activity yet today.</p>
          ) : (
            <ul className="events-list">
              {[...todayEvents].reverse().map(e => (
                <li key={e.id} className={`event-item event-${e.type}`}>
                  <span className="event-pip" />
                  <span className="event-label">Checked {e.type}</span>
                  <span className="event-meta">{fmtTime(e.event_time)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
