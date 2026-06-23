import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from './supabase'
import { verifyAtShop } from './geo'
import './CheckinPage.css'

// Volunteer check-in fast path for summer FLL-room volunteering. Structured like
// CheckinPage (minimal layout, no NavBar) but every session it opens is tagged
// category = 'volunteer' so those hours filter separately on the boards. Tapping
// while a NORMAL session is open closes that session and switches to volunteer.

const DUPLICATE_WINDOW_MS = 60_000
const CATEGORY = 'volunteer'

const GEO_MESSAGES = {
  denied:      { heading: 'Location denied',      detail: 'Allow location access in your browser settings, then tap Confirm again.' },
  unavailable: { heading: 'Location unavailable', detail: 'Location services must be enabled to check in at the FLL room.' },
  range:       { heading: 'Not at the FLL room',  detail: 'You need to be within 150 m of the FLL room to check in.' },
  error:       { heading: 'Location error',       detail: 'Could not verify your location. Move closer and tap Confirm again.' },
  imprecise:   { heading: 'Precise location off', detail: 'iPhone needs Precise Location on: Settings → Privacy & Location Services → Location Services → your browser (or this app) → set to While Using and turn on Precise Location. Then tap Confirm again.' },
}

// Gold HUD action button. Inline-styled (the check-in route keeps its CSS lean)
// using theme tokens so it matches the rest of the app.
const CONFIRM_BTN_STYLE = {
  marginTop: '1.75rem',
  fontFamily: 'var(--font-ui)',
  fontSize: '1.05rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#0A0B0D',
  background: 'var(--gold)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '0.95rem 2.25rem',
  cursor: 'pointer',
}

// Minimal HUD header — the fast-path route carries no NavBar.
function CheckinHeader({ tag = 'VOLUNTEER', dark = false }) {
  return (
    <header className={`checkin-header${dark ? ' checkin-header-dark' : ''}`}>
      <span className="checkin-header-mark">TECHMEN<span className="checkin-header-dot">·</span>5669</span>
      <span className="checkin-header-tag">{tag}</span>
    </header>
  )
}

