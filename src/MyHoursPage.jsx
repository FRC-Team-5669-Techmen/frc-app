import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { fmtHours, buildBreakdown, computePendingMs, sumBreakdown, sessionsFromEvents, CATEGORIES, categoryLabel, categoryColor, DEFAULT_CATEGORY } from './hoursUtils'
import { effectiveGoal, goalCategoryKeys, hoursTowardGoal, daysPresent } from './accountability'
import './MyHoursPage.css'

const DAY_MS = 86_400_000
const fmtSessionDate = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtClock = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export default function MyHoursPage({ session }) {
  const [seasons,  setSeasons]  = useState(null)
  const [events,   setEvents]   = useState(null)
  const [logged,   setLogged]   = useState(null)
  const [reviews,  setReviews]  = useState(null)  // user's session_reviews rows
  const [corrections, setCorrections] = useState([]) // user's session_corrections
  const [goals,    setGoals]    = useState([])    // hour_goals (team default + own override)
  const [adjustments, setAdjustments] = useState([]) // staff hour_adjustments for this member
  const [flagFor,  setFlagFor]  = useState(null)  // session being flagged for correction

  function loadCorrections(uid) {
    return supabase.from('session_corrections')
      .select('id, checkin_id, checkout_id, note, status, resolution_note, created_at')
      .eq('member_id', uid)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCorrections(data ?? []))
  }

  useEffect(() => {
    const uid = session.user.id
    Promise.all([
      supabase.from('seasons').select('*').order('start_date', { ascending: false }),
      supabase.from('attendance_events').select('id, type, event_time, category, manual_entry').eq('user_id', uid).order('event_time'),
      supabase.from('logged_hours').select('type, hours, date').eq('member_id', uid).eq('status', 'verified'),
      supabase.from('session_reviews').select('checkout_id, status').eq('user_id', uid).in('status', ['pending', 'voided']),
      supabase.from('hour_goals').select('member_id, season_id, target_hours, categories'),
      supabase.from('hour_adjustments').select('id, category, hours, reason, created_at').eq('member_id', uid).order('created_at', { ascending: false }),
    ]).then(([{ data: s }, { data: ae }, { data: lh }, { data: sr }, { data: hg }, { data: adj }]) => {
      setSeasons(s ?? [])
      setEvents(ae ?? [])
      setLogged(lh ?? [])
      setReviews(sr ?? [])
      setGoals(hg ?? [])
      setAdjustments(adj ?? [])
    })
    loadCorrections(uid)
  }, [session.user.id])

  // Checkout/checkin IDs that already have an open (pending) correction request.
  const flaggedIds = useMemo(() => {
    const s = new Set()
    for (const c of corrections) {
      if (c.status !== 'pending') continue
      if (c.checkin_id)  s.add(c.checkin_id)
      if (c.checkout_id) s.add(c.checkout_id)
    }
    return s
  }, [corrections])

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
      ? buildBreakdown(seasons, events, logged, excludedIds, adjustments)
      : null,
    [seasons, events, logged, excludedIds, adjustments]
  )

  const pendingMs = useMemo(
    () => events && pendingIds ? computePendingMs(events, pendingIds) : 0,
    [events, pendingIds]
  )

  // All-time totals per type (across every season).
  const allTime = useMemo(() => breakdown ? sumBreakdown(breakdown) : null, [breakdown])

  // Active-season goal progress: effective goal (own override else team default),
  // hours toward it (only the goal's categories), and days present this season.
  const goalProgress = useMemo(() => {
    if (!seasons || !breakdown || !events) return null
    const today = new Date().toISOString().slice(0, 10)
    const active = seasons.find(s => s.start_date <= today && (s.end_date == null || s.end_date >= today))
    if (!active) return null
    const goal = effectiveGoal(goals, session.user.id, active.id)
    if (!goal || !(goal.target_hours > 0)) return null
    const hours = hoursTowardGoal(breakdown[active.id], goal)
    const days  = daysPresent(events, { since: active.start_date, until: active.end_date ?? today })
    return {
      season: active, target: goal.target_hours, hours, days,
      pct: Math.min(100, (hours / goal.target_hours) * 100),
      met: hours >= goal.target_hours,
      catKeys: goalCategoryKeys(goal),
      allCats: !goal.categories?.length,
    }
  }, [seasons, breakdown, events, goals, session.user.id])

  // Sessions newest-first, with the pending/voided flag for display.
  const sessions = useMemo(() => events ? sessionsFromEvents(events) : [], [events])
  const recent = useMemo(
    () => [...sessions].reverse().slice(0, 8).map(s => ({
      ...s,
      pending: s.outId ? !!pendingIds?.has(s.outId) : false,
      flagged: (s.inId && flaggedIds.has(s.inId)) || (s.outId && flaggedIds.has(s.outId)),
    })),
    [sessions, pendingIds, flaggedIds]
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
  const typeMax = allTime ? Math.max(...CATEGORIES.map(t => allTime[t.key] || 0), 0.01) : 0.01

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

        {goalProgress && (
          <div className="mh-card">
            <div className="mh-card-head">
              <span className="mh-card-title">Season goal</span>
              <span className="mh-card-sub">{goalProgress.season.name}</span>
            </div>
            <div className="mh-goal-row">
              <span className="mh-goal-nums hud-tnum">
                {fmtHours(goalProgress.hours)} <span className="mh-goal-of">of {fmtHours(goalProgress.target)}</span>
              </span>
              <span className={`mh-goal-state ${goalProgress.met ? 'mh-goal-met' : 'mh-goal-behind'}`}>
                {goalProgress.met ? '✓ Goal met' : `${fmtHours(goalProgress.target - goalProgress.hours)} to go`}
              </span>
            </div>
            <div className="mh-goal-track">
              <span className="mh-goal-fill" style={{ width: `${goalProgress.pct}%` }} />
            </div>
            <div className="mh-goal-meta">
              <span>{goalProgress.allCats ? 'All categories count' : `Counts: ${goalProgress.catKeys.map(categoryLabel).join(', ')}`}</span>
              <span className="mh-goal-days" title="Distinct days you checked in this season — tracked separately from hours">
                {goalProgress.days} day{goalProgress.days === 1 ? '' : 's'} present
              </span>
            </div>
          </div>
        )}

        {corrections.length > 0 && (
          <div className="mh-card">
            <div className="mh-card-head">
              <span className="mh-card-title">Correction requests</span>
            </div>
            <ul className="mh-corrections">
              {corrections.slice(0, 6).map(c => (
                <li key={c.id} className="mh-correction">
                  <span className={`mh-corr-status mh-corr-${c.status}`}>{c.status}</span>
                  <span className="mh-corr-note">{c.note}</span>
                  {c.resolution_note && <span className="mh-corr-resolution">“{c.resolution_note}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {adjustments.length > 0 && (
          <div className="mh-card">
            <div className="mh-card-head">
              <span className="mh-card-title">Hour adjustments</span>
              <span className="mh-card-sub">Staff corrections</span>
            </div>
            <ul className="mh-adjustments">
              {adjustments.map(a => (
                <li key={a.id} className="mh-adjustment">
                  <span className="mh-type-dot" style={{ background: categoryColor(a.category) }} />
                  <span className="mh-adj-cat">{categoryLabel(a.category)}</span>
                  <span className={`mh-adj-amt ${a.hours >= 0 ? 'mh-adj-credit' : 'mh-adj-debit'}`}>
                    {a.hours >= 0 ? '+' : '−'}{fmtHours(Math.abs(a.hours))}
                  </span>
                  <span className="mh-adj-reason">{a.reason}</span>
                  <span className="mh-adj-date hud-mono">{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {grandTotal >= 0.01 && allTime && (
          <>
            {/* All-time breakdown by hour type */}
            <div className="mh-card">
              <div className="mh-card-head">
                <span className="mh-card-title">By category</span>
                <span className="mh-card-sub">All time</span>
              </div>
              <div className="mh-types">
                {CATEGORIES.filter(t => (allTime[t.key] || 0) >= 0.01).map(t => (
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
                      {s.category !== DEFAULT_CATEGORY && (
                        <span className="mh-session-flag" style={{ color: categoryColor(s.category) }}>{categoryLabel(s.category)}</span>
                      )}
                      {s.manual && <span className="mh-session-flag" style={{ color: 'var(--steel)' }}>manual</span>}
                      {s.wasCapped && <span className="mh-session-flag" style={{ color: 'var(--gold-dim)' }} title="Capped — exceeded the max session length (likely a missed check-out)">capped</span>}
                      {s.pending && <span className="mh-session-flag">review</span>}
                      {s.flagged
                        ? <span className="mh-session-flag" style={{ color: 'var(--gold)' }}>flagged</span>
                        : (s.inId || s.outId) && (
                          <button className="mh-session-flagbtn" onClick={() => setFlagFor(s)} title="Report a problem with this session">flag</button>
                        )}
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
              {CATEGORIES.filter(t => (b[t.key] || 0) >= 0.01).map(t => (
                <BreakdownRow key={t.key} color={t.color} label={t.label} value={fmtHours(b[t.key])} />
              ))}
            </div>
          </div>
        ))}

      </div>

      {flagFor && (
        <FlagModal
          session={flagFor}
          onClose={() => setFlagFor(null)}
          onSubmitted={() => { setFlagFor(null); loadCorrections(session.user.id) }}
        />
      )}
    </div>
  )
}

// Student-facing form to flag a wrong derived session for mentor correction.
// References the underlying attendance_events row(s); note required, proposed
// corrected times/category optional.
function FlagModal({ session, onClose, onSubmitted }) {
  const toLocalInput = d => {
    if (!d) return ''
    const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return t.toISOString().slice(0, 16)
  }
  const [note, setNote] = useState('')
  const [inT, setInT]   = useState(toLocalInput(session.inTime))
  const [outT, setOutT] = useState(session.outTime ? toLocalInput(session.outTime) : '')
  const [cat, setCat]   = useState(session.category)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  async function submit() {
    if (!note.trim()) { setErr('Please describe what is wrong.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('request_session_correction', {
      p_checkin: session.inId ?? null,
      p_checkout: session.outId ?? null,
      p_note: note.trim(),
      p_proposed_in:  inT  ? new Date(inT).toISOString()  : null,
      p_proposed_out: outT ? new Date(outT).toISOString() : null,
      p_proposed_category: cat || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSubmitted()
  }

  return (
    <div className="mh-modal-backdrop" onClick={onClose}>
      <div className="mh-modal" onClick={e => e.stopPropagation()}>
        <div className="mh-modal-head">
          <h2 className="mh-modal-title">Flag this session</h2>
          <button className="mh-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="mh-modal-sub hud-mono">
          {fmtSessionDate(session.inTime)} · {fmtClock(session.inTime)} – {session.outTime ? fmtClock(session.outTime) : 'open'}
        </p>
        <label className="mh-modal-label">What's wrong? <span className="mh-req">*</span></label>
        <textarea className="mh-modal-input mh-modal-textarea" rows={3} maxLength={500}
          placeholder="e.g. I forgot to sign out — I actually left at 6:30." value={note}
          onChange={e => setNote(e.target.value)} />
        <p className="mh-modal-hint">Optional — suggest the correct values:</p>
        <div className="mh-modal-row">
          <div className="mh-modal-field">
            <label className="mh-modal-label">Check-in</label>
            <input className="mh-modal-input" type="datetime-local" value={inT} onChange={e => setInT(e.target.value)} />
          </div>
          <div className="mh-modal-field">
            <label className="mh-modal-label">Check-out</label>
            <input className="mh-modal-input" type="datetime-local" value={outT} onChange={e => setOutT(e.target.value)} />
          </div>
        </div>
        <div className="mh-modal-field">
          <label className="mh-modal-label">Category</label>
          <select className="mh-modal-input" value={cat} onChange={e => setCat(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        {err && <p className="mh-modal-error">{err}</p>}
        <div className="mh-modal-actions">
          <button className="mh-modal-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="mh-modal-submit" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Submit request'}</button>
        </div>
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
