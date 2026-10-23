import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { recordAttendance } from './attendanceRecord'
import { verifyAtShop } from './geo'
import { DEFAULT_CATEGORY } from './categories'
import {
  DUPLICATE_WINDOW_MS, ARRIVAL_HANDLED, isRevisit, nextNfcAction, statusWindowStartISO,
  readLocalTap, receiptHolds, recordLocalTap, whenForeground,
} from './attendanceState'
import {
  loadMySignout, requestSignout, withdrawSignout, insertOutWithNote, isStaffMember,
  liveMeeting, myMeetingCheckin, meetingCheckin,
} from './signout'
import SignoutForm from './SignoutForm'
import './CheckinPage.css'

// Screens a member can leave the tab sitting on. When the tab comes back after
// more than a minute away, the page re-reads (never writing on its own). A
// prompt is replaced by the CURRENT status; a receipt (success, duplicate)
// stays up while the status still agrees with it, and is replaced only when it
// no longer does, so a tab the browser re-surfaces is neither a stale "checked
// in" from hours ago nor a "CHECKED OUT" that turns into the check-in prompt.
const RESTING = new Set(['success', 'duplicate', 'confirm', 'confirm-out', 'unknown', 'signout', 'pending', 'meeting'])

// How often the waiting screen looks for the approval.
const PENDING_POLL_MS = 10000

// Times on this route read in the team's zone.
function fmtClockLA(t) {
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
}

// localStorage can be missing or throw (private mode); attendanceState treats
// null as "no record".
function deviceStore() {
  try { return window.localStorage } catch { return null }
}

