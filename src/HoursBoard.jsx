import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { fmtHours, buildBreakdown, sumBreakdown, isCheckedIn } from './hoursUtils'
import './HoursBoard.css'

const SORT_COLS = ['name', 'regular', 'volunteering', 'outreach', 'competition', 'total']

export default function HoursBoard() {
  const [seasons,   setSeasons]   = useState(null)
  const [profiles,  setProfiles]  = useState(null)
  const [allEvents, setAllEvents] = useState(null)
  const [allLogged, setAllLogged] = useState(null)
  const [selSeason, setSelSeason] = useState(null) // season id | 'all'
  const [sort,      setSort]      = useState({ col: 'total', dir: 'desc' })

  useEffect(() => {
    Promise.all([
      supabase.from('seasons').select('*').order('start_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('attendance_events').select('user_id, type, event_time').order('event_time'),
      supabase.from('logged_hours').select('member_id, type, hours, date').eq('status', 'verified'),
    ]).then(([{ data: s }, { data: p }, { data: ae }, { data: lh }]) => {
      const seasons = s ?? []
      setSeasons(seasons)
      setProfiles(p ?? [])
      setAllEvents(ae ?? [])
      setAllLogged(lh ?? [])
      setSelSeason(seasons.length > 0 ? seasons[0].id : 'all')
    })
  }, [])

  // Per-member breakdown map, computed once when data arrives
  const byMember = useMemo(() => {
    if (!seasons || !profiles || !allEvents || !allLogged) return null

    const eventMap  = {}
    for (const e of allEvents) ;(eventMap[e.user_id]    ??= []).push(e)
    const loggedMap = {}
    for (const l of allLogged) ;(loggedMap[l.member_id] ??= []).push(l)

    return profiles.map(p => ({
      id:        p.id,
      name:      p.full_name || '—',
      checkedIn: isCheckedIn(eventMap[p.id] ?? []),
      breakdown: buildBreakdown(seasons, eventMap[p.id] ?? [], loggedMap[p.id] ?? []),
    }))
  }, [seasons, profiles, allEvents, allLogged])

  // Flatten to rows for the selected season
  const rows = useMemo(() => {
    if (!byMember || selSeason === null) return null
    return byMember.map(m => {
      const stats = selSeason === 'all'
        ? sumBreakdown(m.breakdown)
        : (m.breakdown[selSeason] ?? { regular: 0, volunteering: 0, outreach: 0, competition: 0, total: 0 })
      return { id: m.id, name: m.name, checkedIn: m.checkedIn, ...stats }
    })
  }, [byMember, selSeason])

  function toggleSort(col) {
    setSort(s => s.col === col
      ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' }
      : { col, dir: col === 'name' ? 'asc' : 'desc' }
    )
  }

  if (!rows) {
    return <div className="board-loading"><div className="board-spinner" /></div>
  }

  const sorted = [...rows].sort((a, b) => {
    const mul = sort.dir === 'desc' ? -1 : 1
    if (sort.col === 'name') return mul * a.name.localeCompare(b.name)
    return mul * ((a[sort.col] ?? 0) - (b[sort.col] ?? 0))
  })

  function SortTh({ col, label }) {
    const active = sort.col === col
    const arrow  = active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''
    return (
      <th
        className={`board-th board-th-sort${active ? ' board-th-sorted' : ''}`}
        onClick={() => toggleSort(col)}
      >
        {label}{arrow}
      </th>
    )
  }

  const tabs = [...(seasons ?? []), { id: 'all', name: 'All Time' }]

  return (
    <div className="board-wrap">
      <div className="board-body">

        {/* Season tabs */}
        <div className="board-tabs-scroll">
          <div className="board-tabs">
            {tabs.map(s => (
              <button
                key={s.id}
                className={`board-tab${selSeason === s.id ? ' board-tab-active' : ''}`}
                onClick={() => setSelSeason(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="board-table-wrap">
          <table className="board-table">
            <thead>
              <tr>
                <SortTh col="name"         label="Member" />
                <SortTh col="regular"      label="Regular" />
                <SortTh col="volunteering" label="Volunteering" />
                <SortTh col="outreach"     label="Outreach" />
                <SortTh col="competition"  label="Competition" />
                <SortTh col="total"        label="Total" />
                <th className="board-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} className="board-row">
                  <td className="board-td">{r.name}</td>
                  <td className="board-td board-num">{fmtHours(r.regular)}</td>
                  <td className="board-td board-num">{fmtHours(r.volunteering)}</td>
                  <td className="board-td board-num">{fmtHours(r.outreach)}</td>
                  <td className="board-td board-num">{fmtHours(r.competition)}</td>
                  <td className="board-td board-num board-total">{fmtHours(r.total)}</td>
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
    </div>
  )
}
