import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { fmtHours, buildBreakdown, computePendingMs, sumBreakdown, sessionsFromEvents, HOUR_TYPES } from './hoursUtils'
import './MyHoursPage.css'

const DAY_MS = 86_400_000
const fmtSessionDate = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtClock = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export default function MyHoursPage({ session }) {
  const [seasons,  setSeasons]  = useState(null)
  const [events,   setEvents]   = useState(null)
  const [logged,   setLogged]   = useState(null)
  const [reviews,  setReviews]  = useState(null)  // user's session_reviews rows

  useEffect(() => {
    const uid = session.user.id
    Promise.all([
      supabase.from('seasons').select('*').order('start_date', { ascending: false }),
      supabase.from('attendance_events').select('id, type, event_time').eq('user_id', uid).order('event_time'),
      supabase.from('logged_hours').select('type, hours, date').eq('member_id', uid).eq('status', 'verified'),
      supabase.from('session_reviews').select('checkout_id, status').eq('user_id', uid).in('status', ['pending', 'voided']),
    ]).then(([{ data: s }, { data: ae }, { data: lh }, { data: sr }]) => {
      setSeasons(s ?? [])
      setEvents(ae ?? [])
      setLogged(lh ?? [])
      setReviews(sr ?? [])
    })
  }, [session.user.id])

  // Checkout IDs excluded from official hours (pending or voided review)
  const excludedIds = useMemo(
    () => reviews ? new Set(reviews.map(r => r.checkout_id)) : null,
    [reviews]
  )

  // Checkout IDs that are pending review only (shown in the notice, not voided)
  const pendingIds = useMemo(
    () => reviews ? new Set(reviews.filter(r => r.status === 'pending').map(r => r.checkout_id)) : null,
    [reviews]
  )

  const breakdown = useMemo(
    () => seasons && events && logged && excludedIds
      ? buildBreakdown(seasons, events, logged, excludedIds)
      : null,
    [seasons, events, logged, excludedIds]
  )

  const pendingMs = useMemo(
    () => events && pendingIds ? computePendingMs(events, pendingIds) : 0,
    [events, pendingIds]
  )

  // All-time totals per type (across every season).
  const allTime = useMemo(() => breakdown ? sumBreakdown(breakdown) : null, [breakdown])

  // Sessions newest-first, with the pending/voided flag for display.
  const sessions = useMemo(() => events ? sessionsFromEvents(events) : [], [events])
  const recent = useMemo(
    () => [...sessions].reverse().slice(0, 8).map(s => ({
      ...s, pending: s.outId ? !!pendingIds?.has(s.outId) : false,
    })),
    [sessions, pendingIds]
  )

  // Trailing-7-day hours (attendance sessions + logged), and a 6-week trend.
  const trend = useMemo(() => {
    if (!events || !logged) return null
    const now = Date.now()
    const rangeHours = (start, end) => {
      let ms = 0
      for (const s of sessions) {
        const t = s.inTime.getTime()
        if (t >= start && t < end) ms += s.ms
      }
      let h = ms / 3600000
      for (const l of logged) {
        const t = new Date(l.date + 'T00:00:00').getTime()
        if (t >= start && t < end) h += parseFloat(l.hours) || 0
      }
      return h
    }
    const weeks = []
    for (let i = 5; i >= 0; i--) {
      const end = now - i * 7 * DAY_MS
      weeks.push({ hours: rangeHours(end - 7 * DAY_MS, end), end })
    }
    return { thisWeek: weeks[weeks.length - 1].hours, weeks }
  }, [events, logged, sessions])

  const cards = useMemo(() => {
    if (!breakdown || !seasons) return []
    const list = []
    for (const s of [...seasons].sort((a, b) => b.start_date.localeCompare(a.start_date))) {
      const b = breakdown[s.id]
      if (b?.total >= 0.01) list.push({ key: s.id, label: s.name, b })
    }
    if (breakdown.other?.total >= 0.01) {
      list.push({ key: 'other', label: 'Other', b: breakdown.other })
    }
    return list
  }, [breakdown, seasons])

  if (!breakdown) {
    return <div className="mh-loading"><div className="mh-spinner" /></div>
  }

  const grandTotal = cards.reduce((s, c) => s + c.b.total, 0)
  const pendingCount = pendingIds?.size ?? 0
  const typeMax = allTime ? Math.max(...HOUR_TYPES.map(t => allTime[t.key] || 0), 0.01) : 0.01

  return (
    <div className="mh-wrap">
      <div className="mh-body">

        {grandTotal >= 0.01 && (
          <div className="mh-summary">
            <div className="mh-stat">
              <span className="mh-stat-value">{fmtHours(grandTotal)}</span>
              <span className="mh-stat-label">All Time</span>
            </div>
            <div className="mh-stat-divider" />
            <div className="mh-stat">
              <span className="mh-stat-value">{fmtHours(trend?.thisWeek ?? 0)}</span>
              <span className="mh-stat-label">This Week</span>
            </div>
            <div className="mh-stat-divider" />
            <div className="mh-stat">
              <span className="mh-stat-value">{cards.length}</span>
              <span className="mh-stat-label">{cards.length === 1 ? 'Season' : 'Seasons'}</span>
            </div>
          </div>
        )}

        {pendingCount > 0 && (
          <div className="mh-pending-notice">
            <span className="mh-pending-icon">⚠</span>
            <span>
              {pendingCount} session{pendingCount !== 1 ? 's' : ''}
              {pendingMs > 0 && ` (${fmtHours(pendingMs / 3600000)})`}
              {' '}pending mentor review — not counted in your totals yet.
            </span>
          </div>
        )}

        {grandTotal >= 0.01 && allTime && (
          <>
            {/* All-time breakdown by hour type */}
            <div className="mh-card">
              <div className="mh-card-head">
                <span className="mh-card-title">By hour type</span>
                <span className="mh-card-sub">All time</span>
              </div>
              <div className="mh-types">
                {HOUR_TYPES.filter(t => (allTime[t.key] || 0) >= 0.01).map(t => (
                  <div key={t.key} className="mh-type-row">
                    <span className="mh-type-dot" style={{ background: t.color }} />
                    <span className="mh-type-label">{t.label}</span>
                    <span className="mh-type-bar">
                      <span className="mh-type-fill" style={{ width: `${Math.min(100, (allTime[t.key] / typeMax) * 100)}%`, background: t.color }} />
                    </span>
                    <span className="mh-type-val">{fmtHours(allTime[t.key])}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weekly trend (last 6 weeks) */}
            {trend && (
              <div className="mh-card">
                <div className="mh-card-head">
                  <span className="mh-card-title">Weekly trend</span>
                  <span className="mh-card-sub">Last 6 weeks</span>
                </div>
                <div className="mh-trend">
                  {trend.weeks.map((w, i) => {
                    const max = Math.max(...trend.weeks.map(x => x.hours), 0.01)
                    return (
                      <div key={i} className="mh-trend-col" title={`${fmtHours(w.hours)} · week ending ${new Date(w.end).toLocaleDateString()}`}>
                        <span className="mh-trend-bar-track">
                          <span className="mh-trend-bar" style={{ height: `${Math.max(3, (w.hours / max) * 100)}%` }} />
                        </span>
                        <span className="mh-trend-x">{new Date(w.end - DAY_MS).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Recent sessions */}
            {recent.length > 0 && (
              <div className="mh-card">
                <div className="mh-card-head">
                  <span className="mh-card-title">Recent sessions</span>
                </div>
                <ul className="mh-sessions">
                  {recent.map((s, i) => (
                    <li key={i} className="mh-session">
                      <span className="mh-session-date">{fmtSessionDate(s.inTime)}</span>
                      <span className="mh-session-time hud-mono">{fmtClock(s.inTime)} – {s.open ? 'open' : fmtClock(s.outTime)}</span>
                      <span className="mh-session-dur">{s.open ? 'in progress' : fmtHours(s.ms / 3600000)}</span>
                      {s.pending && <span className="mh-session-flag">review</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {cards.length === 0 && (
          <p className="mh-empty">No hours recorded yet.</p>
        )}

        {cards.length > 0 && (
          <p className="mh-section-label">By season</p>
        )}

        {cards.map(({ key, label, b }) => (
          <div key={key} className="mh-season-card">
            <div className="mh-season-header">
              <span className="mh-season-name">{label}</span>
              <span className="mh-season-total">{fmtHours(b.total)}</span>
            </div>
            <div className="mh-breakdown">
              {HOUR_TYPES.filter(t => (b[t.key] || 0) >= 0.01).map(t => (
                <BreakdownRow key={t.key} color={t.color} label={t.label} value={fmtHours(b[t.key])} />
              ))}
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}

function BreakdownRow({ label, value, color }) {
  return (
    <div className="mh-breakdown-row">
      <span className="mh-breakdown-label">
        {color && <span className="mh-type-dot" style={{ background: color }} />}{label}
      </span>
      <span className="mh-breakdown-value">{value}</span>
    </div>
  )
}
