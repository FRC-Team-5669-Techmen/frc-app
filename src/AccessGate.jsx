import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import './AccessGate.css'

const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'mentor',  label: 'Mentor' },
  { value: 'parent',  label: 'Parent / Guardian' },
]

// Shown to a signed-in user whose email isn't on an allowed domain and isn't
// approved yet. In this app, signing in IS account creation, so they're already
// authenticated (approved = false). This screen lets them REQUEST access from
// inside the app instead of dead-ending. No nav bar: it replaces the app shell
// until claim_profile() approves them.
export default function AccessGate({ session }) {
  const email = (session?.user?.email || '').toLowerCase()
  const metaName = session?.user?.user_metadata?.full_name || ''

  const [mode, setMode]       = useState('checking') // checking | form | pending | submitted | approved
  const [fullName, setFullName] = useState(metaName)
  const [role, setRole]       = useState('student')
  const [note, setNote]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  // Check for an existing request first (SECURITY DEFINER, reads only own row).
  useEffect(() => {
    let active = true
    supabase.rpc('my_access_request_status').then(({ data }) => {
      if (!active) return
      if (data === 'pending')       setMode('pending')
      else if (data === 'approved') setMode('approved')
      else                          setMode('form')
    })
    return () => { active = false }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('access_requests').insert({
      email,
      full_name: fullName.trim() || null,
      requested_role: role,
      note: note.trim() || null,
    })
    setSaving(false)
    if (err) {
      // 23505 = the one-pending-per-email unique index: already requested.
      if (err.code === '23505') { setMode('pending'); return }
      setError(err.message)
      return
    }
    setMode('submitted')
  }

  const SignOut = () => (
    <button className="gate-signout" onClick={() => supabase.auth.signOut()}>
      Sign out
    </button>
  )

  if (mode === 'checking') {
    return (
      <div className="gate-wrap">
        <div className="gate-card"><div className="gate-spinner" /></div>
      </div>
    )
  }

  if (mode === 'pending') {
    return (
      <div className="gate-wrap">
        <div className="gate-card">
          <img src="/assets/logos/Mark-Gold.svg" className="gate-mark" alt="Techmen" />
          <h1 className="gate-title">Request pending</h1>
          <p className="gate-msg">
            Your access request is in. A mentor will review it soon — we'll email
            you at the address below when you're approved.
          </p>
          <p className="gate-email">Signed in as <strong>{email}</strong></p>
          <SignOut />
        </div>
      </div>
    )
  }

  if (mode === 'submitted') {
    return (
      <div className="gate-wrap">
        <div className="gate-card">
          <img src="/assets/logos/Mark-Gold.svg" className="gate-mark" alt="Techmen" />
          <h1 className="gate-title">Request sent</h1>
          <p className="gate-msg">
            Thanks — we'll email <strong>{email}</strong> when a mentor approves you.
            You can close this tab; sign back in (or reload) once you're approved.
          </p>
          <SignOut />
        </div>
      </div>
    )
  }

  if (mode === 'approved') {
    return (
      <div className="gate-wrap">
        <div className="gate-card">
          <img src="/assets/logos/Mark-Gold.svg" className="gate-mark" alt="Techmen" />
          <h1 className="gate-title">You're approved</h1>
          <p className="gate-msg">
            Your access was approved. Reload to continue — your current session
            won't update on its own.
          </p>
          <button className="gate-signout" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }

  // mode === 'form'
  return (
    <div className="gate-wrap">
      <div className="gate-card gate-card-form">
        <img src="/assets/logos/Mark-Gold.svg" className="gate-mark" alt="Techmen" />
        <h1 className="gate-title">Request access</h1>
        <p className="gate-msg">
          You're signed in, but your email isn't on the team roster yet. Tell us
          who you are and a mentor will approve you.
        </p>

        <form className="gate-form" onSubmit={submit}>
          <label className="gate-field">
            <span className="gate-label">Email</span>
            <input className="gate-input" type="email" value={email} readOnly aria-readonly="true" />
          </label>

          <label className="gate-field">
            <span className="gate-label">Full name</span>
            <input
              className="gate-input"
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jane Doe"
              required
            />
          </label>

          <label className="gate-field">
            <span className="gate-label">Your role</span>
            <select className="gate-input" value={role} onChange={e => setRole(e.target.value)}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className="gate-hint">A hint for staff — they confirm your actual role.</span>
          </label>

          <label className="gate-field">
            <span className="gate-label">Note <span className="gate-optional">(optional)</span></span>
            <textarea
              className="gate-input gate-textarea"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Parent of Jane Doe, junior on Mechanical"
              rows={3}
            />
          </label>

          {error && <p className="gate-error">{error}</p>}

          <button className="gate-submit" type="submit" disabled={saving}>
            {saving ? 'Sending…' : 'Request access'}
          </button>
        </form>

        <p className="gate-email">Signed in as <strong>{email}</strong></p>
        <SignOut />
      </div>
    </div>
  )
}
