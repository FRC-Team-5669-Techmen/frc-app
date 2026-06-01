import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import './MyHoursPage.css'

function computeHoursMs(events) {
  let total = 0
  let inTime = null
  for (const e of events) {
    if (e.type === 'in') {
      inTime = new Date(e.event_time)
    } else if (e.type === 'out' && inTime) {
      total += new Date(e.event_time) - inTime
      inTime = null
    }
  }
  if (inTime) total += Date.now() - inTime
  return total
}

function fmtDuration(ms) {
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function fmtDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function MyHoursPage({ session }) {
  const [days, setDays]       = useState(null)
  const [totalMs, setTotalMs] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: events } = await supabase
        .from('attendance_events')
        .select('type, event_time')
        .eq('user_id', session.user.id)
        .order('event_time', { ascending: true })

      if (!events) return

      const buckets = {}
      for (const e of events) {
        const key = e.event_time.slice(0, 10)
        ;(buckets[key] ??= []).push(e)
      }

      const summaries = Object.entries(buckets)
        .map(([key, evts]) => ({
          key,
          date: new Date(key + 'T12:00:00'),
          ms: computeHoursMs(evts),
        }))
        .filter(d => d.ms > 0)
        .sort((a, b) => b.date - a.date)

      setDays(summaries)
      setTotalMs(computeHoursMs(events))
    }
    load()
  }, [session.user.id])

  if (days === null) {
    return (
      <div className="mh-loading">
        <div className="mh-spinner" />
      </div>
    )
  }

  return (
    <div className="mh-wrap">
      <div className="mh-body">
        <div className="mh-summary">
          <div className="mh-stat">
            <span className="mh-stat-value">{totalMs > 0 ? fmtDuration(totalMs) : '0m'}</span>
            <span className="mh-stat-label">Season Total</span>
          </div>
          <div className="mh-stat-divider" />
          <div className="mh-stat">
            <span className="mh-stat-value">{days.length}</span>
            <span className="mh-stat-label">Days</span>
          </div>
        </div>

        {days.length === 0 ? (
          <p className="mh-empty">No hours recorded yet this season.</p>
        ) : (
          <div className="mh-table-wrap">
            <table className="mh-table">
              <thead>
                <tr>
                  <th className="mh-th">Date</th>
                  <th className="mh-th mh-th-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {days.map(d => (
                  <tr key={d.key} className="mh-row">
                    <td className="mh-td">{fmtDate(d.date)}</td>
                    <td className="mh-td mh-td-right mh-hours">{fmtDuration(d.ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
