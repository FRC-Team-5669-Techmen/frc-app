import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { computePresence, startOfTodayISO } from './presence'
import { computeShopStatus, SHOP_OPEN_KINDS } from './shopStatus'

// Shared "what's up" derivation: shop open/closed (from today's build windows),
// a live present-count override (presence.js), and the next event. Lifted out of
// GlanceCard so HomePage's Shop + Next Up tiles and the ParentHomePage glance card
// run the exact same query + derivation in one place.
// NOTE: deliberately NOT imported by the /checkin fast path.

const POLL_MS = 15_000

function startOfTomorrowISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

// Returns { shop, present, next, moreToday } | null (while loading). Polls every
// 15s and refreshes on tab focus, matching the board's pattern.
export function useGlance() {
  const [g, setG] = useState(null)
  const timer = useRef(null)

  const load = useCallback(async () => {
    const todayISO = startOfTodayISO()
    const tomorrowISO = startOfTomorrowISO()
    const nowISO = new Date().toISOString()

    const [{ data: events }, { data: todayEvents }] = await Promise.all([
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

  return g
}

export { startOfTomorrowISO }
