import { Link } from 'react-router-dom'

// One tile on a hub page (Robot, Team admin). A number is shown only when it
// was read; null shows no number at all, never a 0. `tone="alert"` marks
// something waiting.
export default function HubTile({ to, icon, title, big = null, bigLabel = '', line = '', tone = null, tour, badge = null }) {
  return (
    <Link to={to} className={`hub-tile${tone === 'alert' ? ' hub-tile-alert' : ''}`} data-tour={tour} data-tile={to}>
      <span className="hub-tile-top">
        <span className="hub-tile-icon" aria-hidden="true">{icon}</span>
        <span className="hub-tile-title">{title}</span>
        {badge !== null && badge > 0 && <span className="hub-tile-badge hud-tnum" aria-label={`${badge} waiting`}>{badge}</span>}
        <span className="hub-tile-go" aria-hidden="true">→</span>
      </span>
      {big !== null && big !== undefined && <span className="hub-tile-big hud-tnum">{big}<span className="hub-tile-big-label">{bigLabel}</span></span>}
      {line && <span className="hub-tile-line">{line}</span>}
    </Link>
  )
}
