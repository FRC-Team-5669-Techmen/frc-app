import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { computeHoursMs, fmtDuration } from './hoursUtils'
import { computePresence, startOfTodayISO, fmtClock, subteamOf } from './presence'
import './ParentHomePage.css'

// Parent dashboard. Renders at /dashboard only for (hasRole('parent') && !isStaff).
// Shows each linked student's live status + hours + recent certs, plus a
// read-only team glance. Reuses the existing tables, the shared hours math, and
// presence.js — no new derivation, no staff controls. Live via 15s polling.

const POLL_MS = 15_000

export default function ParentHomePage({ session }) {
  const parentId = session.user.id
  const [data, setData] = useState(null) // { students:[], present:Map, team:{present,total,names} }
  const timer = useRef(null)

  const load = useCallback(async () => {
    // Who am I linked to?
    const { data: links } = await supabase
      .from('guardian_links')
      .select('student_id')
      .eq('parent_id', parentId)
    const studentIds = (links ?? []).map(l => l.student_id)

    // Team glance + present derivation need today's events for everyone, and the
    // active roster. These read fine for any authenticated member.
    const todayISO = startOfTodayISO()
    const [{ data: todayEvents }, { data: active }] = await Promise.all([
      supabase.from('attendance_events').select('user_id, type, event_time').gte('event_time', todayISO),
      supabase.from('profiles').select('id, full_name').eq('status', 'active'),
    ])
    const present = computePresence(todayEvents ?? [])
    const activeRoster = active ?? []
    const team = {
      total: activeRoster.length,
      names: activeRoster.filter(m => present.has(m.id)).map(m => m.full_name || '—').sort(),
    }
    team.present = team.names.length

    if (studentIds.length === 0) {
      setData({ students: [], present, team })
      return
    }

    // Per-student detail.
    const [{ data: profs }, { data: allEvents }, { data: certs }, { data: logged }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, subteams, avatar_url').in('id', studentIds),
      supabase.from('attendance_events').select('id, user_id, type, event_time').in('user_id', studentIds),
      supabase.from('member_skills').select('member_id, skill_id, updated_at, skills(name)').eq('status', 'certified').in('member_id', studentIds),
      supabase.from('logged_hours').select('member_id, hours, type').eq('status', 'verified').in('member_id', studentIds),
    ])

    const eventsByStudent = {}
    for (const e of allEvents ?? []) (eventsByStudent[e.user_id] ??= []).push(e)
    const loggedByStudent = {}
    for (const l of logged ?? []) loggedByStudent[l.member_id] = (loggedByStudent[l.member_id] ?? 0) + parseFloat(l.hours)

    const students = (profs ?? []).map(p => {
      const evs = eventsByStudent[p.id] ?? []
      const todayEvs = evs.filter(e => e.event_time >= todayISO)
      const certNames = [...new Set((certs ?? [])
        .filter(c => c.member_id === p.id)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .map(c => c.skills?.name)
        .filter(Boolean))]
      return {
        id: p.id,
        name: p.full_name || '—',
        subteam: subteamOf(p),
        avatar: p.avatar_url,
        since: present.get(p.id) || null,
        todayHours: fmtDuration(computeHoursMs(todayEvs)),
        seasonHours: fmtDuration(computeHoursMs(evs)),
        loggedHours: loggedByStudent[p.id] ?? 0,
        certs: certNames.slice(0, 6),
      }
    }).sort((a, b) => a.name.localeCompare(b.name))

    setData({ students, present, team })
  }, [parentId])

  useEffect(() => {
    load()
    timer.current = setInterval(load, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  if (data === null) {
    return <div className="ph-wrap ph-loading"><div className="ph-spinner" /></div>
  }

  const { students, team } = data

  return (
    <div className="ph-wrap">
      <div className="ph-body">
        <header className="ph-head">
          <span className="ph-eyebrow">FAMILY VIEW</span>
          <h1 className="ph-title">Your students</h1>
        </header>

        {students.length === 0 ? (
          <div className="ph-empty">
            <p className="ph-empty-h">No students linked to your account yet.</p>
            <p className="ph-empty-sub">Ask a mentor to link you to your student.</p>
          </div>
        ) : (
          <div className="ph-students">
            {students.map(s => {
              const isIn = !!s.since
              return (
                <section key={s.id} className="ph-card">
                  <div className="ph-card-top">
                    {s.avatar
                      ? <img className="ph-avatar" src={s.avatar} alt="" />
                      : <div className="ph-avatar ph-avatar-init">{(s.name[0] || '?').toUpperCase()}</div>}
                    <div className="ph-id">
                      <span className="ph-name">{s.name}</span>
                      <span className="ph-sub hud-mono">{s.subteam}</span>
                    </div>
                    <span className={`ph-badge${isIn ? ' ph-in' : ' ph-out'}`}>
                      {isIn ? `IN · ${fmtClock(s.since)}` : 'NOT IN'}
                    </span>
                  </div>

                  <div className="ph-stats">
                    <div className="ph-stat">
                      <span className="ph-stat-val hud-tnum">{s.todayHours}</span>
                      <span className="ph-stat-label">Today</span>
                    </div>
                    <div className="ph-stat-divider" />
                    <div className="ph-stat">
                      <span className="ph-stat-val hud-tnum">{s.seasonHours}</span>
                      <span className="ph-stat-label">Season</span>
                    </div>
                    <div className="ph-stat-divider" />
                    <div className="ph-stat">
                      <span className="ph-stat-val hud-tnum">{s.loggedHours ? `${Math.round(s.loggedHours * 10) / 10}h` : '—'}</span>
                      <span className="ph-stat-label">Logged</span>
                    </div>
                  </div>

                  <div className="ph-certs">
                    <span className="ph-certs-label">Certifications</span>
                    {s.certs.length === 0
                      ? <span className="ph-certs-none">None yet</span>
                      : <div className="ph-cert-chips">
                          {s.certs.map(c => <span key={c} className="ph-cert-chip">{c}</span>)}
                        </div>}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {/* Read-only team glance */}
        <section className="ph-team">
          <header className="ph-team-head">
            <span className="ph-eyebrow">TEAM GLANCE</span>
            <span className="ph-team-count hud-tnum">
              <span className="ph-team-now">{team.present}</span>
              <span className="ph-team-sep">/</span>
              <span className="ph-team-total">{team.total}</span>
              <span className="ph-team-word">present</span>
            </span>
          </header>
          {team.present === 0
            ? <p className="ph-team-empty">No one is checked in right now.</p>
            : <p className="ph-team-names hud-mono">{team.names.join(' · ')}</p>}
          <Link to="/hours" className="ph-team-link">View Team Hours →</Link>
        </section>
      </div>
    </div>
  )
}
