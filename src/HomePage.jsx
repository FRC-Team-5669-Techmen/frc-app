import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { computeHoursMs, fmtDuration } from './hoursUtils'
import { useGlance } from './useGlance'
import { fmtTime, fmtDay } from './shopStatus'
import { startOfTodayISO, fmtClock } from './presence'
import './HomePage.css'

function fmtClock12(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── Role-aware tile metrics ────────────────────────────────────────────────
// One effect, branched on isStaff. Every query / RPC is one already used by an
// existing page (jobs, skills, study_summary, readiness_summary, the NavBar
// pending counts, coverage); nothing new is introduced here.
function useTileMetrics(uid, isStaff) {
  const [m, setM] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      // Shared: active roster size for "Team pulse".
      const totalP = supabase.from('profiles')
        .select('id', { count: 'exact', head: true }).eq('status', 'active')

      if (isStaff) {
        const [access, plinks, certs, total, readiness, skills, memberSkills, activeProfiles, feed] = await Promise.all([
          supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('parent_link_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('cert_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          totalP,
          supabase.rpc('readiness_summary'),
          supabase.from('skills').select('id'),
          supabase.from('member_skills').select('member_id, skill_id, status').eq('status', 'certified'),
          supabase.from('profiles').select('id').eq('status', 'active'),
          supabase.from('attendance_events')
            .select('id, user_id, type, event_time, profiles!attendance_events_user_fkey(full_name, subteams)')
            .order('event_time', { ascending: false }).limit(6),
        ])
        if (!active) return

        // Coverage gap = catalog skills with zero certified ACTIVE members.
        const activeIds = new Set((activeProfiles.data ?? []).map(p => p.id))
        const certBySkill = {}
        for (const r of memberSkills.data ?? []) {
          if (activeIds.has(r.member_id)) (certBySkill[r.skill_id] ??= new Set()).add(r.member_id)
        }
        const gap = (skills.data ?? []).filter(s => !(certBySkill[s.id]?.size)).length

        setM({
          pending: (access.count ?? 0) + (plinks.count ?? 0) + (certs.count ?? 0),
          flags: readiness.data?.action_queue?.total ?? 0,
          gap,
          total: total.count ?? 0,
          feed: feed.data ?? [],
        })
      } else {
        const [openJobs, myClaims, skills, memberSkills, study, total] = await Promise.all([
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('task_claims').select('status').eq('member_id', uid).in('status', ['claimed', 'submitted']),
          supabase.from('skills').select('id, name, sort_order').order('sort_order'),
          supabase.from('member_skills').select('skill_id, status').eq('member_id', uid),
          supabase.rpc('study_summary'),
          totalP,
        ])
        if (!active) return

        const cat = skills.data ?? []
        const mine = memberSkills.data ?? []
        const certified = mine.filter(r => r.status === 'certified').length
        const inProgIds = new Set(mine.filter(r => r.status === 'in_progress').map(r => r.skill_id))
        const doneIds = new Set(mine.filter(r => r.status === 'certified').map(r => r.skill_id))
        // Next cert: the first in-progress skill, else the first not-yet-touched one.
        const nextCert = cat.find(s => inProgIds.has(s.id)) || cat.find(s => !doneIds.has(s.id) && !inProgIds.has(s.id))

        setM({
          jobsOpen: openJobs.count ?? 0,
          jobsClaimed: (myClaims.data ?? []).length,
          certified,
          skillTotal: cat.length,
          nextCert: nextCert?.name ?? null,
          streak: study.data?.streak ?? 0,
          total: total.count ?? 0,
        })
      }
    }
    load()
    return () => { active = false }
  }, [uid, isStaff])

  return m
}

