import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from './supabase'
import './CheckinPage.css'

export default function CheckinPage({ session }) {
  const [searchParams] = useSearchParams()
  const loc = searchParams.get('loc') || 'unknown'
  const [status, setStatus] = useState('loading')
  const [eventType, setEventType] = useState(null)
  const [eventTime, setEventTime] = useState(null)

  useEffect(() => {
    async function record() {
      try {
        // Ensure profile row exists for this user (handles accounts created before the trigger)
        await supabase.from('profiles').upsert({ id: session.user.id }, { onConflict: 'id' })

        // Find the most recent event today to determine in/out toggle
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)

        const { data: recent } = await supabase
          .from('attendance_events')
          .select('type')
          .eq('user_id', session.user.id)
          .gte('event_time', startOfToday.toISOString())
          .order('event_time', { ascending: false })
          .limit(1)

        const newType = recent?.[0]?.type === 'in' ? 'out' : 'in'
        const now = new Date()

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

  return (
    <div className={`checkin-wrap checkin-${eventType}`}>
      <div className="checkin-icon">✓</div>
      <h1>Checked {eventType}</h1>
      <p className="checkin-detail">{timeStr} · {locDisplay}</p>
      <Link to="/" className="checkin-home-link">View status →</Link>
    </div>
  )
}
