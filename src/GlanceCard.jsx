import { Link } from 'react-router-dom'
import { startOfTodayISO } from './presence'
import { fmtTime, fmtDay } from './shopStatus'
import { useGlance, startOfTomorrowISO } from './useGlance'
import './GlanceCard.css'

// One-look "what's up" card: shop open/closed (from today's build windows),
// a live present-count override (presence.js), and the next event. Shared by
// HomePage and ParentHomePage; the derivation lives in useGlance().
// NOTE: deliberately NOT imported by the /checkin fast path.

export default function GlanceCard({ flush = false }) {
  const g = useGlance()

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
