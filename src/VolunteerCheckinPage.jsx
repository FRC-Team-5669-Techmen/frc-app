import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { supabase } from './supabase'
import { verifyAtFLL } from './geo'
import { DEFAULT_CATEGORY } from './categories'
import {
  DUPLICATE_WINDOW_MS, ARRIVAL_HANDLED, isRevisit, nextNfcAction, statusWindowStartISO,
  readLocalTap, receiptHolds, recordLocalTap, whenForeground,
} from './attendanceState'
import './CheckinPage.css'

// Volunteer check-in fast path for summer FLL-room volunteering. Structured like
// CheckinPage (minimal layout, no NavBar) but every session it opens is tagged
// category = 'volunteer' so those hours filter separately on the boards. Tapping
// while a NORMAL session is open closes that session and switches to volunteer.

const CATEGORY = 'volunteer'

// Same resting screens and refresh-on-return as CheckinPage: a tab brought back
// after a minute away re-reads, never writing; a receipt stays up while the
// status still agrees with it, anything else shows the current status.
const RESTING = new Set(['success', 'duplicate', 'confirm', 'confirm-out', 'unknown'])

function deviceStore() {
  try { return window.localStorage } catch { return null }
}

function fmtClockLA(t) {
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
}

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
  const location = useLocation()
  const navigate = useNavigate()
  const loc = searchParams.get('loc') || 'fll-room'
  const [status, setStatus] = useState('loading')
  const [loadingMsg, setLoadingMsg] = useState(null)
  const [eventType, setEventType] = useState(null)
  const [eventTime, setEventTime] = useState(null)
  const [geoReason, setGeoReason] = useState(null)
  const [acting, setActing] = useState(false)
  const [exempt, setExempt] = useState(false)   // staff-granted geofence exemption
  // The code (or message) of the error behind a 'System fault', shown on that
  // screen so a student has something specific to tell a mentor.
  const [fault, setFault] = useState(null)
  const [switched, setSwitched] = useState(false) // closed a normal session to open volunteer
  const [since, setSince] = useState(null)        // open session start, for confirm-out
  // True once this history entry has acted on its arrival (see CheckinPage).
  const handled = useRef(isRevisit(location.state))
  const started = useRef(false)
  const busy = useRef(false)
  const hiddenAt = useRef(null)
  const mounted = useRef(false)

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
  async function insertEvent(newType, geoVerified = null) {
    const now = new Date()
    const row = { user_id: session.user.id, type: newType, location: loc, method: 'nfc', category: CATEGORY }
    if (newType === 'in') row.geo_ok = geoVerified
    const { error } = await supabase.from('attendance_events').insert(row)
    if (error) throw error
    recordLocalTap(deviceStore(), session.user.id, newType)
    return now
  }

  // Stamp this history entry as handled BEFORE anything is written, so a reload
  // or a back-swipe onto it can never write a second event.
  function markHandled() {
    if (handled.current) return
    handled.current = true
    navigate(`${location.pathname}${location.search}`, { replace: true, state: ARRIVAL_HANDLED })
  }

  // Explicit check-out from the confirm-out screen. Never geofenced.
  async function confirmCheckout() {
    if (acting) return
    setActing(true)
    try {
      const ts = await insertEvent('out')
      setEventType('out')
      setEventTime(ts)
      setStatus('success')
    } catch (err) {
      console.error(err)
      setFault(err?.code || err?.message || null)
      setStatus('error')
    } finally {
      setActing(false)
    }
  }

  // Close an already-open NON-volunteer session before opening the volunteer one.
  // The close mirrors CheckinPage's check-out (an 'out' event); the hours math
  // attributes a session by its IN category, so the OUT's category is immaterial
  // — we use the default 'build' to satisfy the category check constraint.
  async function closeNormalSession() {
    const { error } = await supabase
      .from('attendance_events')
      .insert({ user_id: session.user.id, type: 'out', location: loc, method: 'nfc', category: DEFAULT_CATEGORY })
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
        const geo = await verifyAtFLL()
        if (!geo.ok) {
          setGeoReason(geo.reason)
          setStatus('geo')
          return
        }
      }
      if (switched) await closeNormalSession()
      // geo_ok mirrors CheckinPage: true when the FLL fence was verified, false
      // when an exempt member skipped it.
      const now = await insertEvent('in', !exempt)
      setEventType('in')
      setEventTime(now)
      setStatus('success')
    } catch (err) {
      console.error(err)
      setFault(err?.code || err?.message || null)
      setStatus('error')
    } finally {
      setActing(false)
    }
  }

  // One arrival, decided by the shared rule (attendanceState.nextNfcAction) with
  // this tag's category: an open volunteer session checks out, an open session
  // of any other category offers the switch.
  async function arrive({ revisit = false, receipt = null } = {}) {
    if (busy.current) return
    busy.current = true
    // A quiet re-read behind a receipt leaves the receipt on screen meanwhile.
    if (!receipt) {
      setStatus('loading')
      setLoadingMsg(revisit ? 'Checking your status…' : null)
    }
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

      // A failed read is passed on as null: 'unknown', never "not checked in".
      const { data: recent, error: readErr } = await supabase
        .from('attendance_events')
        .select('type, category, event_time')
        .eq('user_id', session.user.id)
        .gte('event_time', statusWindowStartISO())
        .order('event_time', { ascending: false })
        .limit(1)

      const next = nextNfcAction(readErr ? null : (recent ?? []), Date.now(), {
        category: CATEGORY,
        revisit: revisit || handled.current,
        localTap: readLocalTap(deviceStore(), session.user.id),
      })

      // The member left this page while it was reading: act on nothing (see
      // CheckinPage).
      if (!mounted.current) return
      // A receipt the re-read still agrees with stays up (attendanceState.receiptHolds).
      if (receipt && receiptHolds(next, receipt)) return

      if (next.action === 'unknown') {
        console.error(readErr)
        setStatus('unknown')
        return
      }
      markHandled()

      if (next.action === 'duplicate') {
        // Ignore a repeat tap within 60 s to prevent accidental double-toggle.
        setEventType(next.duplicate.type)
        setEventTime(new Date(next.duplicate.at))
        setStatus('duplicate')
      } else if (next.action === 'check_out') {
        // Same-tap toggle: open volunteer session → check OUT. Automatic and
        // unrestricted, exactly like CheckinPage's check-out.
        const ts = await insertEvent('out')
        setEventType('out')
        setEventTime(ts)
        setStatus('success')
      } else if (next.action === 'confirm_check_out') {
        // This page was shown again: show the open session, let the member choose.
        setSince(next.status.since)
        setStatus('confirm-out')
      } else if (next.action === 'switch') {
        // A NORMAL session is open: auto-switch to volunteer. Both the close and
        // the new check-in are geofenced + tapped, so defer to confirmCheckin.
        setSwitched(true)
        setStatus('confirm')
      } else {
        // No open session: plain volunteer check-in. Wait for a tap before
        // geolocating (iOS reliability).
        setSwitched(false)
        setStatus('confirm')
      }
    } catch (err) {
      console.error(err)
      setFault(err?.code || err?.message || null)
      setStatus('error')
    } finally {
      busy.current = false
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Act on the arrival once, and only when the page is in front of the member.
  useEffect(() => {
    if (started.current) return
    const cancel = whenForeground(document, () => {
      started.current = true
      arrive()
    })
    return cancel
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-read (never write) when a resting tab comes back after a minute away.
  useEffect(() => {
    const resting = RESTING.has(status) && !acting
    // What a receipt screen shows, so the re-read can leave it up when it still holds.
    const receipt = status === 'success' || status === 'duplicate' ? eventType : null
    function onVisibility() {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return }
      const away = hiddenAt.current == null ? 0 : Date.now() - hiddenAt.current
      hiddenAt.current = null
      if (resting && away >= DUPLICATE_WINDOW_MS) arrive({ revisit: true, receipt })
    }
    function onPageShow(e) {
      if (e.persisted && resting) arrive({ revisit: true, receipt })
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [status, acting, eventType]) // eslint-disable-line react-hooks/exhaustive-deps

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

  if (status === 'geo' || status === 'error' || status === 'unknown') {
    const msg = status === 'geo'
      ? (GEO_MESSAGES[geoReason] ?? GEO_MESSAGES.error)
      : status === 'unknown'
        ? { heading: 'Status unavailable', detail: 'Could not read your check-in status, so nothing was recorded. Check your connection and try again.' }
        : { heading: 'System fault', detail: `Could not record your volunteer attendance${fault ? ` (${fault})` : ''}. Try again. If it happens again, show this screen to a mentor.` }
    return (
      <div className="checkin-wrap checkin-fault">
        <CheckinHeader tag="FAULT" />
        <div className="checkin-mark checkin-mark-fault" aria-hidden="true">✗</div>
        <h1>{msg.heading}</h1>
        <p className="checkin-status" role="alert">{msg.detail}</p>
        {status === 'geo' ? (
          <button
            onClick={confirmCheckin}
            disabled={acting}
            style={{ ...CONFIRM_BTN_STYLE, opacity: acting ? 0.6 : 1 }}
          >
            {acting ? 'Checking…' : 'Confirm check-in'}
          </button>
        ) : (
          // Re-reads first; after a failed write the entry is already marked, so
          // this shows the current status rather than writing again on its own.
          <button onClick={() => arrive()} style={CONFIRM_BTN_STYLE}>Try again</button>
        )}
        <footer className="checkin-footer checkin-footer-fault" aria-hidden="true">STATUS // FAULT</footer>
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

  const locDisplay = loc.replace(/-/g, ' ')

  if (status === 'confirm-out') {
    return (
      <div className="checkin-wrap checkin-idle">
        <CheckinHeader tag="CHECK-OUT" />
        <h1 className="checkin-name">{memberName}</h1>
        <p className="checkin-status">Volunteering since {fmtClockLA(since)}</p>
        <p className="checkin-loc">{locDisplay}</p>
        <button
          onClick={confirmCheckout}
          disabled={acting}
          style={{ ...CONFIRM_BTN_STYLE, opacity: acting ? 0.6 : 1 }}
        >
          {acting ? 'Checking out…' : 'Check out'}
        </button>
        <footer className="checkin-footer">STATUS // CONFIRM TO CHECK OUT</footer>
        <Link to="/dashboard" className="checkin-home-link">VIEW STATUS →</Link>
      </div>
    )
  }

  const timeStr = fmtClockLA(eventTime)
  const verb = eventType === 'in' ? 'IN' : 'OUT'

  if (status === 'duplicate') {
    return (
      <div className="checkin-wrap checkin-duplicate">
        <CheckinHeader />
        <div className="checkin-panel checkin-panel-amber">
          <div className="checkin-bang" aria-hidden="true">!</div>
          <h1 className="checkin-name">{memberName}</h1>
          <p className="checkin-status" role="alert">ALREADY {verb} · {timeStr}</p>
          <p className="checkin-loc">{locDisplay}</p>
        </div>
        <footer className="checkin-footer checkin-footer-amber" aria-hidden="true">STATUS // NO DUPLICATE</footer>
        <Link to="/dashboard" className="checkin-home-link">VIEW STATUS →</Link>
      </div>
    )
  }

  // success — check-in floods gold; check-out is a dark confirm panel
  const isIn = eventType === 'in'
  return (
    <div className={`checkin-wrap ${isIn ? 'checkin-success' : 'checkin-checkout'}`}>
      <CheckinHeader tag={isIn ? 'VOLUNTEERING' : 'CHECK-OUT'} dark={isIn} />
      <div className="checkin-mark" aria-hidden="true">✓</div>
      <h1 className="checkin-name">{memberName}</h1>
      <p className="checkin-status" role="alert">VOLUNTEER · CHECKED {verb} · {timeStr}</p>
      {switched && isIn && (
        <p className="checkin-status" style={{ color: 'var(--gold)' }}>
          Switched from a normal session to volunteer.
        </p>
      )}
      <p className="checkin-loc">{locDisplay}</p>
      <footer className="checkin-footer" aria-hidden="true">STATUS // {isIn ? 'VOLUNTEERING' : 'CLEAR'}</footer>
      <Link to="/dashboard" className="checkin-home-link">VIEW STATUS →</Link>
    </div>
  )
}