const GEO_MESSAGES = {
  denied:      { heading: 'Location denied',      detail: 'Allow location access in your browser settings, then tap Confirm again.' },
  unavailable: { heading: 'Location unavailable', detail: 'Location services must be enabled to check in at the shop.' },
  range:       { heading: 'Not at the shop',      detail: 'You need to be within 150 m of the build space to check in.' },
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
  color: 'var(--on-gold)',
  background: 'var(--gold-fill)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '0.95rem 2.25rem',
  cursor: 'pointer',
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
  const location = useLocation()
  const navigate = useNavigate()
  const loc = searchParams.get('loc') || 'unknown'
  const [status, setStatus] = useState('loading')
  const [loadingMsg, setLoadingMsg] = useState(null)
  const [eventType, setEventType] = useState(null)
  const [eventTime, setEventTime] = useState(null)
  const [since, setSince] = useState(null)       // open session start, for confirm-out
  const [geoReason, setGeoReason] = useState(null)
  const [acting, setActing] = useState(false)
  const [exempt, setExempt] = useState(false)  // staff-granted geofence exemption
  // The code (or message) of the error behind a 'System fault', shown on that
  // screen so a student has something specific to tell a mentor.
  const [fault, setFault] = useState(null)
  // Sign-out requests (0014). `returned` is the reason a mentor sent the last
  // request back ('' when none was given), null when nothing was sent back.
  const [returned, setReturned] = useState(null)
  const [pending, setPending] = useState(null)
  const [soError, setSoError] = useState(null)
  const [staffSelf, setStaffSelf] = useState(false)
  const [meeting, setMeeting] = useState(null)   // { title, status: present|late, at }
  // After a check-in (0017 and the jobs board): no shop tools until the
  // first-two-weeks checklist is done, and the member picks a task.
  const [watchOnly, setWatchOnly] = useState(false)
  const [tasks, setTasks] = useState(null)
  const [taskMsg, setTaskMsg] = useState(null)
  // True once this history entry has acted on its arrival. Starts true when the
  // entry already carries the marker: a reload, a back/forward, a restored tab.
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

  // Write the attendance event and flip to the success screen. A check-IN is
  // tagged with the category fixed by the scanned tag (this is the shop/build
  // tag → DEFAULT_CATEGORY) + geo_ok (true = geofence verified, false = exempt
  // member skipped the fence); a check-OUT just closes the open session (the math
  // attributes a session by its IN category, so the OUT need not carry either).
  async function insertEvent(newType, geoVerified = null, signout = null) {
    const now = new Date()
    const row = { user_id: session.user.id, type: newType, location: loc, method: 'nfc' }
    if (newType === 'in') { row.category = DEFAULT_CATEGORY; row.geo_ok = geoVerified }
    if (signout) {
      await insertOutWithNote(supabase, row, signout)
    } else {
      const { error } = await recordAttendance(supabase, row)
      if (error) throw error
    }
    recordLocalTap(deviceStore(), session.user.id, newType)
    setEventType(newType)
    setEventTime(now)
    setStatus('success')
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
      await insertEvent('out')
    } catch (err) {
      console.error(err)
      setFault(err?.code || err?.message || null)
      setStatus('error')
    } finally {
      setActing(false)
    }
  }

  // Check-in is gated by the geofence and only runs from a user tap — iOS
  // resolves geolocation far more reliably from a gesture than on page load.
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
      // geo_ok: true when the fence was verified, false when an exempt member
      // skipped it (location not proven — surfaced if the exemption is removed).
      await insertEvent('in', !exempt)
      afterCheckin()
      // A team meeting on now: the same scan logs present or late (0014).
      const m = await liveMeeting(supabase)
      if (m) {
        const r = await meetingCheckin(supabase, m.id)
        if (r) setMeeting({ title: m.title, status: r.status, at: r.scanned_at })
      }
    } catch (err) {
      console.error(err)
      setFault(err?.code || err?.message || null)
      setStatus('error')
    } finally {
      setActing(false)
    }
  }

  // Reads only; a failure leaves the success screen as it was.
  async function afterCheckin() {
    try {
      const gate = await supabase.rpc('shop_tools_allowed', { p_member: null })
      if (!gate.error && gate.data === false) setWatchOnly(true)
      const { data: prof } = await supabase.from('profiles').select('subteams').eq('id', session.user.id).maybeSingle()
      const subs = prof?.subteams ?? []
      if (!subs.length) return
      const { data } = await supabase.from('tasks').select('id, title, subteam').eq('status', 'open').in('subteam', subs).order('created_at', { ascending: false }).limit(5)
      setTasks(data ?? [])
    } catch { /* the screen already says checked in */ }
  }

  async function pickTask(t) {
    setTaskMsg(null)
    const c = await supabase.rpc('claim_task', { p_task: t.id })
    if (c.error && !/already claimed/i.test(c.error.message || '')) { setTaskMsg(c.error.message || 'Could not take that task.'); return }
    const j = await supabase.rpc('set_session_job', { p_task: t.id })
    setTaskMsg(j.error ? (j.error.message || 'Could not set the task.') : `On it: ${t.title}`)
  }

  // A member with a session open, once 0014 is there: a meeting scan, the
  // waiting screen, or the sign-out note. Before 0014 (`legacy`) this does
  // what the tag always did. `fresh` is a new tap; a page shown again never
  // writes anything, the meeting check-in included.
  async function openSession(next, fresh) {
    const uid = session.user.id
    const so = await loadMySignout(supabase, uid)
    if (!mounted.current) return
    if (so.legacy) {
      if (fresh) { await insertEvent('out'); return }
      setSince(next.status.since)
      setStatus('confirm-out')
      return
    }
    setSince(next.status.since)
    if (so.pending) { setPending(so.pending); setStatus('pending'); return }
    const staff = await isStaffMember(supabase, uid)
    setStaffSelf(staff)
    if (fresh) {
      const m = await liveMeeting(supabase)
      if (m) {
        const mine = await myMeetingCheckin(supabase, m.id, uid)
        if (mine === null) {
          const r = await meetingCheckin(supabase, m.id)
          if (r) { setMeeting({ title: m.title, status: r.status, at: r.scanned_at }); setStatus('meeting'); return }
        }
      }
    }
    // A request sent back during THIS session is shown with its reason.
    const sentBack = so.returned && Date.parse(so.returned.decided_at) >= Date.parse(next.status.since)
    setReturned(sentBack ? (so.returned.reason ?? '') : null)
    setSoError(null)
    setStatus('signout')
  }

  async function submitSignout({ note, cleanup }) {
    if (acting) return
    setActing(true)
    setSoError(null)
    try {
      if (staffSelf) { await insertEvent('out', null, { note, cleanup }); return }
      const r = await requestSignout(supabase, { note, cleanup, location: loc, source: 'nfc' })
      if (r.mode === 'legacy') { await insertEvent('out'); return }
      setPending(r.row)
      setStatus('pending')
    } catch (err) {
      console.error(err)
      if (err?.code === 'P0002') { setActing(false); arrive({ revisit: true }); return }
      setSoError(`Not sent${err?.code ? ` (${err.code})` : ''}. Try again.`)
    } finally {
      setActing(false)
    }
  }

  async function withdraw() {
    if (acting) return
    setActing(true)
    try {
      await withdrawSignout(supabase)
      setPending(null)
      setReturned(null)
      setStatus('signout')
    } catch (err) {
      setSoError(`Could not withdraw${err?.code ? ` (${err.code})` : ''}.`)
    } finally {
      setActing(false)
    }
  }

  // While waiting: approved shows the check-out receipt, sent back shows the
  // form with the reason. Reads only.
  async function checkPending() {
    const uid = session.user.id
    const { data } = await supabase.from('signout_requests')
      .select('status, reason, decided_at, out_event_id').eq('member_id', uid)
      .order('requested_at', { ascending: false }).limit(1)
    const row = data?.[0]
    if (!row || row.status === 'pending' || !mounted.current) return
    if (row.status === 'approved') {
      setEventType('out')
      setEventTime(row.decided_at ? new Date(row.decided_at) : new Date())
      setStatus('success')
    } else if (row.status === 'returned') {
      setReturned(row.reason ?? '')
      setStatus('signout')
    } else {
      setStatus('signout')
    }
  }

  useEffect(() => {
    if (status !== 'pending') return
    const t = setInterval(checkPending, PENDING_POLL_MS)
    return () => clearInterval(t)
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  // One arrival: read the member's status and act on it through the shared rule
  // (attendanceState.nextNfcAction). `revisit` forces the no-auto-write path;
  // the history entry's own marker forces it too.
  async function arrive({ revisit = false, receipt = null } = {}) {
    if (busy.current) return
    busy.current = true
    // A quiet re-read behind a receipt leaves the receipt on screen meanwhile.
    if (!receipt) {
      setStatus('loading')
      setLoadingMsg(revisit ? 'Checking your status…' : null)
    }
    try {
      await writeVia(supabase, 'member_ensure_profile', {},
        { table: 'profiles', op: 'upsert', values: { id: session.user.id }, options: { onConflict: 'id' } })

      // Staff can exempt a member from the location gate (e.g. a phone with
      // unreliable GPS). Read it now so a tapped check-in can skip the fence.
      const { data: prof } = await supabase
        .from('profiles')
        .select('geofence_exempt')
        .eq('id', session.user.id)
        .single()
      setExempt(prof?.geofence_exempt === true)

      // The newest event inside the window the rule can count. A failed read is
      // passed on as null, which the rule answers as 'unknown' -- never as "not
      // checked in", which is what used to put a member on the check-in screen.
      const { data: recent, error: readErr } = await supabase
        .from('attendance_events')
        .select('type, event_time')
        .eq('user_id', session.user.id)
        .gte('event_time', statusWindowStartISO())
        .order('event_time', { ascending: false })
        .limit(1)

      const next = nextNfcAction(readErr ? null : (recent ?? []), Date.now(), {
        revisit: revisit || handled.current,
        localTap: readLocalTap(deviceStore(), session.user.id),
      })

      // The member left this page while it was reading (a back gesture, the
      // app's access gate replacing the tree): act on nothing. Stamping now
      // would replace whatever entry is current with /checkin and pull them
      // back here, and a write now would be one nobody is looking at.
      if (!mounted.current) return
      // A receipt the re-read still agrees with stays up (attendanceState.receiptHolds).
      if (receipt && receiptHolds(next, receipt)) return
      // The waiting screen came back and the session is closed: approved.
      if (receipt === 'pending' && next.action !== 'unknown' && !next.status.checkedIn) {
        await checkPending()
        return
      }

      if (next.action === 'unknown') {
        console.error(readErr)
        setStatus('unknown')
        return
      }
      markHandled()

      if (next.action === 'duplicate') {
        // Ignore a repeat tap within 60 s to prevent accidental double-toggle
        setEventType(next.duplicate.type)
        setEventTime(new Date(next.duplicate.at))
        setStatus('duplicate')
      } else if (next.action === 'check_out') {
        // A fresh tap with a session open. Before 0014: automatic, as before.
        await openSession(next, true)
      } else if (next.action === 'confirm_check_out') {
        // This page was shown again (reload, back-swipe, restored tab): show the
        // open session and let the member choose. Never written on its own.
        await openSession(next, false)
      } else {
        // Check-in: don't call geolocation on load (iOS treats it as
        // low-priority and it often never resolves). Wait for a tap.
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

  // Act on the arrival once, and only when the page is actually in front of the
  // member (not while hidden or prerendered). The ref keeps StrictMode's double
  // effect in dev from acting twice.
  useEffect(() => {
    if (started.current) return
    const cancel = whenForeground(document, () => {
      started.current = true
      arrive()
    })
    return cancel
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // A tab left on a resting screen and brought back after more than a minute
  // (or restored from the back/forward cache) re-reads and shows the current
  // status. It never writes: the member taps if they mean to.
  useEffect(() => {
    const resting = RESTING.has(status) && !acting
    // What a receipt screen shows, so the re-read can leave it up when it still holds.
    const receipt = status === 'success' || status === 'duplicate' ? eventType : status === 'pending' ? 'pending' : null
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
        : { heading: 'System fault', detail: `Could not record your attendance${fault ? ` (${fault})` : ''}. Try again. If it happens again, show this screen to a mentor.` }
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
          // Re-reads first. After a failed write the entry is already marked,
          // so this shows the current status with an explicit button rather
          // than writing again on its own.
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
        <p className="checkin-status">Tap to confirm your check-in</p>
        <p className="checkin-loc">{loc.replace(/-/g, ' ')}</p>
        <button
          onClick={confirmCheckin}
          disabled={acting}
          style={{ ...CONFIRM_BTN_STYLE, opacity: acting ? 0.6 : 1 }}
        >
          {acting ? 'Checking…' : 'Confirm check-in'}
        </button>
        <footer className="checkin-footer">STATUS // CONFIRM TO CHECK IN</footer>
      </div>
    )
  }

  const locDisplay = loc.replace(/-/g, ' ')

  if (status === 'confirm-out') {
    return (
      <div className="checkin-wrap checkin-idle">
        <CheckinHeader tag="CHECK-OUT" />
        <h1 className="checkin-name">{memberName}</h1>
        <p className="checkin-status">Checked in since {fmtClockLA(since)}</p>
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

  if (status === 'signout') {
    return (
      <div className="checkin-wrap checkin-idle checkin-signout">
        <CheckinHeader tag="SIGN-OUT" />
        <h1 className="checkin-name">{memberName}</h1>
        {since && <p className="checkin-status">Signed in since {fmtClockLA(since)}</p>}
        <SignoutForm
          onSubmit={submitSignout} busy={acting} error={soError} returnedReason={returned}
          submitLabel={staffSelf ? 'Sign out' : 'Ask to sign out'}
          hint={staffSelf ? null : 'Your hours stop when a mentor approves. Wait for it before you leave.'}
        />
        <Link to="/dashboard" className="checkin-home-link">VIEW STATUS →</Link>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="checkin-wrap checkin-duplicate checkin-pending">
        <CheckinHeader tag="WAITING" />
        <div className="checkin-panel checkin-panel-amber">
          <h1 className="checkin-name">{memberName}</h1>
          <p className="checkin-status" role="status">WAITING FOR APPROVAL</p>
          <p className="checkin-loc">Show a mentor your area. Your hours stop when they approve.</p>
          {pending?.note && <p className="checkin-note">“{pending.note}”</p>}
        </div>
        <button onClick={checkPending} style={CONFIRM_BTN_STYLE}>Check again</button>
        <button onClick={withdraw} disabled={acting} className="checkin-secondary">
          {acting ? '…' : 'Withdraw, I am staying'}
        </button>
        {soError && <p className="checkin-status" role="status">{soError}</p>}
        <footer className="checkin-footer checkin-footer-amber" aria-hidden="true">STATUS // PENDING APPROVAL</footer>
      </div>
    )
  }

  if (status === 'meeting') {
    const late = meeting?.status === 'late'
    return (
      <div className={`checkin-wrap ${late ? 'checkin-duplicate' : 'checkin-checkout'}`}>
        <CheckinHeader tag="MEETING" />
        <div className="checkin-mark" aria-hidden="true">{late ? '!' : '✓'}</div>
        <h1 className="checkin-name">{memberName}</h1>
        <p className="checkin-status" role="status">{late ? 'LATE' : 'PRESENT'} · {fmtClockLA(meeting.at)}</p>
        <p className="checkin-loc">{meeting.title}. You stay signed in.</p>
        <button onClick={() => setStatus('signout')} className="checkin-secondary">Sign out instead</button>
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
      <CheckinHeader tag={isIn ? 'ON DECK' : 'CHECK-OUT'} dark={isIn} />
      <div className="checkin-mark" aria-hidden="true">✓</div>
      <h1 className="checkin-name">{memberName}</h1>
      <p className="checkin-status" role="alert">CHECKED {verb} · {timeStr}</p>
      <p className="checkin-loc">{locDisplay}</p>
      {isIn && meeting && (
        <p className="checkin-meeting">{meeting.status === 'late' ? 'LATE' : 'PRESENT'} · {meeting.title}</p>
      )}
      {isIn && watchOnly && <p className="checkin-meeting" data-watch-only>WATCH ONLY · no shop tools until your checklist is done</p>}
      {isIn && tasks && tasks.length > 0 && (
        <div className="checkin-tasks">
          <p className="checkin-meeting">PICK A TASK</p>
          {tasks.map((t) => <button key={t.id} className="checkin-task" onClick={() => pickTask(t)}>{t.title}</button>)}
          {taskMsg && <p className="checkin-meeting">{taskMsg}</p>}
        </div>
      )}
      <footer className="checkin-footer" aria-hidden="true">STATUS // {isIn ? 'ON DECK' : 'CLEAR'}</footer>
      <Link to="/dashboard" className="checkin-home-link">VIEW STATUS →</Link>
    </div>
  )
}
