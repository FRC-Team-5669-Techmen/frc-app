import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { supabase } from './supabase'
import { fmtHours, buildBreakdown, sumBreakdown, isCheckedIn, sessionsFromEvents, fmtLocation, cappedSession, CATEGORIES, categoryLabel, categoryColor, loggedTypeToCategory, emptyBreakdown } from './hoursUtils'
import { displayName } from './names'
import './HoursBoard.css'

// Defined outside HoursBoard so React sees a stable component reference across renders.
function SortTh({ col, label, sort, onSort, color, className = '' }) {
  const active = sort.col === col
  const arrow  = active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''
  return (
    <th
      className={`board-th board-th-sort${active ? ' board-th-sorted' : ''}${className ? ' ' + className : ''}`}
      onClick={() => onSort(col)}
    >
      {color && <span className="board-type-dot" style={{ background: color }} />}
      {label}{arrow}
    </th>
  )
}

// Quote a CSV field (wrap in quotes, escape embedded quotes).
const csv = v => `"${String(v ?? '').replace(/"/g, '""')}"`

// ── Matrix helpers (member × day timesheet) ──
const DOW2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const weekdayOf = key => new Date(key + 'T00:00:00').getDay()
const fmtMD = key => { const [, m, d] = key.split('-'); return `${Number(m)}/${Number(d)}` }
function addDaysKey(key, n) {
  const d = new Date(key + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
// Saturday that starts the Sat–Fri week containing `key`.
function weekStartKey(key) { return addDaysKey(key, -((weekdayOf(key) + 1) % 7)) }

// Per-date attendance (on-site, all categories) hours for one member — mirrors
// the by-date pairing in buildBreakdown, including an open session counted to
// now. The matrix is a coach timesheet of physical presence, so every category
// counts toward the daily total; the category split lives in the by-member table
// and the per-member drill-down.
function attendanceHoursByDate(events, excludedSet) {
  const byDate = {}
  for (const e of events) (byDate[e.event_time.slice(0, 10)] ??= []).push(e)
  const out = {}
  for (const [date, evts] of Object.entries(byDate)) {
    evts.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
    let inT = null, ms = 0
    for (const e of evts) {
      if (e.type === 'in') inT = new Date(e.event_time)
      else if (e.type === 'out' && inT) {
        if (!excludedSet?.has(e.id)) ms += cappedSession(inT, new Date(e.event_time)).ms
        inT = null
      }
    }
    if (ms > 0) out[date] = (out[date] ?? 0) + ms / 3600000
  }
  const sorted = [...events].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
  let openIn = null, openDate = null
  for (const e of sorted) {
    if (e.type === 'in') { openIn = new Date(e.event_time); openDate = e.event_time.slice(0, 10) }
    else if (e.type === 'out' && openIn) { openIn = null; openDate = null }
  }
  if (openIn) out[openDate] = (out[openDate] ?? 0) + cappedSession(openIn, null).ms / 3600000
  return out
}

const fmtCell = h => (h ?? 0).toFixed(1)

function downloadCsv(lines, filename) {
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function HoursBoard({ hasRole = () => false }) {
  const isAdmin = hasRole('admin')
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const [seasons,   setSeasons]   = useState(null)
  const [profiles,  setProfiles]  = useState(null)
  const [allEvents, setAllEvents] = useState(null)
  const [allLogged, setAllLogged] = useState(null)
  const [excluded,  setExcluded]  = useState(null) // Map<userId, Set<checkoutId>>
  const [selSeason, setSelSeason] = useState(null) // season id | 'all'
  const [sort,      setSort]      = useState({ col: 'total', dir: 'desc' })
  const [view,      setView]      = useState('members') // 'members' | 'matrix'
  const [detail,    setDetail]    = useState(null)       // { memberId, name, day|null } drill-down
  const [adjust,    setAdjust]    = useState(null)       // staff manual entry / edit / void panel
  const todayThRef = useRef(null)                        // matrix's current-day header, for auto-scroll

  // Reloads only the volatile data (events + the review-exclusion map) after a
  // staff adjustment; the season selection and tabs are left untouched.
  async function reloadEvents() {
    const [{ data: ae }, { data: sr }] = await Promise.all([
      supabase.from('attendance_events').select('id, user_id, type, event_time, location, category, manual_entry').order('event_time'),
      supabase.from('session_reviews').select('user_id, checkout_id').in('status', ['pending', 'voided']),
    ])
    setAllEvents(ae ?? [])
    const excMap = {}
    for (const row of sr ?? []) (excMap[row.user_id] ??= new Set()).add(row.checkout_id)
    setExcluded(excMap)
  }

  useEffect(() => {
    Promise.all([
      supabase.from('seasons').select('*').order('start_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name, nickname'),
      supabase.from('attendance_events').select('id, user_id, type, event_time, location, category, manual_entry').order('event_time'),
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
      name:      displayName(p),
      checkedIn: isCheckedIn(eventMap[p.id] ?? []),
      breakdown: buildBreakdown(seasons, eventMap[p.id] ?? [], loggedMap[p.id] ?? [], excluded[p.id] ?? null),
    }))
  }, [seasons, profiles, allEvents, allLogged, excluded])

  const rows = useMemo(() => {
    if (!byMember || selSeason === null) return null
    return byMember.map(m => {
      const stats = selSeason === 'all'
        ? sumBreakdown(m.breakdown)
        : (m.breakdown[selSeason] ?? emptyBreakdown())
      return { id: m.id, name: m.name, checkedIn: m.checkedIn, ...stats }
    })
  }, [byMember, selSeason])

  // Team-wide category totals (+ grand total) for the selected season — the
  // summary strip above the table.
  const teamTotals = useMemo(() => {
    if (!rows) return null
    const t = emptyBreakdown()
    for (const r of rows) {
      for (const c of CATEGORIES) t[c.key] += r[c.key] ?? 0
      t.total += r.total ?? 0
    }
    return t
  }, [rows])

  // Selected season's date range (null = All Time → no filter).
  const selRange = useMemo(() => {
    if (!seasons || selSeason === null || selSeason === 'all') return null
    const s = seasons.find(x => x.id === selSeason)
    return s ? { start: s.start_date, end: s.end_date } : null
  }, [seasons, selSeason])

  // Raw attendance events grouped by member — source for the drill-down panel,
  // which reads stored sign-in/out records rather than recomputing any totals.
  const eventsByMember = useMemo(() => {
    const m = {}
    for (const e of (allEvents ?? [])) (m[e.user_id] ??= []).push(e)
    return m
  }, [allEvents])

  // The matrix needs exactly one season. A specific tab uses that season; the
  // 'All Time' tab falls back to the active (current) season for this view.
  const matrixSeason = useMemo(() => {
    if (!seasons || selSeason === null) return null
    const today  = new Date().toISOString().slice(0, 10)
    const active = seasons.find(s => s.start_date <= today && (s.end_date == null || s.end_date >= today))
    if (selSeason === 'all') return active ?? seasons[0] ?? null
    return seasons.find(s => s.id === selSeason) ?? active ?? null
  }, [seasons, selSeason])

  // Member × day grid of regular (attendance-derived) hours: a row per member
  // (zeros included), a column per calendar day from season start through today,
  // grouped into Sat–Fri weeks with a per-week subtotal and a season Total.
  const matrix = useMemo(() => {
    if (!profiles || !allEvents || !excluded || !matrixSeason) return null
    const today     = new Date().toISOString().slice(0, 10)
    const start     = matrixSeason.start_date
    const seasonEnd = matrixSeason.end_date ?? today
    const end       = seasonEnd < today ? seasonEnd : today  // never render future days

    const days = []
    if (start <= end) for (let k = start; k <= end; k = addDaysKey(k, 1)) days.push(k)

    // Group days into Sat–Fri weeks, keyed by the week's Saturday.
    const weekMap = new Map()
    for (const k of days) {
      const ws = weekStartKey(k)
      if (!weekMap.has(ws)) weekMap.set(ws, { key: ws, days: [], friKey: addDaysKey(ws, 6) })
      weekMap.get(ws).days.push(k)
    }
    const weeks = [...weekMap.values()].sort((a, b) => a.key.localeCompare(b.key))

    const eventMap = {}
    for (const e of allEvents) (eventMap[e.user_id] ??= []).push(e)

    const rows = profiles.map(p => {
      const hoursByDate = attendanceHoursByDate(eventMap[p.id] ?? [], excluded[p.id])
      const perDay = {}, weekSub = {}
      let total = 0
      for (const w of weeks) {
        let wsum = 0
        for (const k of w.days) { const h = hoursByDate[k] ?? 0; perDay[k] = h; wsum += h }
        weekSub[w.key] = wsum
        total += wsum
      }
      return { id: p.id, name: displayName(p), perDay, weekSub, total }
    })

    // Footer: per-day, per-week, and grand totals across all members.
    const dailyTotal = { perDay: {}, weekSub: {}, total: 0 }
    for (const w of weeks) {
      let wsum = 0
      for (const k of w.days) {
        let s = 0
        for (const r of rows) s += r.perDay[k] ?? 0
        dailyTotal.perDay[k] = s
        wsum += s
      }
      dailyTotal.weekSub[w.key] = wsum
    }
    dailyTotal.total = rows.reduce((a, r) => a + r.total, 0)

    return { season: matrixSeason, fromAll: selSeason === 'all', days, weeks, rows, dailyTotal }
  }, [profiles, allEvents, excluded, matrixSeason, selSeason])

  const matrixSorted = useMemo(() => {
    if (!matrix) return null
    const mul = sort.dir === 'desc' ? -1 : 1
    const col = sort.col
    return [...matrix.rows].sort((a, b) => {
      if (col === 'name') return mul * a.name.localeCompare(b.name)
      if (col && col.startsWith('wk:')) {
        const wk = col.slice(3)
        return mul * ((a.weekSub[wk] ?? 0) - (b.weekSub[wk] ?? 0)) || a.name.localeCompare(b.name)
      }
      // 'total' (and any column carried over from another view) sorts by Total.
      return mul * (a.total - b.total) || a.name.localeCompare(b.name)
    })
  }, [matrix, sort])

  // On opening the matrix (or when its data lands), scroll the current day into
  // view so today's column is visible without manual horizontal scrolling.
  useEffect(() => {
    if (view === 'matrix' && todayThRef.current) {
      todayThRef.current.scrollIntoView({ inline: 'center', block: 'nearest' })
    }
  }, [view, matrix])

  // Drill-down: the stored sessions behind a member's hours, grouped by day and
  // pulled straight from the attendance records (no recomputed/fabricated times).
  // detail.day set → just that day (matrix cell); null → every in-season day.
  const detailData = useMemo(() => {
    if (!detail) return null
    const evs = eventsByMember[detail.memberId] ?? []
    const inRange = d => !selRange || (d >= selRange.start && (selRange.end == null || d <= selRange.end))
    const byDay = new Map()
    for (const s of sessionsFromEvents(evs)) {
      const day = s.inTime.toISOString().slice(0, 10)
      if (detail.day ? day !== detail.day : !inRange(day)) continue
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day).push({ ...s, flagged: !!(s.outId && excluded?.[detail.memberId]?.has(s.outId)) })
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, sessions]) => ({ day, sessions }))
  }, [detail, eventsByMember, selRange, excluded])

  // Category breakdown (+ grand total) of the sessions shown in the drill-down,
  // counting only the ones that count toward official hours (not flagged).
  const detailTotals = useMemo(() => {
    if (!detailData) return null
    const t = emptyBreakdown()
    for (const { sessions } of detailData) {
      for (const s of sessions) {
        if (s.flagged) continue
        const h = s.ms / 3600000
        t[s.category] = (t[s.category] ?? 0) + h
        t.total += h
      }
    }
    return t
  }, [detailData])

  // Admin CSV: every member's full sign in/out history + logged hours.
  function exportCsv() {
    if (view === 'matrix') { exportMatrixCsv(); return }
    const nameById = Object.fromEntries((profiles ?? []).map(p => [p.id, displayName(p)]))
    const eventMap = {}
    for (const e of (allEvents ?? [])) (eventMap[e.user_id] ??= []).push(e)
    const lines = [['Member', 'Category', 'Date', 'Check In', 'Entrance', 'Check Out', 'Exit', 'Duration (h)', 'Flagged']
      .map(csv).join(',')]
    for (const p of (profiles ?? [])) {
      const name = displayName(p)
      for (const s of sessionsFromEvents(eventMap[p.id] ?? [])) {
        const flagged = s.outId && excluded?.[p.id]?.has(s.outId) ? 'review' : ''
        lines.push([
          name, categoryLabel(s.category), s.inTime.toISOString().slice(0, 10),
          s.inTime.toLocaleString(), fmtLocation(s.inLoc),
          s.open ? '(open)' : s.outTime.toLocaleString(),
          s.open ? '' : fmtLocation(s.outLoc),
          (s.ms / 3600000).toFixed(2), flagged,
        ].map(csv).join(','))
      }
    }
    for (const l of (allLogged ?? [])) {
      lines.push([
        nameById[l.member_id] || '—', categoryLabel(loggedTypeToCategory(l.type)), l.date,
        '', '', '', '', (parseFloat(l.hours) || 0).toFixed(2), '',
      ].map(csv).join(','))
    }
    downloadCsv(lines, `techmen-hours-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // Matrix CSV: the member × day grid with each week's subtotal and the Total.
  function exportMatrixCsv() {
    if (!matrix) return
    const header = ['Member']
    for (const w of matrix.weeks) {
      for (const k of w.days) header.push(k)
      header.push(`Week of ${w.key}`)
    }
    header.push('Total')
    const lines = [header.map(csv).join(',')]

    for (const r of (matrixSorted ?? matrix.rows)) {
      const cells = [r.name]
      for (const w of matrix.weeks) {
        for (const k of w.days) cells.push(fmtCell(r.perDay[k]))
        cells.push(fmtCell(r.weekSub[w.key]))
      }
      cells.push(fmtCell(r.total))
      lines.push(cells.map(csv).join(','))
    }

    const foot = ['Daily Total']
    for (const w of matrix.weeks) {
      for (const k of w.days) foot.push(fmtCell(matrix.dailyTotal.perDay[k]))
      foot.push(fmtCell(matrix.dailyTotal.weekSub[w.key]))
    }
    foot.push(fmtCell(matrix.dailyTotal.total))
    lines.push(foot.map(csv).join(','))

    downloadCsv(lines, `techmen-matrix-${new Date().toISOString().slice(0, 10)}.csv`)
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
  const todayKey = new Date().toISOString().slice(0, 10)

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
              className={`board-viewbtn${view === 'matrix' ? ' active' : ''}`}
              onClick={() => setView('matrix')}
            >Matrix</button>
          </div>
          {isAdmin && (
            <button className="board-export" onClick={exportCsv}>⬇ Export CSV</button>
          )}
        </div>

        {view === 'members' && teamTotals && (
          <div className="board-totals">
            {CATEGORIES.map(c => (
              <div key={c.key} className="board-total-chip">
                <span className="board-type-dot" style={{ background: c.color }} />
                <span className="board-total-label">{c.label}</span>
                <span className="board-total-val hud-tnum">{fmtHours(teamTotals[c.key])}</span>
              </div>
            ))}
            <div className="board-total-chip board-total-grand">
              <span className="board-total-label">Grand total</span>
              <span className="board-total-val hud-tnum">{fmtHours(teamTotals.total)}</span>
            </div>
          </div>
        )}

        {view === 'members' ? (
          <div className="board-table-wrap">
            <table className="board-table">
              <thead>
                <tr>
                  <SortTh col="name" label="Member" sort={sort} onSort={toggleSort} />
                  {CATEGORIES.map(c => (
                    <SortTh key={c.key} col={c.key} label={c.label} sort={sort} onSort={toggleSort} color={c.color} />
                  ))}
                  <SortTh col="total" label="Total" sort={sort} onSort={toggleSort} />
                  <th className="board-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr
                    key={r.id}
                    className="board-row board-row-click"
                    onClick={() => setDetail({ memberId: r.id, name: r.name, day: null })}
                    title="View sessions by day"
                  >
                    <td className="board-td board-member-link">{r.name}</td>
                    {CATEGORIES.map(c => (
                      <td key={c.key} className="board-td board-num">{fmtHours(r[c.key])}</td>
                    ))}
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
        ) : (
          <>
            {matrix && (
              <p className="board-matrix-note">
                Member × day grid — total attendance hours (all categories), weeks Sat–Fri. Click a cell for the category breakdown.
                {matrix.fromAll && <> Showing <strong>{matrix.season.name}</strong> (active season).</>}
              </p>
            )}
            <div className="board-table-wrap">
              {(!matrix || matrix.days.length === 0) ? (
                <p className="board-empty">No days to show for this season yet.</p>
              ) : (
                <table className="board-table board-matrix">
                  <thead>
                    <tr>
                      <SortTh col="name" label="Member" sort={sort} onSort={toggleSort} className="board-sticky" />
                      {matrix.weeks.map(w => (
                        <Fragment key={w.key}>
                          {w.days.map(k => (
                            <th
                              key={k}
                              ref={k === todayKey ? todayThRef : undefined}
                              className={`board-th board-matrix-dayth${k === todayKey ? ' board-matrix-today' : ''}`}
                            >
                              <span className="board-matrix-dow">{DOW2[weekdayOf(k)]}</span>
                              <span className="board-matrix-date">{fmtMD(k)}</span>
                            </th>
                          ))}
                          <SortTh col={`wk:${w.key}`} label={`Wk ${fmtMD(w.friKey)}`} sort={sort} onSort={toggleSort} className="board-matrix-subth" />
                        </Fragment>
                      ))}
                      <SortTh col="total" label="Total" sort={sort} onSort={toggleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {matrixSorted.map(r => (
                      <tr key={r.id} className="board-row">
                        <td className="board-td board-sticky board-matrix-name">{r.name}</td>
                        {matrix.weeks.map(w => (
                          <Fragment key={w.key}>
                            {w.days.map(k => {
                              const h = r.perDay[k] ?? 0
                              const has = h >= 0.05
                              return (
                                <td
                                  key={k}
                                  className={`board-td board-num board-matrix-cell${has ? ' board-matrix-cell-click' : ' board-matrix-zero'}`}
                                  onClick={has ? () => setDetail({ memberId: r.id, name: r.name, day: k }) : undefined}
                                  title={has ? 'View sessions this day' : undefined}
                                >
                                  {fmtCell(h)}
                                </td>
                              )
                            })}
                            <td className="board-td board-num board-matrix-sub">{fmtCell(r.weekSub[w.key])}</td>
                          </Fragment>
                        ))}
                        <td className="board-td board-num board-total">{fmtCell(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="board-matrix-foot">
                      <td className="board-td board-sticky board-matrix-name board-total">Daily Total</td>
                      {matrix.weeks.map(w => (
                        <Fragment key={w.key}>
                          {w.days.map(k => (
                            <td key={k} className="board-td board-num board-total">{fmtCell(matrix.dailyTotal.perDay[k])}</td>
                          ))}
                          <td className="board-td board-num board-matrix-sub board-total">{fmtCell(matrix.dailyTotal.weekSub[w.key])}</td>
                        </Fragment>
                      ))}
                      <td className="board-td board-num board-total">{fmtCell(matrix.dailyTotal.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Drill-down: stored sessions behind a member's hours ── */}
      {detail && (
        <div className="board-detail-backdrop" onClick={() => setDetail(null)}>
          <div className="board-detail" onClick={e => e.stopPropagation()}>
            <div className="board-detail-head">
              <div>
                <h2 className="board-detail-title">{detail.name}</h2>
                <p className="board-detail-sub hud-mono">
                  {detail.day ? fmtDay(detail.day) : 'Sessions by day'}
                </p>
              </div>
              <div className="board-detail-head-actions">
                {isStaff && (
                  <button
                    className="board-adjust-btn"
                    onClick={() => setAdjust({ mode: 'add', memberId: detail.memberId, name: detail.name, day: detail.day })}
                  >+ Manual session</button>
                )}
                <button className="board-detail-close" onClick={() => setDetail(null)} aria-label="Close">×</button>
              </div>
            </div>
            {(!detailData || detailData.length === 0) ? (
              <p className="board-empty">No sessions recorded{detail.day ? ' this day' : ' for this period'}.</p>
            ) : (
              <div className="board-detail-body">
                {detailTotals && detailTotals.total > 0 && (
                  <div className="board-detail-totals">
                    {CATEGORIES.filter(c => (detailTotals[c.key] || 0) >= 0.01).map(c => (
                      <span key={c.key} className="board-total-chip">
                        <span className="board-type-dot" style={{ background: c.color }} />
                        <span className="board-total-label">{c.label}</span>
                        <span className="board-total-val hud-tnum">{fmtHours(detailTotals[c.key])}</span>
                      </span>
                    ))}
                    <span className="board-total-chip board-total-grand">
                      <span className="board-total-label">Total</span>
                      <span className="board-total-val hud-tnum">{fmtHours(detailTotals.total)}</span>
                    </span>
                  </div>
                )}
                {detailData.map(({ day, sessions }) => (
                  <div key={day} className="board-detail-day">
                    {!detail.day && <h3 className="board-detail-dayhead">{fmtDay(day)}</h3>}
                    <table className="board-detail-table">
                      <thead>
                        <tr>
                          <th>In</th><th>Out</th><th>Where</th><th>Duration</th>{isStaff && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((s, i) => (
                          <tr key={i}>
                            <td className="board-num">{fmtTime(s.inTime)}</td>
                            <td className="board-num">
                              {s.open ? <span className="board-open">— open —</span> : fmtTime(s.outTime)}
                            </td>
                            <td className="board-loc">
                              {fmtLocation(s.inLoc)}
                              {!s.open && s.outLoc && s.outLoc !== s.inLoc ? ` → ${fmtLocation(s.outLoc)}` : ''}
                            </td>
                            <td className="board-num board-total">
                              {fmtHours(s.ms / 3600000)}
                              <span className="board-cat-tag" style={{ color: categoryColor(s.category) }} title={`${categoryLabel(s.category)} hours`}> · {categoryLabel(s.category)}</span>
                              {s.manual && <span className="board-cat-tag" style={{ color: 'var(--steel)' }} title="Manual entry"> · MANUAL</span>}
                              {s.wasCapped && <span className="board-cat-tag" style={{ color: 'var(--gold-dim)' }} title="Capped at the max session length (likely a missed check-out)"> · CAPPED</span>}
                              {s.flagged && <span className="board-flag" title="Pending/auto-close review"> ⚠</span>}
                            </td>
                            {isStaff && (
                              <td className="board-num board-sess-actions">
                                <button className="board-mini-btn" onClick={() => setAdjust({ mode: 'edit', memberId: detail.memberId, name: detail.name, session: s })}>Edit</button>
                                <button className="board-mini-btn board-mini-danger" onClick={() => setAdjust({ mode: 'void', memberId: detail.memberId, name: detail.name, session: s })}>Void</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {adjust && (
        <AdjustPanel
          adjust={adjust}
          onClose={() => setAdjust(null)}
          onDone={async () => { setAdjust(null); await reloadEvents() }}
        />
      )}
    </div>
  )
}

// Staff-only manual entry / edit / void. mode 'add' inserts a matched IN/OUT pair
// (staff_add_manual_session); 'edit' patches an existing session's times +
// category (staff_edit_event, per event); 'void' deletes the session's events
// (staff_void_event). Every action requires a reason and hits the audit trail.
function AdjustPanel({ adjust, onClose, onDone }) {
  const { mode, memberId, name, session, day } = adjust
  const toLocalInput = d => {
    if (!d) return ''
    const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return t.toISOString().slice(0, 16)
  }
  const baseDay = day || new Date().toISOString().slice(0, 10)
  const [inT,  setInT]  = useState(mode === 'edit' ? toLocalInput(session.inTime)  : `${baseDay}T16:00`)
  const [outT, setOutT] = useState(mode === 'edit'
    ? (session.outTime ? toLocalInput(session.outTime) : '')
    : `${baseDay}T18:00`)
  const [cat,  setCat]  = useState(mode === 'edit' ? session.category : DEFAULT_CATEGORY)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  async function run() {
    if (!reason.trim()) { setErr('A reason is required.'); return }
    setBusy(true); setErr('')
    let error = null
    if (mode === 'add') {
      if (!inT || !outT) { setBusy(false); setErr('Both times are required.'); return }
      ;({ error } = await supabase.rpc('staff_add_manual_session', {
        p_member: memberId,
        p_in:  new Date(inT).toISOString(),
        p_out: new Date(outT).toISOString(),
        p_category: cat,
        p_reason: reason.trim(),
      }))
    } else if (mode === 'edit') {
      // Patch the IN event (time + category); patch the OUT event (time) if present.
      ;({ error } = await supabase.rpc('staff_edit_event', {
        p_event: session.inId, p_event_time: inT ? new Date(inT).toISOString() : null,
        p_category: cat, p_reason: reason.trim(),
      }))
      if (!error && session.outId && outT) {
        ;({ error } = await supabase.rpc('staff_edit_event', {
          p_event: session.outId, p_event_time: new Date(outT).toISOString(),
          p_category: null, p_reason: reason.trim(),
        }))
      }
    } else if (mode === 'void') {
      if (session.outId) {
        ;({ error } = await supabase.rpc('staff_void_event', { p_event: session.outId, p_reason: reason.trim() }))
      }
      if (!error && session.inId) {
        ;({ error } = await supabase.rpc('staff_void_event', { p_event: session.inId, p_reason: reason.trim() }))
      }
    }
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  const title = mode === 'add' ? `Add manual session — ${name}`
    : mode === 'edit' ? `Edit session — ${name}`
    : `Void session — ${name}`

  return (
    <div className="board-detail-backdrop" onClick={onClose}>
      <div className="board-adjust" onClick={e => e.stopPropagation()}>
        <div className="board-detail-head">
          <h2 className="board-detail-title">{title}</h2>
          <button className="board-detail-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {mode === 'void' ? (
          <p className="board-adjust-warn">
            This permanently deletes the session's check-in{session.outId ? ' and check-out' : ''} event(s).
            The change is recorded in the audit trail.
          </p>
        ) : (
          <>
            <div className="board-adjust-row">
              <div className="board-adjust-field">
                <label className="board-adjust-label">Check-in</label>
                <input className="board-adjust-input" type="datetime-local" value={inT} onChange={e => setInT(e.target.value)} />
              </div>
              <div className="board-adjust-field">
                <label className="board-adjust-label">Check-out</label>
                <input className="board-adjust-input" type="datetime-local" value={outT} onChange={e => setOutT(e.target.value)} />
              </div>
            </div>
            <div className="board-adjust-field">
              <label className="board-adjust-label">Category</label>
              <select className="board-adjust-input" value={cat} onChange={e => setCat(e.target.value)}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          </>
        )}

        <div className="board-adjust-field">
          <label className="board-adjust-label">Reason <span className="board-req">*</span></label>
          <input className="board-adjust-input" type="text" maxLength={300}
            placeholder="e.g. Offsite build at sponsor; no signal." value={reason}
            onChange={e => setReason(e.target.value)} />
        </div>

        {err && <p className="board-adjust-error">{err}</p>}
        <div className="board-adjust-actions">
          <button className="board-adjust-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`board-adjust-save${mode === 'void' ? ' board-adjust-danger' : ''}`} onClick={run} disabled={busy}>
            {busy ? 'Working…' : (mode === 'add' ? 'Add session' : mode === 'edit' ? 'Save changes' : 'Void session')}
          </button>
        </div>
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
