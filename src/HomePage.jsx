import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { verifyAtShop } from './geo'
import './HomePage.css'

const GEO_ERRORS = {
  denied:      'Location access denied — enable it in browser settings and try again.',
  unavailable: 'Location services unavailable. Cannot verify you\'re at the shop.',
  range:       'You\'re not at the shop. Move within 150 m of the build space to check in.',
  error:       'Could not verify your location. Try again.',
}

function computeHoursMs(events) {
  let total = 0
  let inTime = null
  for (const e of events) {
    if (e.type === 'in') {
      inTime = new Date(e.event_time)
    } else if (e.type === 'out' && inTime) {
      total += new Date(e.event_time) - inTime
      inTime = null
    }
  }
  if (inTime) total += Date.now() - inTime
  return total
}

function fmtDuration(ms) {
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function HomePage({ session, hasRole }) {
  const [allEvents, setAllEvents] = useState(null)
  const [acting, setActing] = useState(false)
  const [checkInError, setCheckInError] = useState('')

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_events')
      .select('id, type, event_time, location')
      .eq('user_id', session.user.id)
      .order('event_time', { ascending: true })
    setAllEvents(data ?? [])
  }, [session.user.id])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  async function handleToggle() {
    if (acting) return
    setActing(true)
    setCheckInError('')
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayEvents = (allEvents ?? []).filter(e => new Date(e.event_time) >= startOfToday)
    const newType = todayEvents.at(-1)?.type === 'in' ? 'out' : 'in'
    // Students may not check in via button — NFC only
    if (newType === 'in' && !isStaff) { setActing(false); return }
    if (newType === 'in') {
      const geo = await verifyAtShop()
      if (!geo.ok) {
        setCheckInError(GEO_ERRORS[geo.reason] ?? GEO_ERRORS.error)
        setActing(false)
        return
      }
    }
    await supabase.from('attendance_events').insert({
      user_id: session.user.id,
      type: newType,
      location: 'button',
      method: null,
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
        <div className="status-card">
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
          <button className="toggle-btn toggle-out" onClick={handleToggle} disabled={acting}>
            {acting ? '…' : 'Check Out'}
          </button>
        ) : isStaff ? (
          <button className="toggle-btn toggle-in" onClick={handleToggle} disabled={acting}>
            {acting ? '…' : 'Check In'}
          </button>
        ) : (
          <p className="nfc-hint">Tap your NFC tag to check in</p>
        )}
        {checkInError && <p className="home-geo-error">{checkInError}</p>}

        <section className="events-section">
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
