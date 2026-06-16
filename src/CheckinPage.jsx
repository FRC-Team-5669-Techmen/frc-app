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

// Minimal HUD header — the fast-path route carries no NavBar.
function CheckinHeader({ tag = 'CHECK-IN', dark = false }) {
  return (
    <header className={`checkin-header${dark ? ' checkin-header-dark' : ''}`}>
      <span className="checkin-header-mark">TECHMEN<span className="checkin-header-dot">·</span>5669</span>
      <span className="checkin-header-tag">{tag}</span>
    </header>
  )
}

export default function CheckinPage({ session }) {
  const [searchParams] = useSearchParams()
  const loc = searchParams.get('loc') || 'unknown'
  const [status, setStatus] = useState('loading')
  const [loadingMsg, setLoadingMsg] = useState(null)
  const [eventType, setEventType] = useState(null)
  const [eventTime, setEventTime] = useState(null)
  const [geoReason, setGeoReason] = useState(null)

  const memberName = session?.user?.user_metadata?.full_name
    || session?.user?.email?.split('@')[0]
    || 'MEMBER'

  // Short haptic pulse on a recorded event, where supported.
  useEffect(() => {
    if (status === 'success' && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40)
    }
  }, [status])

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
      <div className="checkin-wrap checkin-idle">
        <CheckinHeader />
        <div className="checkin-target hud-brackets">
          <span className="hud-bracket-b" />
          <div className="checkin-ring" />
          <div className="checkin-target-label">SCAN NFC</div>
        </div>
        <p className="checkin-loading-msg">{loadingMsg || 'Reading tag…'}</p>
        <footer className="checkin-footer">STATUS // AWAITING TAG</footer>
      </div>
    )
  }

  if (status === 'geo' || status === 'error') {
    const msg = status === 'geo'
      ? (GEO_MESSAGES[geoReason] ?? GEO_MESSAGES.error)
      : { heading: 'System fault', detail: 'Could not record your attendance. Try again.' }
    return (
      <div className="checkin-wrap checkin-fault">
        <CheckinHeader tag="FAULT" />
        <div className="checkin-mark checkin-mark-fault">✗</div>
        <h1>{msg.heading}</h1>
        <p className="checkin-status">{msg.detail}</p>
        <footer className="checkin-footer checkin-footer-fault">STATUS // FAULT</footer>
      </div>
    )
  }

  const timeStr = eventTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const locDisplay = loc.replace(/-/g, ' ')
  const verb = eventType === 'in' ? 'IN' : 'OUT'

  if (status === 'duplicate') {
    return (
      <div className="checkin-wrap checkin-duplicate">
        <CheckinHeader />
        <div className="checkin-panel checkin-panel-amber">
          <div className="checkin-bang">!</div>
          <h1 className="checkin-name">{memberName}</h1>
          <p className="checkin-status">ALREADY {verb} · {timeStr}</p>
          <p className="checkin-loc">{locDisplay}</p>
        </div>
        <footer className="checkin-footer checkin-footer-amber">STATUS // NO DUPLICATE</footer>
        <Link to="/dashboard" className="checkin-home-link">VIEW STATUS →</Link>
      </div>
    )
  }

  // success — check-in floods gold; check-out is a dark confirm panel
  const isIn = eventType === 'in'
  return (
    <div className={`checkin-wrap ${isIn ? 'checkin-success' : 'checkin-checkout'}`}>
      <CheckinHeader tag={isIn ? 'ON DECK' : 'CHECK-OUT'} dark={isIn} />
      <div className="checkin-mark">✓</div>
      <h1 className="checkin-name">{memberName}</h1>
      <p className="checkin-status">CHECKED {verb} · {timeStr}</p>
      <p className="checkin-loc">{locDisplay}</p>
      <footer className="checkin-footer">STATUS // {isIn ? 'ON DECK' : 'CLEAR'}</footer>
      <Link to="/dashboard" className="checkin-home-link">VIEW STATUS →</Link>
    </div>
  )
}
