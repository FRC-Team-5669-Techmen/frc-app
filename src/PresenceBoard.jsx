import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { computePresence, startOfTodayISO, fmtClock, groupBySubteam } from './presence'
import './PresenceBoard.css'

// Read-only wall-display board of who is currently present, derived from the
// existing attendance_events + profiles data (no new tables). Behind auth.
// Live updates via polling — realtime is not wired in this project.

const POLL_MS = 15_000

export default function PresenceBoard() {
  const [members, setMembers] = useState(null)   // active roster
  const [present, setPresent] = useState(new Map()) // user_id -> sinceISO
  const [error, setError] = useState('')
  const timer = useRef(null)

  const load = useCallback(async () => {
    // Active roster + today's attendance, both readable by any authenticated member.
    const [{ data: profs, error: pErr }, { data: events, error: eErr }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, subteams, status').eq('status', 'active'),
      supabase.from('attendance_events').select('user_id, type, event_time').gte('event_time', startOfTodayISO()),
    ])
    if (pErr || eErr) { setError((pErr || eErr).message); return }
    setError('')
    setMembers(profs ?? [])
    setPresent(computePresence(events ?? []))
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(load, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  if (members === null) {
    return (
      <div className="pb-wrap pb-loading">
        <div className="pb-spinner" />
      </div>
    )
  }

  const total = members.length
  const presentCount = members.filter(m => present.has(m.id)).length

  // Group by primary subteam (shared with HomePage Team Status); crossover
  // members show under their primary subteam so present/total counts stay exact.
  const groups = groupBySubteam(members)

  const sortMembers = (list) => [...list].sort((a, b) => {
    const ap = present.has(a.id), bp = present.has(b.id)
    if (ap !== bp) return ap ? -1 : 1                 // present first
    return (a.full_name || '').localeCompare(b.full_name || '')
  })

  return (
    <div className="pb-wrap">
      <header className="pb-header">
        <span className="pb-mark">TECHMEN<span className="pb-dot">·</span>5669</span>
        <span className="pb-tag">DISPLAY</span>
        <span className="pb-count hud-tnum">
          <span className="pb-count-label">PRESENT</span>
          <span className="pb-count-now">{presentCount}</span>
          <span className="pb-count-sep">/</span>
          <span className="pb-count-total">{total}</span>
        </span>
      </header>

      {error && <p className="pb-error">{error}</p>}

      <div className="pb-groups">
        {groups.map(([name, list]) => (
          <section key={name} className="pb-group">
            <h2 className="pb-group-title">{name}</h2>
            <ul className="pb-list">
              {sortMembers(list).map(m => {
                const since = present.get(m.id)
                const isPresent = !!since
                const sub = (m.subteams && m.subteams.length) ? m.subteams[0] : '—'
                return (
                  <li key={m.id} className={`pb-row${isPresent ? ' pb-present' : ' pb-absent'}`}>
                    <span className="pb-icon" aria-hidden="true">{isPresent ? '✓' : '○'}</span>
                    <span className="pb-name">{m.full_name || '—'}</span>
                    <span className="pb-meta hud-tnum">{sub} · {isPresent ? fmtClock(since) : '--'}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <footer className="pb-footer">STATUS // LIVE · POLL {POLL_MS / 1000}s</footer>
    </div>
  )
}
