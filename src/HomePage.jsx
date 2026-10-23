import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { computeHoursMs, fmtDuration } from './hoursUtils'
import { useGlance } from './useGlance'
import { fmtTime, fmtDay } from './shopStatus'
import { startOfTodayISO, fmtClock } from './presence'
import { displayName } from './names'
import { currentStatus } from './attendanceState'
import { checkOutFromDashboard, dashboardCheckoutRow } from './attendanceCheckout'
import { loadMySignout, requestSignout, withdrawSignout, insertOutWithNote } from './signout'
import SignoutForm from './SignoutForm'
import { normEmail, isHeld, syncSummary } from './ideaCerts'
import { storageKey, cleanProgress, passedCount } from './handbook/sign'
import { LESSONS } from './handbook/lessons'
import { doThisNow } from './doThisNow'
import { loadAdminCounts, totalWaiting } from './adminTools'
import { resolveOpenSurvey } from './surveys'
import { isSchemaMissing } from './schemaMissing'
import './HomePage.css'
import './Hub.css'

const SO_POLL_MS = 20_000

function fmtClock12(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
}

// ── Role-aware tile metrics ────────────────────────────────────────────────
// One effect, branched on isStaff. Every query / RPC is one already used by an
// existing page (jobs, readiness_summary, the NavBar pending counts, the IDEA
// certifications mirror); nothing new is introduced here. The old skills tile,
// coverage tile and study tile went with the old skills system (decision 27).
function useTileMetrics(uid, isStaff, email, isAdmin = false) {
  const [m, setM] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      // Shared: active roster size for "Team pulse". Approved members only: a
      // signed-in account never let onto the team is not a member (audit item 2).
      const totalP = supabase.from('profiles')
        .select('id', { count: 'exact', head: true }).eq('status', 'active').eq('approved', true)

      if (isStaff) {
        const [access, plinks, total, readiness, catalog, syncLog, feed] = await Promise.all([
          supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('parent_link_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          totalP,
          supabase.rpc('readiness_summary'),
          supabase.from('idea_cert_catalog').select('code', { count: 'exact', head: true }),
          supabase.from('idea_cert_sync_log').select('received_at, ok')
            .order('received_at', { ascending: false }).limit(10),
          supabase.from('attendance_events')
            .select('id, user_id, type, event_time, profiles!attendance_events_user_fkey(full_name, nickname, subteams)')
            .order('event_time', { ascending: false }).limit(6),
        ])
        if (!active) return
        const admin = await loadAdminCounts(supabase, { isAdmin }).catch(() => null)
        if (!active) return

        // IDEA mirror: how many certifications it holds and when it last
        // accepted a sync. A missing mirror (0001 not applied) reads as null.
        const sync = syncSummary(syncLog.error ? [] : (syncLog.data ?? []))

        setM({
          pending: (access.count ?? 0) + (plinks.count ?? 0),
          waiting: admin ? totalWaiting(admin, { isAdmin }) : null,
          flags: readiness.data?.action_queue?.total ?? 0,
          certCatalog: catalog.error ? null : (catalog.count ?? 0),
          certLastSync: sync.lastOk?.received_at ?? null,
          certFailing: sync.failing,
          total: total.count ?? 0,
          feed: feed.data ?? [],
        })
      } else {
        const me = normEmail(email)
        const [openJobs, myClaims, mine, total] = await Promise.all([
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('task_claims').select('status').eq('member_id', uid).in('status', ['claimed', 'submitted']),
          // The member's OWN IDEA rows, by sign-in email (decision 33).
          me
            ? supabase.from('idea_cert_holders').select('code, status, expires_at').eq('email', me)
            : Promise.resolve({ data: [], error: null }),
          totalP,
        ])
        if (!active) return

        // Held = active and unexpired (src/ideaCerts.js), counted once per code.
        const now = Date.now()
        const held = mine.error ? null : new Set((mine.data ?? []).filter(h => isHeld(h, now)).map(h => h.code)).size

        setM({
          jobsOpen: openJobs.count ?? 0,
          jobsClaimed: (myClaims.data ?? []).length,
          certsHeld: held,
          total: total.count ?? 0,
        })
      }
    }
    load()
    return () => { active = false }
  }, [uid, isStaff, email, isAdmin])

  return m
}

