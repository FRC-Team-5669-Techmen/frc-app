import { useState, useEffect, useMemo, useRef, useId } from 'react'
import { supabase } from './supabase'
import { fmtHours, fmtLocation, CATEGORIES, categoryLabel, categoryColor } from './hoursUtils'
import {
  historyByDay, historyTotals, defaultHistorySeason, seasonRange, fmtSessionTime, fmtDayKey,
} from './attendanceHistory'
import './AttendanceHistory.css'

// The one attendance-history view: a member's stored sessions grouped by day,
// each row sign-in, sign-out (or open), where, duration and category, under a
// category totals strip. Read straight from attendance_events through
// sessionsFromEvents (see src/attendanceHistory.js), never recomputed.
//
// READ-ONLY BY ITSELF. The Team Hours drill-down passes `headActions` and
// `rowActions` to add its staff manual-entry / edit / void controls (those stay
// in HoursBoard with the panel that runs them); the presence board passes
// neither, so a history opened on a shared /display screen can never write.
export default function AttendanceHistory({
  name, subtitle, day = null, groups, loading = false, error = '',
  onClose, headActions = null, rowActions = null, covered = false,
}) {
  const titleId = useId()
  const closeRef = useRef(null)
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const coveredRef = useRef(covered)
  coveredRef.current = covered
  const totals = useMemo(() => (groups ? historyTotals(groups) : null), [groups])

  // Keyboard: focus lands on Close when the history opens, Escape closes it,
  // and focus goes back to whatever opened it (the name button on /display).
  // Escape never closes the history from under another dialog stacked over it
  // (HoursBoard's adjust panel). The caller says so with `covered`, because
  // focus alone cannot: opening the panel leaves focus on the history's own
  // "+ Manual session" / Edit / Void button, and a click on the panel's blank
  // area drops it to <body>. Focus sitting in some other dialog counts too.
  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus({ preventScroll: true })
    const onKey = e => {
      if (e.key !== 'Escape' || e.defaultPrevented || coveredRef.current) return
      const a = document.activeElement
      if (a && a !== document.body && !dialogRef.current?.contains(a)) return
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div className="ah-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="ah-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <div className="ah-head">
          <div>
            <h2 id={titleId} className="ah-title">{name}</h2>
            <p className="ah-sub hud-mono">
              {subtitle ?? (day ? fmtDayKey(day) : 'Sessions by day')}
            </p>
          </div>
          <div className="ah-head-actions">
            {headActions}
            <button ref={closeRef} type="button" className="ah-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>
        {loading ? (
          <p className="ah-empty">Loading sessions…</p>
        ) : error ? (
          <p className="ah-empty ah-error">{error}</p>
        ) : (!groups || groups.length === 0) ? (
          <p className="ah-empty">No sessions recorded{day ? ' this day' : ' for this period'}.</p>
        ) : (
          <div className="ah-body">
            {totals && totals.total > 0 && (
              <div className="ah-totals">
                {CATEGORIES.filter(c => (totals[c.key] || 0) >= 0.01).map(c => (
                  <span key={c.key} className="ah-chip">
                    <span className="ah-dot" style={{ background: c.color }} />
                    <span className="ah-chip-label">{c.label}</span>
                    <span className="ah-chip-val hud-tnum">{fmtHours(totals[c.key])}</span>
                  </span>
                ))}
                <span className="ah-chip ah-chip-grand">
                  <span className="ah-chip-label">Total</span>
                  <span className="ah-chip-val hud-tnum">{fmtHours(totals.total)}</span>
                </span>
              </div>
            )}
            {groups.map(({ day: d, sessions }) => (
              <div key={d} className="ah-day">
                {!day && <h3 className="ah-dayhead">{fmtDayKey(d)}</h3>}
                <table className="ah-table">
                  <thead>
                    <tr>
                      <th>In</th><th>Out</th><th>Where</th><th>Duration</th>{rowActions && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s, i) => (
                      <tr key={s.inId ?? i}>
                        <td className="ah-num">{fmtSessionTime(s.inTime)}</td>
                        <td className="ah-num">
                          {s.open ? <span className="ah-open">— open —</span> : fmtSessionTime(s.outTime)}
                        </td>
                        <td className="ah-loc">
                          {fmtLocation(s.inLoc)}
                          {!s.open && s.outLoc && s.outLoc !== s.inLoc ? ` → ${fmtLocation(s.outLoc)}` : ''}
                        </td>
                        <td className="ah-num ah-dur">
                          {fmtHours(s.ms / 3600000)}
                          <span className="ah-tag" style={{ color: categoryColor(s.category) }} title={`${categoryLabel(s.category)} hours`}> · {categoryLabel(s.category)}</span>
                          {s.manual && <span className="ah-tag" style={{ color: 'var(--steel)' }} title="Manual entry"> · MANUAL</span>}
                          {s.wasCapped && <span className="ah-tag" style={{ color: 'var(--gold-dim)' }} title="Capped at the max session length (likely a missed check-out)"> · CAPPED</span>}
                          {s.flagged && <span className="ah-tag ah-flag" title="Pending/auto-close review"> · REVIEW</span>}
                        </td>
                        {rowActions && <td className="ah-num ah-actions">{rowActions(s)}</td>}
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
  )
}

// One member's history, loaded on demand: the presence board's name-click.
// Reads only what Team Hours already reads (attendance_events, session_reviews,
// seasons) for this one member, and opens on the same period Team Hours opens
// on (defaultHistorySeason). Degrades the way HoursBoard does: a failed seasons
// or session_reviews read means all time / no review flags, while a failed
// attendance_events read -- the history itself -- shows its error.
//
// Newest first, so if a member's rows ever outgrow the API's row cap it is the
// oldest that fall off, not this week's. sessionsFromEvents sorts regardless.
export function MemberAttendanceHistory({ memberId, name, onClose }) {
  const [state, setState] = useState({ loading: true, error: '', groups: null, season: null })

  useEffect(() => {
    let live = true
    setState({ loading: true, error: '', groups: null, season: null })
    Promise.all([
      supabase.from('seasons').select('*').order('start_date', { ascending: false }),
      supabase.from('attendance_events')
        .select('id, user_id, type, event_time, location, category, manual_entry')
        .eq('user_id', memberId)
        .order('event_time', { ascending: false }),
      supabase.from('session_reviews').select('checkout_id').eq('user_id', memberId).in('status', ['pending', 'voided']),
    ]).then(([{ data: seas }, { data: events, error: eErr }, { data: reviews }]) => {
      if (!live) return
      if (eErr) { setState({ loading: false, error: eErr.message, groups: null, season: null }); return }
      const season = defaultHistorySeason(seas ?? [])
      const excluded = new Set((reviews ?? []).map(r => r.checkout_id))
      setState({
        loading: false, error: '', season,
        groups: historyByDay(events ?? [], { range: seasonRange(season), excluded }),
      })
    })
    return () => { live = false }
  }, [memberId])

  const period = state.loading ? '' : state.season ? ` · ${state.season.name}` : ' · All time'
  return (
    <AttendanceHistory
      name={name}
      subtitle={`Sessions by day${period}`}
      groups={state.groups}
      loading={state.loading}
      error={state.error}
      onClose={onClose}
    />
  )
}
