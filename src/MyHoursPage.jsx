import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { fmtHours, buildBreakdown } from './hoursUtils'
import './MyHoursPage.css'

export default function MyHoursPage({ session }) {
  const [seasons, setSeasons] = useState(null)
  const [events,  setEvents]  = useState(null)
  const [logged,  setLogged]  = useState(null)

  useEffect(() => {
    const uid = session.user.id
    Promise.all([
      supabase.from('seasons').select('*').order('start_date', { ascending: false }),
      supabase.from('attendance_events').select('type, event_time').eq('user_id', uid).order('event_time'),
      supabase.from('logged_hours').select('type, hours, date').eq('member_id', uid).eq('status', 'verified'),
    ]).then(([{ data: s }, { data: ae }, { data: lh }]) => {
      setSeasons(s ?? [])
      setEvents(ae ?? [])
      setLogged(lh ?? [])
    })
  }, [session.user.id])

  const breakdown = useMemo(
    () => seasons && events && logged ? buildBreakdown(seasons, events, logged) : null,
    [seasons, events, logged]
  )

  // Build ordered list of cards: seasons with hours (newest first), then Other
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
              <span className="mh-stat-value">{cards.length}</span>
              <span className="mh-stat-label">{cards.length === 1 ? 'Season' : 'Seasons'}</span>
            </div>
          </div>
        )}

        {cards.length === 0 && (
          <p className="mh-empty">No hours recorded yet.</p>
        )}

        {cards.map(({ key, label, b }) => (
          <div key={key} className="mh-season-card">
            <div className="mh-season-header">
              <span className="mh-season-name">{label}</span>
              <span className="mh-season-total">{fmtHours(b.total)}</span>
            </div>
            <div className="mh-breakdown">
              {b.regular      >= 0.01 && <BreakdownRow label="Regular"      value={fmtHours(b.regular)} />}
              {b.volunteering >= 0.01 && <BreakdownRow label="Volunteering" value={fmtHours(b.volunteering)} />}
              {b.outreach     >= 0.01 && <BreakdownRow label="Outreach"     value={fmtHours(b.outreach)} />}
              {b.competition  >= 0.01 && <BreakdownRow label="Competition"  value={fmtHours(b.competition)} />}
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}

function BreakdownRow({ label, value }) {
  return (
    <div className="mh-breakdown-row">
      <span className="mh-breakdown-label">{label}</span>
      <span className="mh-breakdown-value">{value}</span>
    </div>
  )
}
