import { useState, useEffect } from 'react'
import { supabase } from './supabase'
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
    // whole query and blanks every member name. Use full_name.
    supabase.from('profiles').select('id, full_name').in('id', userIds),
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

  useEffect(() => {
    if (!isStaff) return

    supabase.from('app_settings').select('value').eq('key', 'auto_close_cutoff').single()
      .then(({ data }) => {
        const v = data?.value ?? '22:00'
        setCutoff(v)
        setCutoffSaved(v)
      })

    fetchMissedCheckouts().then(rows => setMissed(rows))

    supabase
      .from('logged_hours')
      .select('*, member:member_id(full_name)')
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

  if (missed === null || entries === null || cutoff === null) {
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
                      {r.member?.full_name || r.member?.email || 'Unknown member'}
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
                      {entry.member?.full_name || entry.member?.email || 'Unknown member'}
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

      </div>
    </div>
  )
}