export default function HomePage({ session, hasRole = () => false }) {
  const uid = session.user.id
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [allEvents, setAllEvents] = useState(null)
  const [readFailed, setReadFailed] = useState(false) // last status read errored
  const [acting, setActing] = useState(false)
  const [checkoutErr, setCheckoutErr] = useState(null)
  // Sign-out requests (0014): null until read, { legacy } before 0014.
  const [so, setSo] = useState(null)
  const [soForm, setSoForm] = useState(false)
  const [myResp, setMyResp] = useState(undefined) // next event: 'going' | 'maybe' | 'declined' | null
  const [rsvping, setRsvping] = useState(false)

  const glance = useGlance()
  const [dtnSrc, reloadDtn] = useDoThisNow(uid, isStaff)
  const metrics = useTileMetrics(uid, isStaff, session?.user?.email, hasRole('admin'))

  // Newest first: past the API's row cap an ascending read drops TODAY's rows,
  // the ones the status depends on. A failed read keeps whatever was shown
  // before and says so, rather than reading as "not checked in".
  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('attendance_events')
      .select('id, type, event_time, location, category')
      .eq('user_id', uid)
      .order('event_time', { ascending: false })
    if (error) {
      setReadFailed(true)
      setAllEvents(prev => prev ?? [])
      return
    }
    setReadFailed(false)
    setAllEvents(data ?? [])
  }, [uid])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const loadSo = useCallback(async () => {
    try { setSo(await loadMySignout(supabase, uid)) } catch { setSo(null) }
  }, [uid])
  useEffect(() => { loadSo() }, [loadSo, allEvents])

  // While a sign-out waits, look again every 20 s so an approval (the tile
  // flips to Not checked in) or a send-back (feedback 2b674b0c: the student
  // saw nothing) shows without a reload.
  const waiting = !!so?.pending
  useEffect(() => {
    if (!waiting) return undefined
    const t = setInterval(() => { fetchEvents(); loadSo() }, SO_POLL_MS)
    return () => clearInterval(t)
  }, [waiting, fetchEvents, loadSo])

  // A dashboard tab left open is otherwise frozen at the moment it loaded: a
  // tag tap in another tab would not show here. Re-read when it comes back.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchEvents() }
    const onPageShow = (e) => { if (e.persisted) fetchEvents() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [fetchEvents])

  // My RSVP on the next event (so Going/Maybe reflect current state).
  const nextId = glance?.next?.id
  useEffect(() => {
    if (!nextId) { setMyResp(undefined); return }
    let active = true
    supabase.from('event_signups').select('response')
      .match({ event_id: nextId, member_id: uid }).maybeSingle()
      .then(({ data }) => { if (active) setMyResp(data?.response ?? null) })
    return () => { active = false }
  }, [nextId, uid])

  // The insert's result is read now: a rejected or failed write says so on the
  // tile instead of leaving "Checked in" up with no explanation.
  async function handleCheckOut() {
    // After 0014 the button opens the note; before it, it checks out at once.
    if (so && !so.legacy) { setCheckoutErr(null); setSoForm(true); return }
    if (acting) return
    setActing(true)
    setCheckoutErr(null)
    const result = await checkOutFromDashboard(supabase, uid)
    if (!result.ok) setCheckoutErr(result.message)
    await fetchEvents()
    setActing(false)
  }

  // The note form's submit. Staff and FLL sessions close directly with the
  // note; everyone else asks, and the tile shows the request until approved.
  async function submitSignout({ note, cleanup }, direct) {
    if (acting) return
    setActing(true)
    setCheckoutErr(null)
    try {
      if (direct) {
        await insertOutWithNote(supabase, dashboardCheckoutRow(uid), { note, cleanup })
      } else {
        await requestSignout(supabase, { note, cleanup, location: 'button', source: 'button' })
      }
      setSoForm(false)
    } catch (err) {
      setCheckoutErr(`Not sent${err?.code ? ` (${err.code})` : ''}. Try again, or tap your tag.`)
    }
    await fetchEvents()
    await loadSo()
    setActing(false)
  }

  async function handleWithdraw() {
    if (acting) return
    setActing(true)
    try { await withdrawSignout(supabase) } catch { /* the reload shows what holds */ }
    await loadSo()
    setActing(false)
  }

  // RSVP write — same upsert shape as SchedulePage's upsertSignup.
  async function rsvp(response) {
    if (!nextId || rsvping) return
    setRsvping(true)
    const next = myResp === response ? null : response // tap again to clear
    const { error } = next === null
      ? await writeVia(supabase, 'event_clear_response', { p_event: nextId },
        { table: 'event_signups', op: 'delete', match: { event_id: nextId, member_id: uid } })
      : await writeVia(supabase, 'event_set_response', { p_event: nextId, p_response: next },
        { table: 'event_signups', op: 'upsert',
          values: { event_id: nextId, member_id: uid, response: next, updated_at: new Date().toISOString() },
          options: { onConflict: 'event_id,member_id' } })
    setRsvping(false)
    // Show the answer only once it saved: a failed write keeps the old one.
    if (error) return
    setMyResp(next)
  }

  if (allEvents === null) {
    return <div className="home-loading"><div className="home-spinner" /></div>
  }

  // ── YOU: the shared rule (attendanceState), the same one the tag reads ──
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayEvents = allEvents.filter(e => new Date(e.event_time) >= startOfToday)
  const status = currentStatus(allEvents)
  const isIn = status.checkedIn
  // The last request a mentor sent back during THIS session (none pending).
  const sentBack = isIn && !so?.pending && so?.returned && status.since
    && Date.parse(so.returned.decided_at) >= Date.parse(status.since) ? so.returned : null
  // Nothing was ever read: the status AND the hours are unknown, not zero.
  const statusUnknown = readFailed && allEvents.length === 0
  const todayHours = fmtDuration(computeHoursMs(todayEvents))
  const seasonHours = fmtDuration(computeHoursMs(allEvents))

  const shop = glance?.shop
  const next = glance?.next
  const present = glance?.present ?? 0
  const nextIsToday = next && next.starts_at >= startOfTodayISO()
    && new Date(next.starts_at) < new Date(startOfToday.getTime() + 86400000)

  return (
    <div className="home-wrap">
      <div className="home-body">
        <div className="mb-grid">

          {dtnSrc && <DoThisNow items={doThisNow({ ...dtnSrc, sentBack: sentBack ?? null })}
            onDone={async (id) => { await writeVia(supabase, 'mark_notice_read', { p_notice: id }); reloadDtn() }} />}

          {/* ── Command strip ── */}
          <section className="mb-tile mb-you hud-brackets" data-tour="status-card" id="status">
            <span className="hud-bracket-b" aria-hidden="true" />
            <div className="mb-you-top">
              <span className="mb-tile-eyebrow">YOU</span>
              <span className={`mb-status ${isIn ? 'mb-status-in' : 'mb-status-out'}`} role="status">
                {statusUnknown ? 'Status unavailable' : isIn ? 'Checked in' : 'Not checked in'}
              </span>
            </div>
            {isIn && status.since && (
              <p className="mb-you-since hud-mono">since {fmtClock12(status.since)}</p>
            )}
            <div className="mb-you-stats" data-tour="today-activity">
              <div className="mb-stat">
                <span className="mb-stat-value hud-tnum">{statusUnknown ? '—' : todayHours || '0m'}</span>
                <span className="mb-stat-label">Today</span>
              </div>
              <div className="mb-stat-divider" />
              <div className="mb-stat">
                <span className="mb-stat-value hud-tnum">{statusUnknown ? '—' : seasonHours || '0m'}</span>
                <span className="mb-stat-label">Season</span>
              </div>
            </div>
            {statusUnknown ? (
              <button className="mb-checkout mb-retry" onClick={fetchEvents}>Retry</button>
            ) : isIn && so?.pending ? (
              <div className="mb-so-pending" role="status">
                <p className="mb-so-wait hud-mono">Sign-out waiting for approval</p>
                <button className="mb-checkout mb-retry" onClick={handleWithdraw} disabled={acting}>Withdraw</button>
              </div>
            ) : isIn && sentBack && !soForm ? (
              <div className="mb-so-returned" role="alert" data-testid="so-sent-back">
                <p className="mb-so-back-title hud-mono">Sign-out sent back</p>
                <p className="mb-so-back-note">{sentBack.reason ? <>Mentor's note: <q>{sentBack.reason}</q></> : 'A mentor asked you to finish up first.'}</p>
                <p className="mb-so-back-next">Do what the note says, then ask again. Your hours are still counting.</p>
                <button className="mb-checkout" onClick={() => { setCheckoutErr(null); setSoForm(true) }} disabled={acting}>Ask again</button>
              </div>
            ) : isIn && soForm ? (
              <SignoutForm
                compact
                returnedReason={sentBack ? (sentBack.reason ?? '') : null}
                onSubmit={(v) => submitSignout(v, isStaff || status.last?.category === 'volunteer')}
                busy={acting}
                submitLabel={isStaff || status.last?.category === 'volunteer' ? 'Sign out' : 'Ask to sign out'}
                hint={isStaff || status.last?.category === 'volunteer' ? null : 'Your hours stop when a mentor approves.'}
                onCancel={() => setSoForm(false)}
              />
            ) : isIn ? (
              <button className="mb-checkout" data-tour="checkout" onClick={handleCheckOut} disabled={acting}>
                {acting ? '…' : 'Check Out'}
              </button>
            ) : (
              <p className="mb-nfc-hint hud-mono">Tap your NFC tag to check in</p>
            )}
            {checkoutErr && isIn && <p className="mb-you-error" role="alert">{checkoutErr}</p>}
            {readFailed && !statusUnknown && (
              <p className="mb-you-note hud-mono">Could not refresh your status. Showing the last one loaded.</p>
            )}
          </section>

          {/* Shop */}
          <Link to="/schedule" className="mb-tile mb-link-tile">
            <span className="mb-tile-eyebrow">Shop</span>
            {shop ? (
              <>
                <span className="mb-tile-headline">
                  <span className={`mb-dot mb-dot-${shop.state}`} aria-hidden="true" />
                  {shop.headline}
                </span>
                <span className="mb-tile-detail hud-mono">{shop.detail}</span>
                <span className="mb-tile-foot hud-mono">
                  {present > 0 ? <><span className="hud-tnum">{present}</span> checked in</> : 'No one in yet'}
                </span>
              </>
            ) : <span className="mb-tile-detail hud-mono">…</span>}
          </Link>

          {/* Next Up */}
          <section className="mb-tile mb-next">
            <span className="mb-tile-eyebrow">Next Up</span>
            {next ? (
              <>
                <Link to="/schedule" className="mb-next-body">
                  <span className="mb-tile-detail hud-mono">
                    {nextIsToday ? 'TODAY' : fmtDay(next.starts_at).toUpperCase()} · {fmtTime(next.starts_at)}
                  </span>
                  <span className="mb-tile-headline mb-next-title">{next.title}</span>
                </Link>
                <div className="mb-rsvp">
                  <button className={`mb-rsvp-btn${myResp === 'going' ? ' on' : ''}`}
                    onClick={() => rsvp('going')} disabled={rsvping || myResp === undefined}>Going</button>
                  <button className={`mb-rsvp-btn${myResp === 'maybe' ? ' on' : ''}`}
                    onClick={() => rsvp('maybe')} disabled={rsvping || myResp === undefined}>Maybe</button>
                </div>
              </>
            ) : (
              <span className="mb-tile-detail hud-mono mb-next-none">No upcoming events</span>
            )}
          </section>

          {/* ── Role-aware tile row ── */}
          {isStaff
            ? <StaffTiles m={metrics} present={present} />
            : <StudentTiles m={metrics} present={present} uid={uid} />}

        </div>
      </div>
    </div>
  )
}

