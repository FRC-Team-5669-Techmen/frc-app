import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import './VerifyHoursPage.css'

function fmtDate(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtHours(h) {
  const n = parseFloat(h)
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(2)}h`
}

export default function VerifyHoursPage({ session, hasRole }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [entries, setEntries] = useState(null)
  const [acting,  setActing]  = useState({}) // id → 'approve' | 'reject'

  useEffect(() => {
    if (!isStaff) return
    supabase
      .from('logged_hours')
      .select('*, member:member_id(full_name, email)')
      .eq('status', 'pending')
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .then(({ data }) => setEntries(data ?? []))
  }, [isStaff])

  async function act(id, action) {
    setActing(a => ({ ...a, [id]: action }))
    const now = new Date().toISOString()
    const patch = action === 'approve'
      ? { status: 'verified', verified_by: session.user.id, verified_at: now }
      : { status: 'rejected' }

    const { error } = await supabase.from('logged_hours').update(patch).eq('id', id)
    setActing(a => { const n = { ...a }; delete n[id]; return n })
    if (!error) setEntries(prev => prev.filter(e => e.id !== id))
  }

  if (!isStaff) {
    return (
      <div className="vh-wrap">
        <div className="vh-denied">You need a staff role to access this page.</div>
      </div>
    )
  }

  if (entries === null) {
    return (
      <div className="vh-wrap">
        <div className="vh-loading"><div className="vh-spinner" /></div>
      </div>
    )
  }

  return (
    <div className="vh-wrap">
      <div className="vh-body">
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
