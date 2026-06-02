import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from './supabase'
import { verifyAtShop } from './geo'
import './CheckinPage.css'

const DUPLICATE_WINDOW_MS = 60_000

const GEO_MESSAGES = {
  denied:      { heading: 'Location denied',      detail: 'Allow location access in your browser settings and tap the tag again.' },
  unavailable: { heading: 'Location unavailable', detail: 'Location services must be enabled to check in at the shop.' },
  range:       { heading: 'Not at the shop',      detail: 'You need to be within 150 m of the build space to check in.' },
  error:       { heading: 'Location error',       detail: 'Could not verify your location. Move closer and try again.' },
}

export default function CheckinPage({ session }) {
  const [searchParams] = useSearchParams()
  const loc = searchParams.get('loc') || 'unknown'
  const [status, setStatus] = useState('loading')
  const [loadingMsg, setLoadingMsg] = useState(null)
  const [eventType, setEventType] = useState(null)
  const [eventTime, setEventTime] = useState(null)
  const [geoReason, setGeoReason] = useState(null)

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

        // Geofence check-ins only; check-outs are unrestricted
        if (newType === 'in') {
          setLoadingMsg('Checking location…')
          const geo = await verifyAtShop()
          if (!geo.ok) {
            setGeoReason(geo.reason)
            setStatus('geo')
            return
          }
        }

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
        {loadingMsg && <p className="checkin-loading-msg">{loadingMsg}</p>}
      </div>
    )
  }

  if (status === 'geo') {
    const msg = GEO_MESSAGES[geoReason] ?? GEO_MESSAGES.error
    return (
      <div className="checkin-wrap checkin-error">
        <div className="checkin-icon">✗</div>
        <h1>{msg.heading}</h1>
        <p className="checkin-detail">{msg.detail}</p>
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
