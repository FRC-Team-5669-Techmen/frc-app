import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { fmtHours, buildBreakdown, sumBreakdown, isCheckedIn, sessionsFromEvents, fmtLocation, HOUR_TYPES } from './hoursUtils'
import './HoursBoard.css'

const TYPE_COLOR = Object.fromEntries(HOUR_TYPES.map(t => [t.key, t.color]))
const TYPE_LABEL = Object.fromEntries(HOUR_TYPES.map(t => [t.key, t.label]))

// Defined outside HoursBoard so React sees a stable component reference across renders.
function SortTh({ col, label, sort, onSort, color }) {
  const active = sort.col === col
  const arrow  = active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''
  return (
    <th
      className={`board-th board-th-sort${active ? ' board-th-sorted' : ''}`}
      onClick={() => onSort(col)}
    >
      {color && <span className="board-type-dot" style={{ background: color }} />}
      {label}{arrow}
    </th>
  )
}

// Quote a CSV field (wrap in quotes, escape embedded quotes).
const csv = v => `"${String(v ?? '').replace(/"/g, '""')}"`

export default function HoursBoard({ hasRole = () => false }) {
  const isAdmin = hasRole('admin')
  const [seasons,   setSeasons]   = useState(null)
  const [profiles,  setProfiles]  = useState(null)
  const [allEvents, setAllEvents] = useState(null)
  const [allLogged, setAllLogged] = useState(null)
  const [excluded,  setExcluded]  = useState(null) // Map<userId, Set<checkoutId>>
  const [selSeason, setSelSeason] = useState(null) // season id | 'all'
  const [sort,      setSort]      = useState({ col: 'total', dir: 'desc' })
  const [view,      setView]      = useState('members') // 'members' | 'days'

  useEffect(() => {
    Promise.all([
      supabase.from('seasons').select('*').order('start_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('attendance_events').select('id, user_id, type, event_time, location').order('event_time'),
      supabase.from('logged_hours').select('member_id, type, hours, date').eq('status', 'verified'),
      supabase.from('session_reviews').select('user_id, checkout_id').in('status', ['pending', 'voided']),
    ]).then(([{ data: s }, { data: p }, { data: ae }, { data: lh }, { data: sr }]) => {
      const seas = s ?? []
      setSeasons(seas)
      setProfiles(p ?? [])
      setAllEvents(ae ?? [])
      setAllLogged(lh ?? [])

      // Build per-user set of checkout IDs that don't count toward official totals
      const excMap = {}
      for (const row of sr ?? []) {
        ;(excMap[row.user_id] ??= new Set()).add(row.checkout_id)
      }
      setExcluded(excMap)

      const today   = new Date().toISOString().slice(0, 10)
      const current = seas.find(s =>
        s.start_date <= today && (s.end_date == null || s.end_date >= today)
      )
      setSelSeason(current?.id ?? seas[0]?.id ?? 'all')
    })
  }, [])

  const byMember = useMemo(() => {
    if (!seasons || !profiles || !allEvents || !allLogged || !excluded) return null

    // Group events and logged hours by member id.
    // Curly braces are required — a leading ; would be parsed as the loop body,
    // leaving the expression to run after the loop where e/l are out of scope.
    const eventMap = {}
    for (const e of allEvents) {
      (eventMap[e.user_id] ??= []).push(e)
    }
    const loggedMap = {}
    for (const l of allLogged) {
      (loggedMap[l.member_id] ??= []).push(l)
    }

    return profiles.map(p => ({
      id:        p.id,
      name:      p.full_name || '—',
      checkedIn: isCheckedIn(eventMap[p.id] ?? []),
      breakdown: buildBreakdown(seasons, eventMap[p.id] ?? [], loggedMap[p.id] ?? [], excluded[p.id] ?? null),
    }))
  }, [seasons, profiles, allEvents, allLogged, excluded])

  const rows = useMemo(() => {
    if (!byMember || selSeason === null) return null
    return byMember.map(m => {
      const stats = selSeason === 'all'
        ? sumBreakdown(m.breakdown)
        : (m.breakdown[selSeason] ?? { regular: 0, volunteering: 0, outreach: 0, competition: 0, total: 0 })
      return { id: m.id, name: m.name, checkedIn: m.checkedIn, ...stats }
    })
  }, [byMember, selSeason])

  // Selected season's date range (null = All Time → no filter).
  const selRange = useMemo(() => {
    if (!seasons || selSeason === null || selSeason === 'all') return null
    const s = seasons.find(x => x.id === selSeason)
    return s ? { start: s.start_date, end: s.end_date } : null
  }, [seasons, selSeason])

  // Team-wide per-day, per-type totals for the selected season.
  const byDay = useMemo(() => {
    if (!profiles || !allEvents || !allLogged || !excluded) return null
    const eventMap = {}
    for (const e of allEvents) (eventMap[e.user_id] ??= []).push(e)
    const map = {}
    const bucket = d => (map[d] ??= { regular: 0, volunteering: 0, outreach: 0, competition: 0, total: 0 })
    const inRange = d => !selRange || (d >= selRange.start && (selRange.end == null || d <= selRange.end))

    for (const p of profiles) {
      const evs = eventMap[p.id] ?? []
      // Regular hours: group by date, pair within date (mirrors buildBreakdown).
      const byDate = {}
      for (const e of evs) (byDate[e.event_time.slice(0, 10)] ??= []).push(e)
      for (const [date, dayEvs] of Object.entries(byDate)) {
        if (!inRange(date)) continue
        dayEvs.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
        let inT = null, ms = 0
        for (const e of dayEvs) {
          if (e.type === 'in') inT = new Date(e.event_time)
          else if (e.type === 'out' && inT) {
            if (!(excluded[p.id]?.has(e.id))) ms += new Date(e.event_time) - inT
            inT = null
          }
        }
        if (ms > 0) { const b = bucket(date); b.regular += ms / 3600000; b.total += ms / 3600000 }
      }
      // Open session counted up to now (mirrors buildBreakdown).
      const sorted = [...evs].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
      let openIn = null, openDate = null
      for (const e of sorted) {
        if (e.type === 'in') { openIn = new Date(e.event_time); openDate = e.event_time.slice(0, 10) }
        else if (e.type === 'out' && openIn) { openIn = null; openDate = null }
      }
      if (openIn && inRange(openDate)) {
        const h = (Date.now() - openIn) / 3600000
        const b = bucket(openDate); b.regular += h; b.total += h
      }
    }
    // Logged hours by date + type.
    for (const l of allLogged) {
      if (!inRange(l.date)) continue
      const h = parseFloat(l.hours) || 0
      const b = bucket(l.date); b[l.type] = (b[l.type] ?? 0) + h; b.total += h
    }
    return Object.entries(map)
      .map(([date, b]) => ({ date, ...b }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [profiles, allEvents, allLogged, excluded, selRange])

  // Fine-grained per-person, per-day sessions for the selected season: exact
  // in/out times and the entrance/exit used for each.
  const sessionRows = useMemo(() => {
    if (!profiles || !allEvents || !excluded) return null
    const eventMap = {}
    for (const e of allEvents) (eventMap[e.user_id] ??= []).push(e)
    const inRange = d => !selRange || (d >= selRange.start && (selRange.end == null || d <= selRange.end))
    const rows = []
    for (const p of profiles) {
      const name = p.full_name || '—'
      for (const s of sessionsFromEvents(eventMap[p.id] ?? [])) {
        const date = s.inTime.toISOString().slice(0, 10)
        if (!inRange(date)) continue
        rows.push({
          key: `${p.id}-${s.inTime.getTime()}`,
          name, date, ...s,
          flagged: !!(s.outId && excluded[p.id]?.has(s.outId)),
        })
      }
    }
    rows.sort((a, b) => a.name.localeCompare(b.name) || a.inTime - b.inTime)
    return rows
  }, [profiles, allEvents, excluded, selRange])

  // Admin CSV: every member's full sign in/out history + logged hours.
  function exportCsv() {
    const nameById = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name || '—']))
    const eventMap = {}
    for (const e of (allEvents ?? [])) (eventMap[e.user_id] ??= []).push(e)
    const lines = [['Member', 'Hour Type', 'Date', 'Check In', 'Entrance', 'Check Out', 'Exit', 'Duration (h)', 'Flagged']
      .map(csv).join(',')]
    for (const p of (profiles ?? [])) {
      const name = p.full_name || '—'
      for (const s of sessionsFromEvents(eventMap[p.id] ?? [])) {
        const flagged = s.outId && excluded?.[p.id]?.has(s.outId) ? 'review' : ''
        lines.push([
          name, 'Regular', s.inTime.toISOString().slice(0, 10),
          s.inTime.toLocaleString(), fmtLocation(s.inLoc),
          s.open ? '(open)' : s.outTime.toLocaleString(),
          s.open ? '' : fmtLocation(s.outLoc),
          (s.ms / 3600000).toFixed(2), flagged,
        ].map(csv).join(','))
      }
    }
    for (const l of (allLogged ?? [])) {
      lines.push([
        nameById[l.member_id] || '—', TYPE_LABEL[l.type] ?? l.type, l.date,
        '', '', '', '', (parseFloat(l.hours) || 0).toFixed(2), '',
      ].map(csv).join(','))
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `techmen-hours-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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

  const tabs = [...(seasons ?? []), { id: 'all', name: 'All Time' }]

  return (
    <div className="board-wrap">
      <div className="board-body">

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

        <div className="board-controls">
          <div className="board-viewtoggle">
            <button
              className={`board-viewbtn${view === 'members' ? ' active' : ''}`}
              onClick={() => setView('members')}
            >By member</button>
            <button
              className={`board-viewbtn${view === 'days' ? ' active' : ''}`}
              onClick={() => setView('days')}
            >By day</button>
            <button
              className={`board-viewbtn${view === 'sessions' ? ' active' : ''}`}
              onClick={() => setView('sessions')}
            >Sessions</button>
          </div>
          {isAdmin && (
            <button className="board-export" onClick={exportCsv}>⬇ Export CSV</button>
          )}
        </div>

        {view === 'members' ? (
          <div className="board-table-wrap">
            <table className="board-table">
              <thead>
                <tr>
                  <SortTh col="name"         label="Member"       sort={sort} onSort={toggleSort} />
                  <SortTh col="regular"      label="Regular"      sort={sort} onSort={toggleSort} color={TYPE_COLOR.regular} />
                  <SortTh col="volunteering" label="Volunteering" sort={sort} onSort={toggleSort} color={TYPE_COLOR.volunteering} />
                  <SortTh col="outreach"     label="Outreach"     sort={sort} onSort={toggleSort} color={TYPE_COLOR.outreach} />
                  <SortTh col="competition"  label="Competition"  sort={sort} onSort={toggleSort} color={TYPE_COLOR.competition} />
                  <SortTh col="total"        label="Total"        sort={sort} onSort={toggleSort} />
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
        ) : view === 'days' ? (
          <div className="board-table-wrap">
            {(byDay?.length ?? 0) === 0 ? (
              <p className="board-empty">No hours recorded for this period.</p>
            ) : (
              <table className="board-table">
                <thead>
                  <tr>
                    <th className="board-th">Day</th>
                    {HOUR_TYPES.map(t => (
                      <th key={t.key} className="board-th">
                        <span className="board-type-dot" style={{ background: t.color }} />{t.label}
                      </th>
                    ))}
                    <th className="board-th">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map(d => (
                    <tr key={d.date} className="board-row">
                      <td className="board-td board-day">{fmtDay(d.date)}</td>
                      {HOUR_TYPES.map(t => (
                        <td key={t.key} className="board-td board-num">{fmtHours(d[t.key])}</td>
                      ))}
                      <td className="board-td board-num board-total">{fmtHours(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="board-table-wrap">
            {(sessionRows?.length ?? 0) === 0 ? (
              <p className="board-empty">No sessions recorded for this period.</p>
            ) : (
              <table className="board-table">
                <thead>
                  <tr>
                    <th className="board-th">Member</th>
                    <th className="board-th">Day</th>
                    <th className="board-th">Check In</th>
                    <th className="board-th">Entrance</th>
                    <th className="board-th">Check Out</th>
                    <th className="board-th">Exit</th>
                    <th className="board-th">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionRows.map(s => (
                    <tr key={s.key} className="board-row">
                      <td className="board-td">{s.name}</td>
                      <td className="board-td board-day">{fmtDay(s.date)}</td>
                      <td className="board-td board-num">{fmtTime(s.inTime)}</td>
                      <td className="board-td board-loc">{fmtLocation(s.inLoc)}</td>
                      <td className="board-td board-num">
                        {s.open ? <span className="board-open">— open —</span> : fmtTime(s.outTime)}
                      </td>
                      <td className="board-td board-loc">{s.open ? '—' : fmtLocation(s.outLoc)}</td>
                      <td className="board-td board-num board-total">
                        {fmtHours(s.ms / 3600000)}{s.flagged && <span className="board-flag" title="Pending/auto-close review"> ⚠</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function fmtTime(d) {
  return d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'
}

function fmtDay(date) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
