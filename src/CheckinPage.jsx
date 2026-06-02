import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from './supabase'
import './CheckinPage.css'

const DUPLICATE_WINDOW_MS = 60_000

export default function CheckinPage({ session }) {
  const [searchParams] = useSearchParams()
  const loc = searchParams.get('loc') || 'unknown'
  const [status, setStatus] = useState('loading')
  const [eventType, setEventType] = useState(null)
  const [eventTime, setEventTime] = useState(null)

  useEffect(() => {
    async function record() {
      try {
        await supabase.from('profiles').upsert({ id: session.user.id }, { onConflict: 'id' })

        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)

        const { data: recent } = await supabase
          .from('attendance_events')
          .select('type, event_time')
          .eq('user_id', session.user.id)
          .gte('event_time', startOfToday.toISOString())
          .order('event_time', { ascending: false })
          .limit(1)

        const lastEvent = recent?.[0]
        const now = new Date()

        // Ignore a repeat tap within 60 s to prevent accidental double-toggle
        if (lastEvent && now - new Date(lastEvent.event_time) < DUPLICATE_WINDOW_MS) {
          setEventType(lastEvent.type)
          setEventTime(new Date(lastEvent.event_time))
          setStatus('duplicate')
          return
        }

        const newType = lastEvent?.type === 'in' ? 'out' : 'in'

        const { error } = await supabase
          .from('attendance_events')
          .insert({ user_id: session.user.id, type: newType, location: loc, method: 'nfc' })

        if (error) throw error
        setEventType(newType)
        setEventTime(now)
        setStatus('success')
      } catch (err) {
        console.error(err)
        setStatus('error')
      }
    }
    record()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading') {
    return (
      <div className="checkin-wrap">
        <div className="checkin-spinner" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="checkin-wrap checkin-error">
        <div className="checkin-icon">✗</div>
        <h1>Something went wrong</h1>
        <p className="checkin-detail">Could not record your attendance. Try again.</p>
      </div>
    )
  }

  const timeStr = eventTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const locDisplay = loc.replace(/-/g, ' ')

  if (status === 'duplicate') {
    return (
      <div className={`checkin-wrap checkin-${eventType}`}>
        <div className="checkin-icon">✓</div>
        <h1>Already {eventType === 'in' ? 'checked in' : 'checked out'}</h1>
        <p className="checkin-detail">{timeStr} · {locDisplay}</p>
        <p className="checkin-hint">Tap again in a moment to {eventType === 'in' ? 'check out' : 'check in'}.</p>
        <Link to="/dashboard" className="checkin-home-link">View status →</Link>
      </div>
    )
  }

  return (
    <div className={`checkin-wrap checkin-${eventType}`}>
      <div className="checkin-icon">✓</div>
      <h1>Checked {eventType}</h1>
      <p className="checkin-detail">{timeStr} · {locDisplay}</p>
      <Link to="/dashboard" className="checkin-home-link">View status →</Link>
    </div>
  )
}
