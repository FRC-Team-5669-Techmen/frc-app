import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import './AccessRequestsPage.css'

const ROLES = ['student', 'mentor', 'parent']

function fmtWhen(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Staff review of pending access requests. Approve whitelists the email with a
// chosen role (via approve_access_request RPC) and sends a courtesy email;
// Deny marks the request denied. Members never UPDATE these tables directly —
// every transition is a SECURITY DEFINER RPC.
export default function AccessRequestsPage({ hasRole }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const [requests, setRequests] = useState(null)
  const [roleSel, setRoleSel]   = useState({})
  const [busy, setBusy]         = useState({})
  const [error, setError]       = useState('')

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('access_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (err) { setError(err.message); setRequests([]); return }
    setError('')
    setRequests(data ?? [])
    setRoleSel(Object.fromEntries((data ?? []).map(r => [r.id, r.requested_role || 'student'])))
  }, [])

  useEffect(() => { if (isStaff) load() }, [isStaff, load])

  async function approve(r) {
    const role = roleSel[r.id] || 'student'
    setBusy(b => ({ ...b, [r.id]: true }))
    const { error: err } = await supabase.rpc('approve_access_request', { p_request: r.id, p_role: role })
    if (err) {
      setError(err.message)
      setBusy(b => { const n = { ...b }; delete n[r.id]; return n })
      return
    }
    // Courtesy email — best-effort, never blocks approval.
    supabase.functions.invoke('send-approval-email', {
      body: { email: r.email, full_name: r.full_name },
    }).catch(() => {})
    setRequests(rs => rs.filter(x => x.id !== r.id))
  }

  async function deny(r) {
    setBusy(b => ({ ...b, [r.id]: true }))
    const { error: err } = await supabase.rpc('deny_access_request', { p_request: r.id })
    if (err) {
      setError(err.message)
      setBusy(b => { const n = { ...b }; delete n[r.id]; return n })
      return
    }
    setRequests(rs => rs.filter(x => x.id !== r.id))
  }

  if (!isStaff) {
    return (
      <div className="ar-wrap">
        <div className="ar-denied">You need a staff role to review access requests.</div>
      </div>
    )
  }

  if (requests === null) {
    return <div className="ar-wrap ar-loading"><div className="ar-spinner" /></div>
  }

  return (
    <div className="ar-wrap">
      <div className="ar-body">
        <header className="ar-head">
          <h1 className="ar-title">Access Requests</h1>
          <span className="ar-count hud-tnum">{requests.length} PENDING</span>
        </header>

        {error && <p className="ar-error" onClick={() => setError('')}>{error}</p>}

        {requests.length === 0 ? (
          <p className="ar-empty">No pending requests.</p>
        ) : (
          <ul className="ar-list">
            {requests.map(r => (
              <li key={r.id} className="ar-card">
                <div className="ar-card-main">
                  <span className="ar-name">{r.full_name || '—'}</span>
                  <span className="ar-email">{r.email}</span>
                  {r.note && <p className="ar-note">{r.note}</p>}
                  <div className="ar-meta hud-tnum">
                    <span className="ar-req-role">WANTS // {(r.requested_role || '—').toUpperCase()}</span>
                    <span className="ar-when">{fmtWhen(r.created_at)}</span>
                  </div>
                </div>

                <div className="ar-actions">
                  <label className="ar-role-pick">
                    <span className="ar-role-label">Grant</span>
                    <select
                      className="ar-select"
                      value={roleSel[r.id] || 'student'}
                      onChange={e => setRoleSel(s => ({ ...s, [r.id]: e.target.value }))}
                      disabled={!!busy[r.id]}
                    >
                      {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </label>
                  <div className="ar-btns">
                    <button className="ar-approve" disabled={!!busy[r.id]} onClick={() => approve(r)}>Approve</button>
                    <button className="ar-deny" disabled={!!busy[r.id]} onClick={() => deny(r)}>Deny</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
