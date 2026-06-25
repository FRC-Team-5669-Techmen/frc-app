import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import { CATEGORIES, categoryLabel } from './categories'
import { detectAnomalies } from './accountability'
import MemberHoursAdmin from './MemberHoursAdmin'
import './VerifyHoursPage.css'

// ─── formatting helpers ───────────────────────────────────────────────────────

function fmtDate(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtHours(h) {
  const n = parseFloat(h)
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(2)}h`
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

const ANOMALY_META = {
  double_in: { short: 'Double in', color: 'var(--fault)' },
  overlap:   { short: 'Overlap',   color: 'var(--fault)' },
  capped:    { short: 'Capped',    color: 'var(--gold-dim)' },
  geofence:  { short: 'Geofence',  color: 'var(--hr-outreach)' },
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return '—'
  const totalMins = Math.round(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ─── data fetching ────────────────────────────────────────────────────────────

async function fetchMissedCheckouts() {
  const { data: raw } = await supabase
    .from('session_reviews')
    .select('id, user_id, checkin_id, checkout_id, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (!raw?.length) return []

  const eventIds = raw.flatMap(r => [r.checkin_id, r.checkout_id])
  const userIds  = [...new Set(raw.map(r => r.user_id))]

  const [{ data: evts }, { data: profs }] = await Promise.all([
    supabase.from('attendance_events').select('id, event_time').in('id', eventIds),
    // email lives on auth.users, not profiles — selecting it here errors the
    // whole query and blanks every member name. Use full_name/nickname.
    supabase.from('profiles').select('id, full_name, nickname').in('id', userIds),
  ])

  const evtMap  = Object.fromEntries((evts  ?? []).map(e => [e.id, e]))
  const profMap = Object.fromEntries((profs ?? []).map(p => [p.id, p]))

  return raw.map(r => ({
    ...r,
    checkinTime:  evtMap[r.checkin_id]?.event_time,
    checkoutTime: evtMap[r.checkout_id]?.event_time,
    member:       profMap[r.user_id],
  }))
}

// Pending student correction requests, enriched with the member name and the
// referenced events' CURRENT times (so the mentor can compare to the proposal).
async function fetchCorrections() {
  const { data: raw } = await supabase
    .from('session_corrections')
    .select('id, member_id, checkin_id, checkout_id, note, proposed_in, proposed_out, proposed_category, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (!raw?.length) return []

  const eventIds = raw.flatMap(r => [r.checkin_id, r.checkout_id]).filter(Boolean)
  const userIds  = [...new Set(raw.map(r => r.member_id))]

  const [{ data: evts }, { data: profs }] = await Promise.all([
    eventIds.length
      ? supabase.from('attendance_events').select('id, event_time, category').in('id', eventIds)
      : Promise.resolve({ data: [] }),
    supabase.from('profiles').select('id, full_name, nickname').in('id', userIds),
  ])

  const evtMap  = Object.fromEntries((evts  ?? []).map(e => [e.id, e]))
  const profMap = Object.fromEntries((profs ?? []).map(p => [p.id, p]))

  return raw.map(r => ({
    ...r,
    member:       profMap[r.member_id],
    curIn:        evtMap[r.checkin_id]?.event_time ?? null,
    curOut:       evtMap[r.checkout_id]?.event_time ?? null,
    curCategory:  evtMap[r.checkin_id]?.category ?? null,
  }))
}

// Pending logged-hours correction requests, enriched with the member name and
// the referenced entry's CURRENT values (so staff can compare to the proposal).
async function fetchLoggedCorrections() {
  const { data: raw } = await supabase
    .from('logged_hours_corrections')
    .select('id, member_id, entry_id, note, proposed_type, proposed_hours, proposed_date, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (!raw?.length) return []

  const entryIds = raw.map(r => r.entry_id)
  const userIds  = [...new Set(raw.map(r => r.member_id))]

  const [{ data: lh }, { data: profs }] = await Promise.all([
    supabase.from('logged_hours').select('id, type, hours, date, description').in('id', entryIds),
    supabase.from('profiles').select('id, full_name, nickname').in('id', userIds),
  ])

  const lhMap   = Object.fromEntries((lh    ?? []).map(e => [e.id, e]))
  const profMap = Object.fromEntries((profs ?? []).map(p => [p.id, p]))

  return raw.map(r => ({
    ...r,
    member: profMap[r.member_id],
    entry:  lhMap[r.entry_id] ?? null,
  }))
}

// Advisory anomaly list across all members (never mutates anything). Pairs the
// event ledger per member with their exemption status so the geofence check is
// accurate, then flattens detectAnomalies output with member names attached.
async function fetchAnomalies() {
  const [{ data: ev }, { data: profs }] = await Promise.all([
    supabase.from('attendance_events').select('id, user_id, type, event_time, geo_ok').order('event_time'),
    supabase.from('profiles').select('id, full_name, nickname, geofence_exempt'),
  ])
  const byMember = {}
  for (const e of ev ?? []) (byMember[e.user_id] ??= []).push(e)
  const profMap = Object.fromEntries((profs ?? []).map(p => [p.id, p]))

  const out = []
  for (const [uid, events] of Object.entries(byMember)) {
    const exempt = profMap[uid]?.geofence_exempt === true
    for (const a of detectAnomalies(events, { exempt })) {
      out.push({ ...a, member: profMap[uid] })
    }
  }
  return out.sort((a, b) => new Date(b.at) - new Date(a.at))
}

// ─── component ────────────────────────────────────────────────────────────────

export default function VerifyHoursPage({ session, hasRole }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  // Missed-checkout review state
  const [missed,       setMissed]       = useState(null)
  const [missedActing, setMissedActing] = useState({})

  // Auto-close cutoff setting
  const [cutoff,      setCutoff]      = useState(null)
  const [cutoffSaved, setCutoffSaved] = useState(null)
  const [cutoffBusy,  setCutoffBusy]  = useState(false)

  // Existing logged-hours pending entries
  const [entries, setEntries] = useState(null)
  const [acting,  setActing]  = useState({})

  // Student correction requests (derived attendance sessions)
  const [corrections, setCorrections] = useState(null)

  // Member correction requests (manual logged_hours entries)
  const [loggedCorrections, setLoggedCorrections] = useState(null)

  // Advisory attendance anomalies
  const [anomalies, setAnomalies] = useState(null)

  useEffect(() => {
    if (!isStaff) return

    supabase.from('app_settings').select('value').eq('key', 'auto_close_cutoff').single()
      .then(({ data }) => {
        const v = data?.value ?? '22:00'
        setCutoff(v)
        setCutoffSaved(v)
      })

    fetchMissedCheckouts().then(rows => setMissed(rows))
    fetchCorrections().then(rows => setCorrections(rows))
    fetchLoggedCorrections().then(rows => setLoggedCorrections(rows))
    fetchAnomalies().then(rows => setAnomalies(rows))

    supabase
      .from('logged_hours')
      .select('*, member:member_id(full_name, nickname)')
      .eq('status', 'pending')
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .then(({ data }) => setEntries(data ?? []))
  }, [isStaff]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Missed-checkout actions ─────────────────────────────────────────────────

  async function handleMissed(id, newStatus) {
    setMissedActing(a => ({ ...a, [id]: newStatus }))
    await supabase.from('session_reviews').update({
      status:      newStatus,
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    setMissedActing(a => { const n = { ...a }; delete n[id]; return n })
    setMissed(prev => prev.filter(r => r.id !== id))
  }

  // ── Cutoff setting ──────────────────────────────────────────────────────────

  async function saveCutoff() {
    if (!cutoff || cutoff === cutoffSaved) return
    setCutoffBusy(true)
    await supabase.from('app_settings')
      .update({ value: cutoff, updated_at: new Date().toISOString() })
      .eq('key', 'auto_close_cutoff')
    setCutoffSaved(cutoff)
    setCutoffBusy(false)
  }

  // ── Logged-hours actions ────────────────────────────────────────────────────

  async function act(id, action) {
    setActing(a => ({ ...a, [id]: action }))
    const now   = new Date().toISOString()
    const patch  = action === 'approve'
      ? { status: 'verified', verified_by: session.user.id, verified_at: now }
      : { status: 'rejected' }
    const { error } = await supabase.from('logged_hours').update(patch).eq('id', id)
    setActing(a => { const n = { ...a }; delete n[id]; return n })
    if (!error) setEntries(prev => prev.filter(e => e.id !== id))
  }

  // ── Guard ───────────────────────────────────────────────────────────────────

  if (!isStaff) {
    return (
      <div className="vh-wrap">
        <div className="vh-denied">You need a staff role to access this page.</div>
      </div>
    )
  }

  async function resolveCorrection(id, approve, payload) {
    const { error } = await supabase.rpc('resolve_session_correction', {
      p_id: id,
      p_approve: approve,
      p_resolution: payload?.resolution || null,
      p_apply_in:  payload?.apply_in  || null,
      p_apply_out: payload?.apply_out || null,
      p_apply_category: payload?.apply_category || null,
    })
    if (!error) setCorrections(prev => prev.filter(c => c.id !== id))
    return error
  }

  async function resolveLoggedCorrection(id, approve, payload) {
    const { error } = await supabase.rpc('resolve_logged_hours_correction', {
      p_id: id,
      p_approve: approve,
      p_resolution: payload?.resolution || null,
      p_apply_type:  payload?.apply_type  || null,
      p_apply_hours: payload?.apply_hours ?? null,
      p_apply_date:  payload?.apply_date  || null,
    })
    if (!error) setLoggedCorrections(prev => prev.filter(c => c.id !== id))
    return error
  }

  if (missed === null || entries === null || cutoff === null || corrections === null || loggedCorrections === null) {
    return (
      <div className="vh-wrap">
        <div className="vh-loading"><div className="vh-spinner" /></div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="vh-wrap">
      <div className="vh-body">

        {/* ── Per-member hours management (edit/add/delete + adjustments) ── */}
        <div className="vh-header">
          <span className="vh-title">Member Hours Management</span>
        </div>
        <p className="vh-anom-note">
          Pick a member to edit/delete their logged hours, add/edit/delete attendance events
          (sessions recompute automatically), or post a labeled hour adjustment.
        </p>
        <MemberHoursAdmin />

        <div className="vh-section-divider" />

        {/* ── Missed checkouts ── */}
        <div className="vh-section-header">
          <div className="vh-header">
            <span className="vh-title">Missed Checkouts</span>
            {missed.length > 0 && (
              <span className="vh-badge">{missed.length}</span>
            )}
          </div>
          <div className="vh-cutoff-row">
            <label className="vh-cutoff-label" htmlFor="cutoff-input">Auto-close at</label>
            <input
              id="cutoff-input"
              type="time"
              className="vh-cutoff-input"
              value={cutoff}
              onChange={e => setCutoff(e.target.value)}
            />
            <button
              className="vh-cutoff-save"
              onClick={saveCutoff}
              disabled={cutoffBusy || cutoff === cutoffSaved}
            >
              {cutoffBusy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {missed.length === 0 ? (
          <div className="vh-empty">
            <span className="vh-empty-mark">✓</span>
            <p className="vh-empty-text">No missed checkouts to review.</p>
          </div>
        ) : (
          <div className="vh-list">
            {missed.map(r => {
              const busy = missedActing[r.id]
              const durationMs = r.checkinTime && r.checkoutTime
                ? new Date(r.checkoutTime) - new Date(r.checkinTime)
                : 0
              return (
                <div key={r.id} className={`vh-card${busy ? ' vh-card-busy' : ''}`}>
                  <div className="vh-card-top">
                    <span className="vh-member-name">
                      {displayName(r.member)}
                    </span>
                    <span className="vh-hours">{fmtDuration(durationMs)}</span>
                  </div>
                  <div className="vh-session-times">
                    <div className="vh-time-row">
                      <span className="vh-time-label">Checked in</span>
                      <span className="vh-time-val">{fmtDateTime(r.checkinTime)}</span>
                    </div>
                    <div className="vh-time-row">
                      <span className="vh-time-label">Auto-closed</span>
                      <span className="vh-time-val">{fmtDateTime(r.checkoutTime)}</span>
                    </div>
                  </div>
                  <div className="vh-actions">
                    <button
                      className="vh-btn vh-reject"
                      disabled={!!busy}
                      onClick={() => handleMissed(r.id, 'voided')}
                    >
                      {busy === 'voided' ? 'Voiding…' : 'Void'}
                    </button>
                    <button
                      className="vh-btn vh-approve"
                      disabled={!!busy}
                      onClick={() => handleMissed(r.id, 'approved')}
                    >
                      {busy === 'approved' ? 'Approving…' : 'Approve'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="vh-section-divider" />

        {/* ── Session correction requests ── */}
        <div className="vh-header">
          <span className="vh-title">Correction Requests</span>
          {corrections.length > 0 && <span className="vh-badge">{corrections.length}</span>}
        </div>

        {corrections.length === 0 ? (
          <div className="vh-empty">
            <span className="vh-empty-mark">✓</span>
            <p className="vh-empty-text">No correction requests to review.</p>
          </div>
        ) : (
          <div className="vh-list">
            {corrections.map(c => (
              <CorrectionCard key={c.id} c={c} onResolve={resolveCorrection} />
            ))}
          </div>
        )}

        <div className="vh-section-divider" />

        {/* ── Logged-hours correction requests ── */}
        <div className="vh-header">
          <span className="vh-title">Logged-Hours Corrections</span>
          {loggedCorrections.length > 0 && <span className="vh-badge">{loggedCorrections.length}</span>}
        </div>

        {loggedCorrections.length === 0 ? (
          <div className="vh-empty">
            <span className="vh-empty-mark">✓</span>
            <p className="vh-empty-text">No logged-hours corrections to review.</p>
          </div>
        ) : (
          <div className="vh-list">
            {loggedCorrections.map(c => (
              <LoggedCorrectionCard key={c.id} c={c} onResolve={resolveLoggedCorrection} />
            ))}
          </div>
        )}

        <div className="vh-section-divider" />

        {/* ── Pending logged hours ── */}
        <div className="vh-header">
          <span className="vh-title">Pending Hours</span>
          {entries.length > 0 && (
            <span className="vh-badge">{entries.length}</span>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="vh-empty">
            <span className="vh-empty-mark">✓</span>
            <p className="vh-empty-text">All caught up — no entries pending review.</p>
          </div>
        ) : (
          <div className="vh-list">
            {entries.map(entry => {
              const busy = acting[entry.id]
              return (
                <div key={entry.id} className={`vh-card${busy ? ' vh-card-busy' : ''}`}>
                  <div className="vh-card-top">
                    <span className="vh-member-name">
                      {displayName(entry.member)}
                    </span>
                    <span className="vh-meta-right">
                      <span className={`vh-type-chip vh-type-${entry.type}`}>{entry.type}</span>
                      <span className="vh-hours">{fmtHours(entry.hours)}</span>
                    </span>
                  </div>

                  <div className="vh-card-date">{fmtDate(entry.date)}</div>

                  {entry.description && (
                    <p className="vh-desc">{entry.description}</p>
                  )}

                  <div className="vh-actions">
                    <button
                      className="vh-btn vh-reject"
                      disabled={!!busy}
                      onClick={() => act(entry.id, 'reject')}
                    >
                      {busy === 'reject' ? 'Rejecting…' : 'Reject'}
                    </button>
                    <button
                      className="vh-btn vh-approve"
                      disabled={!!busy}
                      onClick={() => act(entry.id, 'approve')}
                    >
                      {busy === 'approve' ? 'Approving…' : 'Approve'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="vh-section-divider" />

        {/* ── Attendance anomalies (advisory — nothing is auto-changed) ── */}
        <div className="vh-header">
          <span className="vh-title">Attendance Anomalies</span>
          {anomalies?.length > 0 && <span className="vh-badge">{anomalies.length}</span>}
        </div>
        <p className="vh-anom-note">
          Advisory review only — nothing is auto-deleted. Fix via Team Hours → a member's sessions (edit / void / manual entry).
        </p>

        {anomalies === null ? (
          <div className="vh-loading"><div className="vh-spinner" /></div>
        ) : anomalies.length === 0 ? (
          <div className="vh-empty">
            <span className="vh-empty-mark">✓</span>
            <p className="vh-empty-text">No anomalies detected.</p>
          </div>
        ) : (
          <div className="vh-list">
            {anomalies.map((a, i) => {
              const meta = ANOMALY_META[a.kind] ?? { short: a.kind, color: 'var(--steel)' }
              return (
                <div key={i} className="vh-card vh-anom-card">
                  <div className="vh-card-top">
                    <span className="vh-member-name">{displayName(a.member)}</span>
                    <span className="vh-anom-kind" style={{ color: meta.color, borderColor: meta.color }}>{meta.short}</span>
                  </div>
                  <p className="vh-desc">{a.detail}</p>
                  <div className="vh-time-row">
                    <span className="vh-time-label">{a.label}</span>
                    <span className="vh-time-val">{fmtDateTime(a.at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}

// One pending session-correction request. The mentor can tweak the corrected
// in/out/category (prefilled from the student's proposal, else the current
// values) before approving; approval applies the change to the underlying
// events and audits it. Reject records the decision with an optional note.
function CorrectionCard({ c, onResolve }) {
  const toLocalInput = iso => {
    if (!iso) return ''
    const d = new Date(iso)
    const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return t.toISOString().slice(0, 16)
  }
  const [applyIn,  setApplyIn]  = useState(toLocalInput(c.proposed_in  ?? c.curIn))
  const [applyOut, setApplyOut] = useState(toLocalInput(c.proposed_out ?? c.curOut))
  const [applyCat, setApplyCat] = useState(c.proposed_category ?? c.curCategory ?? '')
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState(null)
  const [err,  setErr]  = useState('')

  async function go(approve) {
    setBusy(approve ? 'approve' : 'reject'); setErr('')
    const error = await onResolve(c.id, approve, approve ? {
      resolution: resolution.trim() || null,
      apply_in:  applyIn  ? new Date(applyIn).toISOString()  : null,
      apply_out: applyOut ? new Date(applyOut).toISOString() : null,
      apply_category: applyCat || null,
    } : { resolution: resolution.trim() || null })
    if (error) { setBusy(null); setErr(error.message) }
  }

  return (
    <div className={`vh-card${busy ? ' vh-card-busy' : ''}`}>
      <div className="vh-card-top">
        <span className="vh-member-name">{displayName(c.member)}</span>
        <span className="vh-hours">{c.checkin_id && c.checkout_id ? 'session' : c.checkin_id ? 'check-in' : 'check-out'}</span>
      </div>
      <p className="vh-desc">{c.note}</p>

      <div className="vh-corr-cur">
        <span className="vh-time-label">Current</span>
        <span className="vh-time-val">
          {fmtDateTime(c.curIn)} → {c.curOut ? fmtDateTime(c.curOut) : '— open —'}
          {c.curCategory ? ` · ${categoryLabel(c.curCategory)}` : ''}
        </span>
      </div>

      <div className="vh-corr-grid">
        <div className="vh-corr-field">
          <label className="vh-time-label">Apply check-in</label>
          <input className="vh-corr-input" type="datetime-local" value={applyIn} onChange={e => setApplyIn(e.target.value)} />
        </div>
        <div className="vh-corr-field">
          <label className="vh-time-label">Apply check-out</label>
          <input className="vh-corr-input" type="datetime-local" value={applyOut} onChange={e => setApplyOut(e.target.value)} />
        </div>
        <div className="vh-corr-field">
          <label className="vh-time-label">Category</label>
          <select className="vh-corr-input" value={applyCat} onChange={e => setApplyCat(e.target.value)}>
            <option value="">— unchanged —</option>
            {CATEGORIES.map(cat => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
          </select>
        </div>
      </div>

      <input className="vh-corr-input vh-corr-resolution" type="text" maxLength={300}
        placeholder="Optional note to the student…" value={resolution}
        onChange={e => setResolution(e.target.value)} />

      {err && <p className="vh-corr-error">{err}</p>}
      <div className="vh-actions">
        <button className="vh-btn vh-reject" disabled={!!busy} onClick={() => go(false)}>
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
        <button className="vh-btn vh-approve" disabled={!!busy} onClick={() => go(true)}>
          {busy === 'approve' ? 'Approving…' : 'Approve & apply'}
        </button>
      </div>
    </div>
  )
}

// One pending logged-hours correction request. Staff can tweak the corrected
// category / hours / date (prefilled from the member's proposal, else the
// entry's current values) before approving; approval applies the change to the
// underlying logged_hours row. Reject records the decision with an optional note.
function LoggedCorrectionCard({ c, onResolve }) {
  const cur = c.entry
  const [applyType,  setApplyType]  = useState(c.proposed_type  ?? cur?.type  ?? '')
  const [applyHours, setApplyHours] = useState(String(parseFloat(c.proposed_hours ?? cur?.hours ?? '')))
  const [applyDate,  setApplyDate]  = useState(c.proposed_date  ?? cur?.date  ?? '')
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState(null)
  const [err,  setErr]  = useState('')

  async function go(approve) {
    setBusy(approve ? 'approve' : 'reject'); setErr('')
    const hrs = parseFloat(applyHours)
    const error = await onResolve(c.id, approve, approve ? {
      resolution:  resolution.trim() || null,
      apply_type:  applyType || null,
      apply_hours: hrs > 0 ? hrs : null,
      apply_date:  applyDate || null,
    } : { resolution: resolution.trim() || null })
    if (error) { setBusy(null); setErr(error.message) }
  }

  return (
    <div className={`vh-card${busy ? ' vh-card-busy' : ''}`}>
      <div className="vh-card-top">
        <span className="vh-member-name">{displayName(c.member)}</span>
        <span className="vh-hours">logged hours</span>
      </div>
      <p className="vh-desc">{c.note}</p>

      <div className="vh-corr-cur">
        <span className="vh-time-label">Current</span>
        <span className="vh-time-val">
          {cur
            ? `${fmtDate(cur.date)} · ${categoryLabel(cur.type)} · ${fmtHours(cur.hours)}`
            : '— entry removed —'}
        </span>
      </div>

      <div className="vh-corr-grid">
        <div className="vh-corr-field">
          <label className="vh-time-label">Category</label>
          <select className="vh-corr-input" value={applyType} onChange={e => setApplyType(e.target.value)}>
            {CATEGORIES.map(cat => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
          </select>
        </div>
        <div className="vh-corr-field">
          <label className="vh-time-label">Hours</label>
          <input className="vh-corr-input" type="number" min="0.25" max="24" step="0.25"
            value={applyHours} onChange={e => setApplyHours(e.target.value)} />
        </div>
        <div className="vh-corr-field">
          <label className="vh-time-label">Date</label>
          <input className="vh-corr-input" type="date" value={applyDate} onChange={e => setApplyDate(e.target.value)} />
        </div>
      </div>

      <input className="vh-corr-input vh-corr-resolution" type="text" maxLength={300}
        placeholder="Optional note to the member…" value={resolution}
        onChange={e => setResolution(e.target.value)} />

      {err && <p className="vh-corr-error">{err}</p>}
      <div className="vh-actions">
        <button className="vh-btn vh-reject" disabled={!!busy} onClick={() => go(false)}>
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
        <button className="vh-btn vh-approve" disabled={!!busy} onClick={() => go(true)}>
          {busy === 'approve' ? 'Approving…' : 'Approve & apply'}
        </button>
      </div>
    </div>
  )
}
