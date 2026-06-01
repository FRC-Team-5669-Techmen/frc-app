import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import './HoursBoard.css'

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

export default function HoursBoard() {
  const [rows, setRows] = useState(null)
  const [sort, setSort] = useState({ col: 'hours', dir: 'desc' })

  useEffect(() => {
    async function load() {
      const [{ data: profiles }, { data: events }] = await Promise.all([
        supabase.from('profiles').select('id, full_name'),
        supabase
          .from('attendance_events')
          .select('user_id, type, event_time')
          .order('event_time', { ascending: true }),
      ])
      if (!profiles || !events) return

      const byUser = {}
      for (const e of events) {
        ;(byUser[e.user_id] ??= []).push(e)
      }

      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)

      setRows(
        profiles.map(p => {
          const userEvents = byUser[p.id] ?? []
          const todayEvents = userEvents.filter(e => new Date(e.event_time) >= startOfToday)
          return {
            id: p.id,
            name: p.full_name || '—',
            hours: computeHoursMs(userEvents),
            checkedIn: todayEvents.at(-1)?.type === 'in',
          }
        })
      )
    }
    load()
  }, [])

  function toggleSort(col) {
    setSort(s =>
      s.col === col
        ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' }
        : { col, dir: col === 'hours' ? 'desc' : 'asc' }
    )
  }

  if (rows === null) {
    return (
      <div className="board-loading">
        <div className="board-spinner" />
      </div>
    )
  }

  const sorted = [...rows].sort((a, b) => {
    const mul = sort.dir === 'desc' ? -1 : 1
    if (sort.col === 'hours') return mul * (a.hours - b.hours)
    return mul * a.name.localeCompare(b.name)
  })

  function colHeader(col, label) {
    const arrow = sort.col === col ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'
    return (
      <th className="board-th sortable" onClick={() => toggleSort(col)}>
        {label}{arrow}
      </th>
    )
  }

  return (
    <div className="board-wrap">
      <header className="board-header">
        <span className="board-title">Team Hours</span>
        <button className="board-signout" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <div className="board-table-wrap">
        <table className="board-table">
          <thead>
            <tr>
              {colHeader('name', 'Member')}
              {colHeader('hours', 'Season Hours')}
              <th className="board-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id} className="board-row">
                <td className="board-td">{r.name}</td>
                <td className="board-td board-hours">{fmtDuration(r.hours)}</td>
                <td className="board-td">
                  <span className={`board-pill ${r.checkedIn ? 'pill-in' : 'pill-out'}`}>
                    {r.checkedIn ? 'In' : 'Out'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
