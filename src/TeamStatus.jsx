import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { computePresence, startOfTodayISO, fmtClock, groupBySubteam, subteamOf } from './presence'
import './TeamStatus.css'

// Live team summary at the top of HomePage. Reuses presence.js (same
// attendance_events source + derivation as PresenceBoard) and the board's
// polling pattern. Read-only; adds no tables and no new data logic.

const POLL_MS = 15_000
const FEED_LIMIT = 15

export default function TeamStatus() {
  const [members, setMembers] = useState(null) // active roster
  const [present, setPresent] = useState(new Map())
  const [feed, setFeed] = useState([])
  const timer = useRef(null)

  const load = useCallback(async () => {
    const [{ data: profs }, { data: today }, { data: recent }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, subteams, status').eq('status', 'active'),
      supabase.from('attendance_events').select('user_id, type, event_time').gte('event_time', startOfTodayISO()),
      // Same attendance_events table as presence.js. The embedded profile is
      // disambiguated to the user_id FK (the table also has an overridden_by FK).
      supabase.from('attendance_events')
        .select('id, user_id, type, event_time, profiles!attendance_events_user_fkey(full_name, subteams)')
        .order('event_time', { ascending: false })
        .limit(FEED_LIMIT),
    ])
    if (profs) setMembers(profs)
    setPresent(computePresence(today ?? []))
    setFeed(recent ?? [])
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(load, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  if (members === null) return null // personal status renders immediately below

  const total = members.length
  const presentMembers = members.filter(m => present.has(m.id))
  const presentCount = presentMembers.length
  const groups = groupBySubteam(presentMembers) // present-only summary

  return (
    <section className="ts" aria-label="Team status">
      <header className="ts-head">
        <span className="ts-eyebrow">TEAM STATUS</span>
        <span className="ts-count hud-tnum">
          <span className="ts-count-label">PRESENT</span>
          <span className="ts-count-now">{presentCount}</span>
          <span className="ts-count-sep">/</span>
          <span className="ts-count-total">{total}</span>
        </span>
      </header>

      {presentCount === 0 ? (
        <p className="ts-empty">No one is checked in right now.</p>
      ) : (
        <div className="ts-groups">
          {groups.map(([name, list]) => (
            <div key={name} className="ts-group">
              <h3 className="ts-group-title">{name}</h3>
              <ul className="ts-list">
                {[...list]
                  .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
                  .map(m => (
                    <li key={m.id} className="ts-row">
                      <span className="ts-check" aria-hidden="true">✓</span>
                      <span className="ts-name">{m.full_name || '—'}</span>
                      <span className="ts-meta hud-tnum">{subteamOf(m)} · {fmtClock(present.get(m.id))}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <h3 className="ts-feed-title">RECENT ACTIVITY</h3>
      {feed.length === 0 ? (
        <p className="ts-empty">No activity yet today.</p>
      ) : (
        <ul className="ts-feed">
          {feed.map(e => {
            const isIn = e.type === 'in'
            return (
              <li key={e.id} className={`ts-frow ${isIn ? 'ts-in' : 'ts-out'}`}>
                <span className="ts-fdir hud-tnum">{isIn ? 'IN' : 'OUT'}</span>
                <span className="ts-fname">{e.profiles?.full_name || '—'}</span>
                <span className="ts-fsub">{subteamOf(e.profiles)}</span>
                <span className="ts-ftime hud-tnum">{fmtClock(e.event_time)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
