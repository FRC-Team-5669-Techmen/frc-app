import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { fmtHours } from './hoursUtils'
import './ReadinessPage.css'

const timeStr = ts =>
  new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export default function ReadinessPage({ hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('readiness_summary')
    setLoading(false)
    if (error) { setError(error.message); return }
    setError('')
    setData(data)
  }, [])

  useEffect(() => { if (isStaff) load() }, [isStaff, load])

  if (!isStaff) {
    return <div className="rd-wrap"><div className="rd-denied">Staff access only.</div></div>
  }

  if (loading && !data) {
    return <div className="rd-loading"><div className="rd-spinner" /></div>
  }

  if (error && !data) {
    return (
      <div className="rd-wrap">
        <div className="rd-body">
          <p className="rd-error">{error}</p>
          <button className="rd-refresh" onClick={load}>Try again</button>
        </div>
      </div>
    )
  }

  const { live_presence = [], pulse_7d = {}, cert_readiness = [], project_staffing = [], action_queue = {} } = data ?? {}
  const queue = action_queue

  return (
    <div className="rd-wrap">
      <div className="rd-body">

        <div className="rd-header">
          <h1 className="rd-title">Readiness</h1>
          <button className="rd-refresh" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && <p className="rd-error" onClick={() => setError('')}>{error}</p>}

        {/* ── Action queue: prominent outstanding total ── */}
        <div className="rd-card rd-queue-card">
          <div className="rd-queue-total">
            <span className="rd-queue-num">{queue.total ?? 0}</span>
            <span className="rd-queue-label">items waiting on staff</span>
          </div>
          <div className="rd-queue-buckets">
            <Link to="/verify-hours" className="rd-bucket">
              <span className="rd-bucket-count">{queue.hours_pending?.length ?? 0}</span>
              <span className="rd-bucket-name">Hours to verify</span>
            </Link>
            <Link to="/jobs" className="rd-bucket">
              <span className="rd-bucket-count">{queue.tasks_pending?.length ?? 0}</span>
              <span className="rd-bucket-name">Jobs to sign off</span>
            </Link>
            <Link to="/roster" className="rd-bucket">
              <span className="rd-bucket-count">{queue.roster_pending?.length ?? 0}</span>
              <span className="rd-bucket-name">Roster approvals</span>
            </Link>
          </div>
          {(queue.hours_pending?.length || queue.tasks_pending?.length || queue.roster_pending?.length) ? (
            <div className="rd-queue-lists">
              {queue.roster_pending?.length > 0 && (
                <div className="rd-queue-list">
                  <Link to="/roster" className="rd-queue-list-head">Roster approvals</Link>
                  {queue.roster_pending.map(r => (
                    <div key={r.id} className="rd-queue-item">{r.name || r.email}</div>
                  ))}
                </div>
              )}
              {queue.tasks_pending?.length > 0 && (
                <div className="rd-queue-list">
                  <Link to="/jobs" className="rd-queue-list-head">Jobs to sign off</Link>
                  {queue.tasks_pending.map(t => (
                    <div key={t.id} className="rd-queue-item">
                      {t.title}{t.subteam && <span className="rd-tag">{t.subteam}</span>}
                    </div>
                  ))}
                </div>
              )}
              {queue.hours_pending?.length > 0 && (
                <div className="rd-queue-list">
                  <Link to="/verify-hours" className="rd-queue-list-head">Hours to verify</Link>
                  {queue.hours_pending.map(h => (
                    <div key={h.id} className="rd-queue-item">
                      {h.name} · {fmtHours(parseFloat(h.hours))} {h.type}
                      <span className="rd-tag">{h.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="rd-clear">All clear.</p>
          )}
        </div>

        <div className="rd-grid">

          {/* ── Live presence ── */}
          <div className="rd-card">
            <h2 className="rd-card-title">Checked in now <span className="rd-count">{live_presence.length}</span></h2>
            {live_presence.length === 0
              ? <p className="rd-muted">Nobody is checked in right now.</p>
              : <ul className="rd-list">
                  {live_presence.map(m => (
                    <li key={m.member_id} className="rd-row">
                      <span className="rd-row-name">{m.name || '—'}</span>
                      <span className="rd-row-meta">since {timeStr(m.since)}</span>
                    </li>
                  ))}
                </ul>}
          </div>

          {/* ── 7-day pulse ── */}
          <div className="rd-card">
            <h2 className="rd-card-title">7-day pulse</h2>
            <div className="rd-stats">
              <div className="rd-stat">
                <span className="rd-stat-num">{fmtHours(parseFloat(pulse_7d.total_hours ?? 0))}</span>
                <span className="rd-stat-label">build hours</span>
              </div>
              <div className="rd-stat">
                <span className="rd-stat-num">{pulse_7d.active_count ?? 0}</span>
                <span className="rd-stat-label">active members</span>
              </div>
              <div className="rd-stat">
                <span className={`rd-stat-num${(pulse_7d.at_risk?.length ?? 0) > 0 ? ' rd-danger' : ''}`}>
                  {pulse_7d.at_risk?.length ?? 0}
                </span>
                <span className="rd-stat-label">at risk (7+ days out)</span>
              </div>
            </div>
            {pulse_7d.at_risk?.length > 0 && (
              <div className="rd-atrisk">
                {pulse_7d.at_risk.map(m => (
                  <span key={m.member_id} className="rd-atrisk-chip">{m.name || '—'}</span>
                ))}
              </div>
            )}
          </div>

          {/* ── Cert readiness ── */}
          <div className="rd-card">
            <h2 className="rd-card-title">Safety cert coverage</h2>
            {cert_readiness.length === 0
              ? <p className="rd-muted">No safety-critical skills defined.</p>
              : <ul className="rd-list">
                  {cert_readiness.map(s => (
                    <li key={s.skill_id} className="rd-row">
                      <span className="rd-row-name">{s.name}</span>
                      <span className={`rd-cert-count${s.low ? ' rd-cert-low' : ''}`}>
                        {s.certified_count} certified
                      </span>
                    </li>
                  ))}
                </ul>}
          </div>

          {/* ── Project staffing ── */}
          <div className="rd-card">
            <h2 className="rd-card-title">Project staffing</h2>
            {project_staffing.length === 0
              ? <p className="rd-muted">No jobs posted yet.</p>
              : <div className="rd-staffing">
                  {project_staffing.map(st => (
                    <div key={st.subteam} className="rd-staff-row">
                      <div className="rd-staff-head">
                        <span className="rd-row-name">{st.subteam}</span>
                        <span className="rd-row-meta">{st.contributors} contributor{st.contributors === 1 ? '' : 's'}</span>
                      </div>
                      <div className="rd-staff-bars">
                        <span className="rd-pill rd-pill-open">{st.open} open</span>
                        <span className="rd-pill rd-pill-claimed">{st.claimed} claimed</span>
                        <span className="rd-pill rd-pill-await">{st.awaiting_verification} review</span>
                        <span className="rd-pill rd-pill-done">{st.completed} done</span>
                      </div>
                    </div>
                  ))}
                </div>}
          </div>

        </div>
      </div>
    </div>
  )
}
