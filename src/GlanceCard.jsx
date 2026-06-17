import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { computePresence, startOfTodayISO } from './presence'
import { computeShopStatus, fmtTime, fmtDay, SHOP_OPEN_KINDS } from './shopStatus'
import './GlanceCard.css'

// One-look "what's up" card: shop open/closed (from today's build windows),
// a live present-count override (presence.js), and the next event. Shared by
// HomePage and ParentHomePage so the derivation lives in exactly one place.
// NOTE: deliberately NOT imported by the /checkin fast path.

const POLL_MS = 15_000

function startOfTomorrowISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

export default function GlanceCard({ flush = false }) {
  const [g, setG] = useState(null)
  const timer = useRef(null)

  const load = useCallback(async () => {
    const todayISO = startOfTodayISO()
    const tomorrowISO = startOfTomorrowISO()
    const nowISO = new Date().toISOString()

    const [{ data: events }, { data: todayEvents }] = await Promise.all([
      // Anything still relevant: ongoing or upcoming.
      supabase.from('events').select('id, title, kind, starts_at, ends_at, location')
        .gte('ends_at', todayISO).order('starts_at', { ascending: true }).limit(50),
      supabase.from('attendance_events').select('user_id, type, event_time').gte('event_time', todayISO),
    ])

    const all = events ?? []
    const now = new Date()
    const todays = all.filter(e => e.starts_at >= todayISO && e.starts_at < tomorrowISO)
    const todayBuild = todays.filter(e => SHOP_OPEN_KINDS.includes(e.kind))
    const upcoming = all.filter(e => e.ends_at >= nowISO)

    setG({
      shop: computeShopStatus(todayBuild, now),
      present: computePresence(todayEvents ?? []).size,
      next: upcoming[0] ?? null,
      moreToday: todays.filter(e => e.ends_at >= nowISO).length - 1,
    })
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(load, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  if (!g) return null

  const { shop, present, next, moreToday } = g
  const nextIsToday = next && next.starts_at >= startOfTodayISO() && next.starts_at < startOfTomorrowISO()

  return (
    <section className={`glance${flush ? ' glance-flush' : ''}`}>
      <div className="glance-shop">
        <span className={`glance-dot glance-${shop.state}`} aria-hidden="true" />
        <span className="glance-shop-head">{shop.headline}</span>
        <span className="glance-shop-detail hud-mono">{shop.detail}</span>
        {present > 0 && (
          <span className="glance-present hud-mono">
            <span className="hud-tnum">{present}</span> checked in
          </span>
        )}
      </div>

      <Link to="/schedule" className="glance-next">
        {next ? (
          <>
            <span className="glance-next-when hud-mono">
              {nextIsToday ? 'TODAY' : fmtDay(next.starts_at).toUpperCase()} · {fmtTime(next.starts_at)}
            </span>
            <span className="glance-next-title">{next.title}</span>
            {moreToday > 0 && <span className="glance-next-more hud-mono">+{moreToday} more today</span>}
          </>
        ) : (
          <span className="glance-next-none hud-mono">No upcoming events</span>
        )}
        <span className="glance-arrow" aria-hidden="true">→</span>
      </Link>
    </section>
  )
}