// ── Do this now (ledger 0017) ──
// Built only from data the app already reads (src/doThisNow.js). Rendered
// only when something is open: an empty list renders nothing at all.
function useDoThisNow(uid, isStaff) {
  const [src, setSrc] = useState(null)
  const load = useCallback(async () => {
    const [extras, notices, surveys] = await Promise.all([
      isStaff ? Promise.resolve({ data: null }) : supabase.rpc('member_extras', { p_member: uid }),
      supabase.from('member_notices').select('id, kind, title, created_at, read_at').eq('member_id', uid).eq('kind', 'signup').is('read_at', null).order('created_at', { ascending: false }).limit(10),
      isStaff ? Promise.resolve({ data: [] }) : supabase.from('surveys').select('id, title, opens_at, closes_at, is_open').eq('is_open', true),
    ])
    let survey = null
    const open = !surveys.error ? resolveOpenSurvey(surveys.data ?? []) : null
    if (open) {
      const mine = await supabase.from('survey_responses').select('id').eq('survey_id', open.id).eq('member_id', uid).maybeSingle()
      if (!mine.error) survey = { title: open.title, answered: !!mine.data }
    }
    setSrc({
      onboarding: !extras.error && extras.data?.onboarding ? extras.data.onboarding : null,
      notices: notices.error && !isSchemaMissing(notices.error) ? [] : (notices.data ?? []),
      survey,
    })
  }, [uid, isStaff])
  useEffect(() => { load() }, [load])
  return [src, load]
}

