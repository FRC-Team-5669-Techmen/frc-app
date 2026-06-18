import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import './AccessRequestsPage.css'

const ROLES = ['student', 'mentor', 'parent']

const personName = (p) => (p?.nickname && p.nickname.trim()) || p?.full_name || '—'

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
  const [linkReqs, setLinkReqs] = useState([])   // pending parent→student link requests
  const [roleSel, setRoleSel]   = useState({})
  const [busy, setBusy]         = useState({})
  const [error, setError]       = useState('')

  // Invite-a-member (one-tap link) state
  const [invEmail, setInvEmail] = useState('')
  const [invRole, setInvRole]   = useState('parent')
  const [inviting, setInviting] = useState(false)
  const [invMsg, setInvMsg]     = useState(null) // { ok, text }

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

  const loadLinkReqs = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('parent_link_requests')
      .select('id, note, created_at, parent:parent_id(full_name, nickname), student:student_id(full_name, nickname)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (err) { setError(err.message); setLinkReqs([]); return }
    setLinkReqs(data ?? [])
  }, [])

  useEffect(() => { if (isStaff) { load(); loadLinkReqs() } }, [isStaff, load, loadLinkReqs])

  async function approveLink(r) {
    setBusy(b => ({ ...b, [r.id]: true }))
    const { error: err } = await supabase.rpc('approve_parent_link', { p_request: r.id })
    if (err) {
      setError(err.message)
      setBusy(b => { const n = { ...b }; delete n[r.id]; return n })
      return
    }
    setLinkReqs(rs => rs.filter(x => x.id !== r.id))
  }

  async function denyLink(r) {
    setBusy(b => ({ ...b, [r.id]: true }))
    const { error: err } = await supabase.rpc('deny_parent_link', { p_request: r.id })
    if (err) {
      setError(err.message)
      setBusy(b => { const n = { ...b }; delete n[r.id]; return n })
      return
    }
    setLinkReqs(rs => rs.filter(x => x.id !== r.id))
  }

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

  async function invite(e) {
    e.preventDefault()
    const email = invEmail.trim().toLowerCase()
    if (!email) return
    setInviting(true)
    setInvMsg(null)
    const { data, error: err } = await supabase.functions.invoke('invite-member', {
      body: { email, role: invRole },
    })
    setInviting(false)
    if (err || data?.error) {
      setInvMsg({ ok: false, text: data?.error || err.message })
      return
    }
    if (data?.invited) {
      setInvMsg({ ok: true, text: `Invite sent to ${email} — they're approved as ${data.role}.` })
    } else if (data?.alreadyRegistered) {
      setInvMsg({ ok: true, text: `${email} already has an account — approved as ${data.role}. They can just sign in.` })
    } else {
      setInvMsg({ ok: true, text: `${email} approved as ${data?.role || invRole}.` })
    }
    setInvEmail('')
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

        <section className="ar-invite">
          <h2 className="ar-invite-title">Invite someone</h2>
          <p className="ar-invite-sub">Whitelists the email and sends a one-tap sign-in link — no request needed.</p>
          <form className="ar-invite-form" onSubmit={invite}>
            <input
              className="ar-invite-email"
              type="email"
              placeholder="parent@example.com"
              value={invEmail}
              onChange={e => setInvEmail(e.target.value)}
              required
            />
            <select
              className="ar-select ar-invite-role"
              value={invRole}
              onChange={e => setInvRole(e.target.value)}
              aria-label="Invite role"
            >
              {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
            <button className="ar-approve ar-invite-btn" type="submit" disabled={inviting}>
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </form>
          {invMsg && (
            <p className={`ar-invite-msg${invMsg.ok ? ' ar-invite-ok' : ' ar-invite-err'}`}>
              {invMsg.text}
            </p>
          )}
        </section>

        <section className="ar-linkreqs">
          <h2 className="ar-invite-title">
            Parent link requests
            <span className="ar-count hud-tnum">{linkReqs.length} PENDING</span>
          </h2>
          {linkReqs.length === 0 ? (
            <p className="ar-empty">No pending link requests.</p>
          ) : (
            <ul className="ar-list">
              {linkReqs.map(r => (
                <li key={r.id} className="ar-card">
                  <div className="ar-card-main">
                    <span className="ar-name">
                      {personName(r.parent)} <span className="ar-link-arrow">→</span> {personName(r.student)}
                    </span>
                    {r.note && <p className="ar-note">{r.note}</p>}
                    <div className="ar-meta hud-tnum">
                      <span className="ar-req-role">PARENT // STUDENT</span>
                      <span className="ar-when">{fmtWhen(r.created_at)}</span>
                    </div>
                  </div>
                  <div className="ar-actions">
                    <div className="ar-btns">
                      <button className="ar-approve" disabled={!!busy[r.id]} onClick={() => approveLink(r)}>Approve</button>
                      <button className="ar-deny" disabled={!!busy[r.id]} onClick={() => denyLink(r)}>Deny</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

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