export default function HomePage({ session, hasRole = () => false }) {
  const uid = session.user.id
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [allEvents, setAllEvents] = useState(null)
  const [acting, setActing] = useState(false)
  const [myResp, setMyResp] = useState(undefined) // next event: 'going' | 'maybe' | 'declined' | null
  const [rsvping, setRsvping] = useState(false)

  const glance = useGlance()
  const metrics = useTileMetrics(uid, isStaff)

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_events')
      .select('id, type, event_time, location')
      .eq('user_id', uid)
      .order('event_time', { ascending: true })
    setAllEvents(data ?? [])
  }, [uid])

  useEffect(() => { fetchEvents() }, [fetchEvents])

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

  async function handleCheckOut() {
    if (acting) return
    setActing(true)
    await supabase.from('attendance_events').insert({
      user_id: uid, type: 'out', location: 'button', method: null,
    })
    await fetchEvents()
    setActing(false)
  }

  // RSVP write — same upsert shape as SchedulePage's upsertSignup.
  async function rsvp(response) {
    if (!nextId || rsvping) return
    setRsvping(true)
    const next = myResp === response ? null : response // tap again to clear
    if (next === null) {
      await supabase.from('event_signups').delete().match({ event_id: nextId, member_id: uid })
    } else {
      await supabase.from('event_signups').upsert(
        { event_id: nextId, member_id: uid, response: next, updated_at: new Date().toISOString() },
        { onConflict: 'event_id,member_id' },
      )
    }
    setMyResp(next)
    setRsvping(false)
  }

  if (allEvents === null) {
    return <div className="home-loading"><div className="home-spinner" /></div>
  }

  // ── YOU: same derivation as before ──
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayEvents = allEvents.filter(e => new Date(e.event_time) >= startOfToday)
  const lastToday = todayEvents.at(-1)
  const isIn = lastToday?.type === 'in'
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

          {/* ── Command strip ── */}
          <section className="mb-tile mb-you hud-brackets" data-tour="status-card">
            <span className="hud-bracket-b" aria-hidden="true" />
            <div className="mb-you-top">
              <span className="mb-tile-eyebrow">YOU</span>
              <span className={`mb-status ${isIn ? 'mb-status-in' : 'mb-status-out'}`}>
                {isIn ? 'Checked in' : 'Not checked in'}
              </span>
            </div>
            {isIn && lastToday && (
              <p className="mb-you-since hud-mono">since {fmtClock12(lastToday.event_time)}</p>
            )}
            <div className="mb-you-stats" data-tour="today-activity">
              <div className="mb-stat">
                <span className="mb-stat-value hud-tnum">{todayHours || '0m'}</span>
                <span className="mb-stat-label">Today</span>
              </div>
              <div className="mb-stat-divider" />
              <div className="mb-stat">
                <span className="mb-stat-value hud-tnum">{seasonHours || '0m'}</span>
                <span className="mb-stat-label">Season</span>
              </div>
            </div>
            {isIn ? (
              <button className="mb-checkout" data-tour="checkout" onClick={handleCheckOut} disabled={acting}>
                {acting ? '…' : 'Check Out'}
              </button>
            ) : (
              <p className="mb-nfc-hint hud-mono">Tap your NFC tag to check in</p>
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
            : <StudentTiles m={metrics} present={present} />}

        </div>
      </div>
    </div>
  )
}

// ── Student tiles ──
function StudentTiles({ m, present }) {
  const certPct = m && m.skillTotal ? Math.round((m.certified / m.skillTotal) * 100) : 0
  return (
    <>
      <Link to="/jobs" className="mb-tile mb-link-tile mb-role-student">
        <span className="mb-tile-eyebrow">My Jobs</span>
        <span className="mb-tile-big hud-tnum">{m ? m.jobsClaimed : '—'}</span>
        <span className="mb-tile-foot hud-mono">claimed · <span className="hud-tnum">{m ? m.jobsOpen : '—'}</span> open</span>
      </Link>

      <Link to="/skills" className="mb-tile mb-link-tile mb-role-student">
        <span className="mb-tile-eyebrow">Skills</span>
        <span className="mb-tile-big hud-tnum">{m ? `${m.certified}/${m.skillTotal}` : '—'}</span>
        <div className="mb-bar-track"><div className="mb-bar-fill" style={{ width: `${certPct}%` }} /></div>
        <span className="mb-tile-foot hud-mono">{m?.nextCert ? `Next: ${m.nextCert}` : 'All certified ✓'}</span>
      </Link>

      <Link to="/study" className="mb-tile mb-link-tile mb-role-student">
        <span className="mb-tile-eyebrow">Study</span>
        <span className="mb-tile-big hud-tnum">{m ? m.streak : '—'}</span>
        <span className="mb-tile-foot hud-mono">day streak</span>
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
  const gap = m?.gap ?? 0
  return (
    <>
      <Link to="/access-requests" className={`mb-tile mb-link-tile${pending > 0 ? ' mb-alert' : ''}`}>
        <span className="mb-tile-eyebrow">Pending</span>
        <span className={`mb-tile-big hud-tnum${pending > 0 ? ' mb-fault' : ''}`}>{m ? pending : '—'}</span>
        <span className="mb-tile-foot hud-mono">{pending > 0 ? 'waiting on you' : 'all clear'}</span>
      </Link>

      <Link to="/readiness" className={`mb-tile mb-link-tile${flags > 0 ? ' mb-alert' : ''}`}>
        <span className="mb-tile-eyebrow">Readiness</span>
        <span className={`mb-tile-big hud-tnum${flags > 0 ? ' mb-fault' : ''}`}>{m ? flags : '—'}</span>
        <span className="mb-tile-foot hud-mono">{flags > 0 ? 'items waiting' : 'all clear'}</span>
      </Link>

      <Link to="/coverage" className={`mb-tile mb-link-tile${gap > 0 ? ' mb-alert' : ''}`}>
        <span className="mb-tile-eyebrow">Coverage</span>
        <span className={`mb-tile-big hud-tnum${gap > 0 ? ' mb-fault' : ''}`}>{m ? gap : '—'}</span>
        <span className="mb-tile-foot hud-mono">{gap === 1 ? 'skill gap' : 'skill gaps'}</span>
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
                <span className="mb-feed-name">{e.profiles?.full_name || '—'}</span>
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