function DoThisNow({ items, onDone }) {
  if (!items.length) return null
  return (
    <section className="dtn" aria-label="Do this now" data-testid="do-this-now">
      <div className="dtn-head"><h2 className="dtn-title">Do this now</h2><span className="dtn-count hud-tnum">{items.length}</span></div>
      <ul className="dtn-list">
        {items.map((it) => (
          <li key={it.key} className={`dtn-item${it.tone === 'urgent' ? ' dtn-urgent' : ''}`}>
            <Link to={it.to} className="dtn-link"><span className="dtn-what">{it.title}</span><span className="dtn-why">{it.detail}{it.due ? ` · due ${it.due}` : ''}</span></Link>
            {it.notice ? <button className="dtn-done" onClick={() => onDone(it.notice)}>Done</button> : <span className="dtn-go" aria-hidden="true">→</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Student tiles ──
// Handbook lessons passed on this device (the handbook page keeps them in
// localStorage; a private window simply reads 0).
function handbookPassed(uid) {
  try { return passedCount(cleanProgress(JSON.parse(localStorage.getItem(storageKey(uid)) || 'null'))) } catch { return 0 }
}

function StudentTiles({ m, present, uid }) {
  const hb = handbookPassed(uid)
  return (
    <>
      <Link to="/handbook" className="mb-tile mb-link-tile mb-role-student" data-testid="mb-handbook-tile">
        <span className="mb-tile-eyebrow">Handbook</span>
        <span className="mb-tile-big hud-tnum">{hb}<span className="mb-tile-big-sub">/{LESSONS.length}</span></span>
        <span className="mb-tile-foot hud-mono">{hb === LESSONS.length ? 'all checks passed →' : 'handbook checks passed →'}</span>
      </Link>

      <Link to="/jobs" className="mb-tile mb-link-tile mb-role-student">
        <span className="mb-tile-eyebrow">My Jobs</span>
        <span className="mb-tile-big hud-tnum">{m ? m.jobsClaimed : '—'}</span>
        <span className="mb-tile-foot hud-mono">claimed · <span className="hud-tnum">{m ? m.jobsOpen : '—'}</span> open</span>
      </Link>

      <Link to="/certifications" className="mb-tile mb-link-tile mb-role-student" data-testid="mb-certs-tile">
        <span className="mb-tile-eyebrow">Certifications</span>
        <span className="mb-tile-big hud-tnum">{m && m.certsHeld != null ? m.certsHeld : '—'}</span>
        <span className="mb-tile-foot hud-mono">IDEA certs held →</span>
      </Link>

      <Link to="/display" className="mb-tile mb-link-tile mb-role-student">
        <span className="mb-tile-eyebrow">Team pulse</span>
        <span className="mb-tile-big hud-tnum">{present}<span className="mb-tile-big-sub">/{m ? m.total : '—'}</span></span>
        <span className="mb-tile-foot hud-mono">present now →</span>
      </Link>
    </>
  )
}

// ── Staff tiles ──
function StaffTiles({ m, present }) {
  const pending = m?.pending ?? 0
  const flags = m?.flags ?? 0
  return (
    <>
      {/* Team admin (ledger 0017): the same total as the account menu badge. */}
      <Link to="/manage" className={`mb-tile mb-link-tile${(m?.waiting ?? pending) > 0 ? ' mb-alert' : ''}`} data-testid="mb-admin-tile">
        <span className="mb-tile-eyebrow">Team admin</span>
        <span className={`mb-tile-big hud-tnum${(m?.waiting ?? pending) > 0 ? ' mb-fault' : ''}`}>{m ? (m.waiting ?? pending) : '—'}</span>
        <span className="mb-tile-foot hud-mono">{(m?.waiting ?? pending) > 0 ? 'waiting on you →' : 'all clear →'}</span>
      </Link>

      <Link to="/readiness" className={`mb-tile mb-link-tile${flags > 0 ? ' mb-alert' : ''}`}>
        <span className="mb-tile-eyebrow">Readiness</span>
        <span className={`mb-tile-big hud-tnum${flags > 0 ? ' mb-fault' : ''}`}>{m ? flags : '—'}</span>
        <span className="mb-tile-foot hud-mono">{flags > 0 ? 'items waiting' : 'all clear'}</span>
      </Link>

      <Link to="/certifications" className={`mb-tile mb-link-tile${m?.certFailing ? ' mb-alert' : ''}`} data-testid="mb-certs-tile">
        <span className="mb-tile-eyebrow">Certifications</span>
        <span className="mb-tile-big hud-tnum">{m && m.certCatalog != null ? m.certCatalog : '—'}</span>
        <span className="mb-tile-foot hud-mono">
          {m?.certFailing ? 'last sync refused' : m?.certLastSync ? 'IDEA certs · synced' : 'IDEA · not synced yet'}
        </span>
      </Link>

      <Link to="/display" className="mb-tile mb-link-tile mb-pulse-tile">
        <div className="mb-pulse-head">
          <span className="mb-tile-eyebrow">Team pulse</span>
          <span className="mb-tile-big hud-tnum">{present}<span className="mb-tile-big-sub">/{m ? m.total : '—'}</span></span>
        </div>
        {m?.feed?.length ? (
          <ul className="mb-feed">
            {m.feed.slice(0, 4).map(e => (
              <li key={e.id} className={`mb-feed-row ${e.type === 'in' ? 'mb-feed-in' : 'mb-feed-out'}`}>
                <span className="mb-feed-icon" aria-hidden="true">{e.type === 'in' ? '↓' : '↑'}</span>
                <span className="mb-feed-name">{displayName(e.profiles)}</span>
                <span className="mb-feed-time hud-mono hud-tnum">{fmtClock(e.event_time)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="mb-tile-foot hud-mono">No activity yet today</span>
        )}
      </Link>
    </>
  )
}
