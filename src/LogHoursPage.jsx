import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import './LogHoursPage.css'

const TYPES = ['volunteering', 'outreach', 'competition']

const today = () => new Date().toISOString().slice(0, 10)

function fmtDate(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function LogHoursPage({ session }) {
  const [entries,    setEntries]    = useState(null)
  const [form,       setForm]       = useState({ date: today(), hours: '', type: 'volunteering', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError,  setFormError]  = useState('')
  const [deleting,   setDeleting]   = useState({})

  useEffect(() => { load() }, [session.user.id])

  async function load() {
    const { data } = await supabase
      .from('logged_hours')
      .select('*')
      .eq('member_id', session.user.id)
      .order('date', { ascending: false })
    setEntries(data ?? [])
  }

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
    setForm({ date: today(), hours: '', type: 'volunteering', description: '' })
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
                      {t.charAt(0).toUpperCase() + t.slice(1)}
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
                    <span className={`lh-type-chip lh-type-${entry.type}`}>
                      {entry.type}
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
    </div>
  )
}
