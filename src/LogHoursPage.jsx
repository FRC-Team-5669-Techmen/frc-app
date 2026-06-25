import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { CATEGORIES, DEFAULT_CATEGORY, categoryLabel, categoryColor } from './categories'
import './LogHoursPage.css'

// Manual off-site entry has no NFC tag to derive the category from, so the user
// picks it. Order per product spec: Build, Volunteer, Outreach, Competition
// (guarded against the canonical CATEGORIES set so a typo can't add a bad key).
const TYPE_ORDER = ['build', 'volunteer', 'outreach', 'competition']
const TYPES = TYPE_ORDER.filter(k => CATEGORIES.some(c => c.key === k))

const today = () => new Date().toISOString().slice(0, 10)

function fmtDate(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function LogHoursPage({ session }) {
  const [entries,    setEntries]    = useState(null)
  const [form,       setForm]       = useState({ date: today(), hours: '', type: DEFAULT_CATEGORY, description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError,  setFormError]  = useState('')
  const [deleting,   setDeleting]   = useState({})
  const [corrections, setCorrections] = useState([])  // user's logged_hours_corrections
  const [flagFor,     setFlagFor]     = useState(null) // entry being flagged for correction

  useEffect(() => { load(); loadCorrections() }, [session.user.id])

  async function load() {
    const { data } = await supabase
      .from('logged_hours')
      .select('*')
      .eq('member_id', session.user.id)
      .order('date', { ascending: false })
    setEntries(data ?? [])
  }

  async function loadCorrections() {
    const { data } = await supabase
      .from('logged_hours_corrections')
      .select('id, entry_id, status')
      .eq('member_id', session.user.id)
      .eq('status', 'pending')
    setCorrections(data ?? [])
  }

  // Entry IDs with an open correction request — hides the request button.
  const pendingCorrectionIds = new Set(corrections.map(c => c.entry_id))

  const field = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    const hrs = parseFloat(form.hours)
    if (!form.date) { setFormError('Date is required.'); return }
    if (form.date > today()) { setFormError('Date cannot be in the future.'); return }
    if (!hrs || hrs <= 0 || hrs > 24) { setFormError('Enter a valid number of hours (0.25 – 24).'); return }
    if (!form.type) { setFormError('Select a type.'); return }

    setSubmitting(true)
    const { data, error } = await supabase
      .from('logged_hours')
      .insert({
        member_id:   session.user.id,
        date:        form.date,
        hours:       hrs,
        type:        form.type,
        description: form.description.trim() || null,
        status:      'pending',
      })
      .select()
      .single()
    setSubmitting(false)

    if (error) { setFormError(error.message); return }
    setEntries(prev => [data, ...prev])
    setForm({ date: today(), hours: '', type: DEFAULT_CATEGORY, description: '' })
  }

  async function handleDelete(id) {
    setDeleting(d => ({ ...d, [id]: true }))
    const { error } = await supabase.from('logged_hours').delete().eq('id', id)
    setDeleting(d => { const n = { ...d }; delete n[id]; return n })
    if (!error) setEntries(prev => prev.filter(e => e.id !== id))
  }

  const pending  = (entries ?? []).filter(e => e.status === 'pending').length
  const verified = (entries ?? []).filter(e => e.status === 'verified')
  const totalVerified = verified.reduce((s, e) => s + parseFloat(e.hours), 0)

  return (
    <div className="lh-wrap">
      <div className="lh-body">

        {/* ── Totals summary ── */}
        {entries !== null && (entries.length > 0) && (
          <div className="lh-summary">
            <div className="lh-stat">
              <span className="lh-stat-value lh-stat-green">
                {totalVerified % 1 === 0 ? totalVerified : totalVerified.toFixed(2)}h
              </span>
              <span className="lh-stat-label">Verified</span>
            </div>
            <div className="lh-stat-divider" />
            <div className="lh-stat">
              <span className="lh-stat-value">{pending}</span>
              <span className="lh-stat-label">Pending</span>
            </div>
            <div className="lh-stat-divider" />
            <div className="lh-stat">
              <span className="lh-stat-value">{entries.length}</span>
              <span className="lh-stat-label">Entries</span>
            </div>
          </div>
        )}

        {/* ── Submission form ── */}
        <p className="lh-section-heading">Log hours</p>
        <div className="lh-form-card">
          <form onSubmit={handleSubmit} className="lh-form">
            <div className="lh-form-row">
              <div className="lh-field">
                <label className="lh-label" htmlFor="lh-date">Date</label>
                <input
                  id="lh-date"
                  type="date"
                  max={today()}
                  value={form.date}
                  onChange={field('date')}
                  className="lh-input"
                  required
                />
              </div>
              <div className="lh-field">
                <label className="lh-label" htmlFor="lh-hours">Hours</label>
                <input
                  id="lh-hours"
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  placeholder="2.5"
                  value={form.hours}
                  onChange={field('hours')}
                  className="lh-input"
                  required
                />
              </div>
              <div className="lh-field">
                <label className="lh-label" htmlFor="lh-type">Type</label>
                <select
                  id="lh-type"
                  value={form.type}
                  onChange={field('type')}
                  className="lh-select"
                  required
                >
                  {TYPES.map(t => (
                    <option key={t} value={t}>
                      {categoryLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="lh-field">
              <label className="lh-label" htmlFor="lh-desc">Description</label>
              <textarea
                id="lh-desc"
                placeholder="What did you do?"
                maxLength={500}
                rows={3}
                value={form.description}
                onChange={field('description')}
                className="lh-input lh-textarea"
              />
            </div>

            {formError && <p className="lh-form-error">{formError}</p>}

            <button type="submit" className="lh-submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </form>
        </div>

        {/* ── Entry list ── */}
        {entries === null && (
          <div className="lh-loading"><div className="lh-spinner" /></div>
        )}

        {entries !== null && entries.length > 0 && (
          <>
            <p className="lh-section-heading">My entries</p>
            <div className="lh-list-wrap">
              {entries.map(entry => (
                <div key={entry.id} className="lh-entry">
                  <div className="lh-entry-top">
                    <span className="lh-entry-date">{fmtDate(entry.date)}</span>
                    <span className="lh-type-chip" style={{ color: categoryColor(entry.type), borderColor: categoryColor(entry.type) }}>
                      {categoryLabel(entry.type)}
                    </span>
                    <span className="lh-entry-hours">
                      {parseFloat(entry.hours) % 1 === 0
                        ? parseFloat(entry.hours)
                        : parseFloat(entry.hours).toFixed(2)}h
                    </span>
                  </div>
                  {entry.description && (
                    <p className="lh-entry-desc">{entry.description}</p>
                  )}
                  <div className="lh-entry-bottom">
                    <span className={`lh-status-chip lh-status-${entry.status}`}>
                      {entry.status}
                    </span>
                    {entry.status === 'pending' && (
                      <button
                        className="lh-delete-btn"
                        disabled={!!deleting[entry.id]}
                        onClick={() => handleDelete(entry.id)}
                      >
                        {deleting[entry.id] ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                    {entry.status === 'verified' && (
                      pendingCorrectionIds.has(entry.id)
                        ? <span className="lh-corr-pending">correction pending</span>
                        : <button className="lh-corr-btn" onClick={() => setFlagFor(entry)}>
                            Request correction
                          </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {entries !== null && entries.length === 0 && (
          <p className="lh-empty">No entries yet. Log your first hours above.</p>
        )}

      </div>

      {flagFor && (
        <CorrectionModal
          entry={flagFor}
          onClose={() => setFlagFor(null)}
          onSubmitted={() => { setFlagFor(null); loadCorrections() }}
        />
      )}
    </div>
  )
}

// Member-facing form to flag a verified logged-hours entry for staff correction.
// References the logged_hours row; reason required, proposed corrected
// category/hours/date prefill from the entry's current values.
function CorrectionModal({ entry, onClose, onSubmitted }) {
  const [type, setType]   = useState(entry.type)
  const [hours, setHours] = useState(String(parseFloat(entry.hours)))
  const [date, setDate]   = useState(entry.date)
  const [reason, setReason] = useState('')
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')

  async function submit() {
    if (!reason.trim()) { setErr('Please describe what is wrong.'); return }
    const hrs = parseFloat(hours)
    if (!hrs || hrs <= 0 || hrs > 24) { setErr('Enter valid hours (0.25 – 24).'); return }
    if (date > today()) { setErr('Date cannot be in the future.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('request_logged_hours_correction', {
      p_entry: entry.id,
      p_note: reason.trim(),
      p_proposed_type:  type,
      p_proposed_hours: hrs,
      p_proposed_date:  date,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSubmitted()
  }

  return (
    <div className="lh-modal-backdrop" onClick={onClose}>
      <div className="lh-modal" onClick={e => e.stopPropagation()}>
        <div className="lh-modal-head">
          <h2 className="lh-modal-title">Request correction</h2>
          <button className="lh-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="lh-entry-desc">
          {fmtDate(entry.date)} · {categoryLabel(entry.type)} · {parseFloat(entry.hours)}h
        </p>

        <div className="lh-field">
          <label className="lh-label">What's wrong? <span className="lh-modal-req">*</span></label>
          <textarea
            className="lh-input lh-textarea"
            rows={3}
            maxLength={500}
            placeholder="e.g. This should be Outreach, not Build."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <p className="lh-section-heading" style={{ margin: '0.25rem 0 0' }}>Corrected values</p>
        <div className="lh-modal-row">
          <div className="lh-field">
            <label className="lh-label">Type</label>
            <select className="lh-select" value={type} onChange={e => setType(e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{categoryLabel(t)}</option>)}
            </select>
          </div>
          <div className="lh-field">
            <label className="lh-label">Hours</label>
            <input
              className="lh-input" type="number" min="0.25" max="24" step="0.25"
              value={hours} onChange={e => setHours(e.target.value)}
            />
          </div>
        </div>
        <div className="lh-field">
          <label className="lh-label">Date</label>
          <input
            className="lh-input" type="date" max={today()}
            value={date} onChange={e => setDate(e.target.value)}
          />
        </div>

        {err && <p className="lh-form-error">{err}</p>}
        <div className="lh-modal-actions">
          <button className="lh-modal-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="lh-submit" onClick={submit} disabled={busy}>
            {busy ? 'Sending…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  )
}