export default function VolunteerCheckinPage({ session }) {
  const [searchParams] = useSearchParams()
  const loc = searchParams.get('loc') || 'fll-room'
  const [status, setStatus] = useState('loading')
  const [loadingMsg, setLoadingMsg] = useState(null)
  const [eventType, setEventType] = useState(null)
  const [eventTime, setEventTime] = useState(null)
  const [geoReason, setGeoReason] = useState(null)
  const [acting, setActing] = useState(false)
  const [exempt, setExempt] = useState(false)   // staff-granted geofence exemption
  const [switched, setSwitched] = useState(false) // closed a normal session to open volunteer

  const memberName = session?.user?.user_metadata?.full_name
    || session?.user?.email?.split('@')[0]
    || 'MEMBER'

  // Short haptic pulse on a recorded event, where supported.
  useEffect(() => {
    if (status === 'success' && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40)
    }
  }, [status])

  // Write a volunteer attendance event. Client-side insert, matching the normal
  // check-in path (CheckinPage also inserts directly — there is no check-in RPC).
  async function insertEvent(newType) {
    const now = new Date()
    const { error } = await supabase
      .from('attendance_events')
      .insert({ user_id: session.user.id, type: newType, location: loc, method: 'nfc', category: CATEGORY })
    if (error) throw error
    return now
  }

  // Close an already-open NORMAL session before opening the volunteer one. The
  // close mirrors CheckinPage's check-out (an 'out' event), tagged 'normal' so it
  // pairs with the normal session it's ending.
  async function closeNormalSession() {
    const { error } = await supabase
      .from('attendance_events')
      .insert({ user_id: session.user.id, type: 'out', location: loc, method: 'nfc', category: 'normal' })
    if (error) throw error
  }

  // Volunteer check-in is geofenced and only runs from a user tap — iOS resolves
  // geolocation far more reliably from a gesture than on page load. If a normal
  // session is open we close it first (auto-switch), then open the volunteer one.
  async function confirmCheckin() {
    if (acting) return
    setActing(true)
    setStatus('loading')
    setLoadingMsg('Checking location…')
    try {
      // Exempt members skip the geofence entirely and check in directly.
      if (!exempt) {
        const geo = await verifyAtShop()
        if (!geo.ok) {
          setGeoReason(geo.reason)
          setStatus('geo')
          return
        }
      }
      if (switched) await closeNormalSession()
      const now = await insertEvent('in')
      setEventType('in')
      setEventTime(now)
      setStatus('success')
    } catch (err) {
      console.error(err)
      setStatus('error')
    } finally {
      setActing(false)
    }
  }

  useEffect(() => {
    async function init() {
      try {
        await supabase.from('profiles').upsert({ id: session.user.id }, { onConflict: 'id' })

        // Staff can exempt a member from the location gate (e.g. a phone with
        // unreliable GPS). Read it now so a tapped check-in can skip the fence.
        const { data: prof } = await supabase
          .from('profiles')
          .select('geofence_exempt')
          .eq('id', session.user.id)
          .single()
        setExempt(prof?.geofence_exempt === true)

        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)

        const { data: recent } = await supabase
          .from('attendance_events')
          .select('type, category, event_time')
          .eq('user_id', session.user.id)
          .gte('event_time', startOfToday.toISOString())
          .order('event_time', { ascending: false })
          .limit(1)

        const lastEvent = recent?.[0]
        const now = new Date()

        // Ignore a repeat tap within 60 s to prevent accidental double-toggle.
        if (lastEvent && now - new Date(lastEvent.event_time) < DUPLICATE_WINDOW_MS) {
          setEventType(lastEvent.type)
          setEventTime(new Date(lastEvent.event_time))
          setStatus('duplicate')
          return
        }

        const openSession = lastEvent?.type === 'in'
        const openVolunteer = openSession && lastEvent.category === CATEGORY

        if (openVolunteer) {
          // Same-tap toggle: open volunteer session → check OUT. Automatic and
          // unrestricted, exactly like CheckinPage's check-out.
          const ts = await insertEvent('out')
          setEventType('out')
          setEventTime(ts)
          setStatus('success')
        } else if (openSession) {
          // A NORMAL session is open: auto-switch to volunteer. Both the close and
          // the new check-in are geofenced + tapped, so defer to confirmCheckin.
          setSwitched(true)
          setStatus('confirm')
        } else {
          // No open session (last event was 'out', or none today): plain volunteer
          // check-in. Wait for a tap before geolocating (iOS reliability).
          setStatus('confirm')
        }
      } catch (err) {
        console.error(err)
        setStatus('error')
      }
    }
    init()
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
      : { heading: 'System fault', detail: 'Could not record your volunteer attendance. Try again.' }
    return (
      <div className="checkin-wrap checkin-fault">
        <CheckinHeader tag="FAULT" />
        <div className="checkin-mark checkin-mark-fault">✗</div>
        <h1>{msg.heading}</h1>
        <p className="checkin-status">{msg.detail}</p>
        {status === 'geo' && (
          <button
            onClick={confirmCheckin}
            disabled={acting}
            style={{ ...CONFIRM_BTN_STYLE, opacity: acting ? 0.6 : 1 }}
          >
            {acting ? 'Checking…' : 'Confirm check-in'}
          </button>
        )}
        <footer className="checkin-footer checkin-footer-fault">STATUS // FAULT</footer>
      </div>
    )
  }

  if (status === 'confirm') {
    return (
      <div className="checkin-wrap checkin-idle">
        <CheckinHeader />
        <h1 className="checkin-name">{memberName}</h1>
        <p className="checkin-status">
          {switched ? 'Tap to switch to volunteer hours' : 'Tap to confirm volunteer check-in'}
        </p>
        {switched && (
          <p className="checkin-status" style={{ color: 'var(--gold)' }}>
            You have a normal session open — this will close it.
          </p>
        )}
        <p className="checkin-loc">{loc.replace(/-/g, ' ')}</p>
        <button
          onClick={confirmCheckin}
          disabled={acting}
          style={{ ...CONFIRM_BTN_STYLE, opacity: acting ? 0.6 : 1 }}
        >
          {acting ? 'Checking…' : (switched ? 'Switch to volunteer' : 'Confirm check-in')}
        </button>
        <footer className="checkin-footer">STATUS // CONFIRM VOLUNTEER CHECK-IN</footer>
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
      <CheckinHeader tag={isIn ? 'VOLUNTEERING' : 'CHECK-OUT'} dark={isIn} />
      <div className="checkin-mark">✓</div>
      <h1 className="checkin-name">{memberName}</h1>
      <p className="checkin-status">VOLUNTEER · CHECKED {verb} · {timeStr}</p>
      {switched && isIn && (
        <p className="checkin-status" style={{ color: 'var(--gold)' }}>
          Switched from a normal session to volunteer.
        </p>
      )}
      <p className="checkin-loc">{locDisplay}</p>
      <footer className="checkin-footer">STATUS // {isIn ? 'VOLUNTEERING' : 'CLEAR'}</footer>
      <Link to="/dashboard" className="checkin-home-link">VIEW STATUS →</Link>
    </div>
  )
}
