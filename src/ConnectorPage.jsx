import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { isSchemaMissing } from './schemaMissing'
import './ConnectorPage.css'

// /connector and /connector/authorize: the Techmen connector (ledger 0013,
// docs/subsystems/connector.md). Lets Claude act in this app as the one
// allowlisted admin account.
//
//   /connector/authorize  the consent card Claude opens to connect. Signed
//                         out: the app's own sign-in (Google or an email
//                         code), staying on this address. Signed in as anyone
//                         but the allowlisted admin: "Page not found", the
//                         same answer as an address that does not exist.
//   /connector            the admin page: the on/off switch, the connections
//                         with Disconnect, and the audit log. Anybody but an
//                         admin sees "Page not found".
//
// Both sit outside ProtectedLayout (the consent card must work signed out on
// a phone), so this page loads nothing else of the app. Before 0018 is
// pasted both say "not set up yet".

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never')

function useSession() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    let live = true
    supabase.auth.getSession().then(({ data }) => { if (live) setSession(data?.session ?? null) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null))
    return () => { live = false; sub?.subscription?.unsubscribe?.() }
  }, [])
  return session
}

function Shell({ children, wide = false }) {
  return (
    <div className="cnx-wrap">
      <div className={`cnx-card${wide ? ' cnx-card-wide' : ''}`}>
        <div className="cnx-brand">
          <img src="/assets/logos/Mark-Gold.svg" className="cnx-mark" alt="" />
          <span className="cnx-wordmark">TECHMEN<span className="cnx-dot">·</span>5669</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <Shell>
      <h1 className="cnx-title">Page not found</h1>
      <p className="cnx-muted">There is nothing at this address.</p>
      <a className="cnx-btn" href="/dashboard">Go to the dashboard</a>
    </Shell>
  )
}

function SignIn({ returnTo }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function google() {
    setBusy(true); setError('')
    const { error: e } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnTo } })
    if (e) { setError(e.message); setBusy(false) }
  }
  async function send(e) {
    e.preventDefault(); setBusy(true); setError('')
    const { error: err } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    setBusy(false)
    if (err) setError(err.message); else setStep('code')
  }
  async function verify(e) {
    e.preventDefault(); setBusy(true); setError('')
    const { error: err } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    setBusy(false)
    if (err) setError(err.message)
  }
  return (
    <>
      <h1 className="cnx-title">Sign in to connect Claude</h1>
      <p className="cnx-muted">Sign in with the Techmen account Claude will act as.</p>
      {step === 'email' ? (
        <>
          <button type="button" className="cnx-btn cnx-btn-primary" onClick={google} disabled={busy}>Continue with school account</button>
          <div className="cnx-divider"><span>or an email code</span></div>
          <form className="cnx-form" onSubmit={send}>
            <input className="cnx-input" type="email" placeholder="you@boscotech.edu" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            <button type="submit" className="cnx-btn" disabled={busy}>{busy ? 'Sending...' : 'Email me a code'}</button>
          </form>
        </>
      ) : (
        <form className="cnx-form" onSubmit={verify}>
          <p className="cnx-muted">We sent a code to <strong>{email}</strong>.</p>
          <input className="cnx-input cnx-code" inputMode="numeric" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoComplete="one-time-code" />
          <button type="submit" className="cnx-btn cnx-btn-primary" disabled={busy || !code}>{busy ? 'Checking...' : 'Sign in'}</button>
          <button type="button" className="cnx-link" onClick={() => { setStep('email'); setCode('') }}>Use a different email</button>
        </form>
      )}
      {error && <p className="cnx-error">{error}</p>}
    </>
  )
}

function Consent({ session, search }) {
  const [state, setState] = useState({ status: 'loading' })
  const decide = useCallback(async (decision) => {
    setState((s) => ({ ...s, busy: decision }))
    try {
      const res = await fetch('/api/connector/authorize?route=authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ access_token: session.access_token, query: search, decision }),
      })
      const body = await res.json().catch(() => ({ status: 'error' }))
      if (body.status === 'redirect') { window.location.assign(body.redirect); return }
      setState(body.status ? body : { status: 'error' })
    } catch {
      setState({ status: 'error' })
    }
  }, [session.access_token, search])
  useEffect(() => { decide('check') }, [decide])

  if (state.status === 'loading') return <Shell><p className="cnx-muted cnx-mono">Checking...</p></Shell>
  if (state.status === 'not_found' || state.status === 'sign_in') return <NotFound />
  if (state.status === 'switched_off') {
    return <Shell><h1 className="cnx-title">The connector is switched off</h1><p className="cnx-muted">Switch it on at <a className="cnx-inline" href="/connector">/connector</a>, then connect again from Claude.</p></Shell>
  }
  if (state.status === 'problem') {
    return (
      <Shell>
        <h1 className="cnx-title">This request cannot connect</h1>
        <p className="cnx-muted">{state.problem}</p>
        {state.redirect && <button type="button" className="cnx-btn" onClick={() => window.location.assign(state.redirect)}>Return to Claude</button>}
      </Shell>
    )
  }
  if (state.status !== 'ready') {
    return <Shell><h1 className="cnx-title">Not set up yet</h1><p className="cnx-muted">The connector could not be reached. Nothing was connected.</p></Shell>
  }
  return (
    <Shell>
      <p className="cnx-eyebrow">Connect</p>
      <h1 className="cnx-title">Let {state.client_name} use Techmen as you?</h1>
      <ul className="cnx-facts">
        <li><span className="cnx-k">Account</span><span className="cnx-v">{state.email}</span></li>
        <li><span className="cnx-k">Returns to</span><span className="cnx-v">{state.redirect_host}</span></li>
      </ul>
      <p className="cnx-muted">Claude will be able to do anything you can do in the app, with your permissions. Changes that cannot be undone always ask you first. Every change is logged at /connector, where you can disconnect at any time.</p>
      <div className="cnx-actions">
        <button type="button" className="cnx-btn cnx-btn-primary" disabled={!!state.busy} onClick={() => decide('connect')}>{state.busy === 'connect' ? 'Connecting...' : 'Connect'}</button>
        <button type="button" className="cnx-btn" disabled={!!state.busy} onClick={() => decide('deny')}>Not now</button>
      </div>
    </Shell>
  )
}

function AuditRow({ row }) {
  const [open, setOpen] = useState(false)
  return (
    <li className={`cnx-audit-row cnx-st-${row.status}`}>
      <button type="button" className="cnx-audit-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="cnx-mono cnx-when">{fmt(row.started_at)}</span>
        <span className="cnx-tool">{row.tool}</span>
        <span className="cnx-mono cnx-fn">{row.function_name}</span>
        <span className={`cnx-chip cnx-chip-${row.status}`}>{row.status === 'done' ? (row.undone_by ? 'undone' : 'done') : row.status}</span>
      </button>
      {open && (
        <div className="cnx-audit-body">
          <p className="cnx-k">Arguments</p>
          <pre className="cnx-pre">{JSON.stringify(row.args, null, 2)}</pre>
          {row.error && (<><p className="cnx-k">Refusal</p><pre className="cnx-pre">{row.error}</pre></>)}
          <p className="cnx-k">Rows written ({(row.rows_written ?? []).length})</p>
          <pre className="cnx-pre">{JSON.stringify(row.rows_written ?? [], null, 2)}</pre>
          {row.undo && (<><p className="cnx-k">Undo</p><pre className="cnx-pre">{JSON.stringify(row.undo, null, 2)}</pre></>)}
        </div>
      )}
    </li>
  )
}

function Admin() {
  const [state, setState] = useState(undefined)   // undefined loading, 'missing', 'denied', object
  const [audit, setAudit] = useState([])
  const [tool, setTool] = useState('')
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const load = useCallback(async () => {
    const s = await supabase.rpc('connector_admin_state')
    if (s.error) { setState(isSchemaMissing(s.error) ? 'missing' : 'denied'); return }
    setState(s.data)
    const a = await supabase.rpc('connector_admin_audit', { p_tool: tool || null, p_day: null, p_limit: 200 })
    setAudit(a.error ? [] : (a.data ?? []))
  }, [tool])
  useEffect(() => { load() }, [load])
  async function act(name, fn, args, done) {
    setBusy(name); setMsg(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(null)
    setMsg(error ? { bad: true, text: error.message } : { text: done })
    load()
  }
  if (state === undefined) return <Shell wide><p className="cnx-muted cnx-mono">Loading...</p></Shell>
  if (state === 'denied') return <NotFound />
  if (state === 'missing') {
    return <Shell wide><h1 className="cnx-title">Claude connector</h1><p className="cnx-muted">Not set up yet. Paste supabase/migrations/0018_connector.sql into the Supabase SQL editor, then docs/connector/allowlist.sql.</p></Shell>
  }
  const live = state.connections.filter((c) => !c.revoked_at)
  const tools = [...new Set(audit.map((r) => r.tool))].sort()
  return (
    <Shell wide>
      <div className="cnx-head">
        <h1 className="cnx-title">Claude connector</h1>
        <span className={`cnx-chip ${state.enabled ? 'cnx-chip-on' : ''}`}>{state.enabled ? 'On' : 'Off'}</span>
      </div>
      <p className="cnx-muted">Lets Claude act in Techmen as {state.allowed_name ?? 'the allowlisted admin'}, from any chat, including by voice. Add it in Claude with the address <span className="cnx-mono cnx-v">{window.location.origin}/mcp</span>.</p>
      {!state.allowed && <p className="cnx-error">Nobody is allowlisted yet: paste docs/connector/allowlist.sql in the Supabase SQL editor.</p>}
      {state.allowed && !state.allowed_is_me && <p className="cnx-muted">You are an admin, but the connector acts only as {state.allowed_name}.</p>}

      <section className="cnx-section">
        <h2 className="cnx-h2">Switch</h2>
        <button type="button" className={`cnx-btn ${state.enabled ? '' : 'cnx-btn-primary'}`} disabled={busy === 'switch'}
          onClick={() => act('switch', 'connector_admin_set_enabled', { p_enabled: !state.enabled }, state.enabled ? 'Switched off. Claude can do nothing here until it is switched on.' : 'Switched on.')}>
          {state.enabled ? 'Switch off' : 'Switch on'}
        </button>
      </section>

      <section className="cnx-section">
        <div className="cnx-section-head">
          <h2 className="cnx-h2">Connections <span className="cnx-count">{live.length}</span></h2>
          {live.length > 1 && <button type="button" className="cnx-btn cnx-btn-danger" disabled={busy === 'all'} onClick={() => act('all', 'connector_admin_disconnect_all', {}, 'Every connection was disconnected.')}>Disconnect all</button>}
        </div>
        {state.connections.length === 0 ? <p className="cnx-muted">No connections yet.</p> : (
          <ul className="cnx-list">
            {state.connections.map((c) => (
              <li key={c.id} className={`cnx-row${c.revoked_at ? ' cnx-row-off' : ''}`}>
                <div className="cnx-row-main">
                  <span className="cnx-tool">{c.label}</span>
                  <span className="cnx-mono cnx-meta">connected {fmt(c.created_at)} · last used {fmt(c.last_used_at)}{c.revoked_at ? ` · disconnected ${fmt(c.revoked_at)}` : ''}</span>
                </div>
                {!c.revoked_at && <button type="button" className="cnx-btn cnx-btn-danger" disabled={busy === c.id} onClick={() => act(c.id, 'connector_admin_disconnect', { p_token_id: c.id }, 'Disconnected.')}>Disconnect</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cnx-section">
        <div className="cnx-section-head">
          <h2 className="cnx-h2">Audit log <span className="cnx-count">{audit.length}</span></h2>
          <select className="cnx-input cnx-select" value={tool} onChange={(e) => setTool(e.target.value)} aria-label="Filter by tool">
            <option value="">Every tool</option>
            {tools.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {audit.length === 0 ? <p className="cnx-muted">Nothing has been changed through Claude yet.</p> : (
          <ul className="cnx-list">{audit.map((r) => <AuditRow key={r.id} row={r} />)}</ul>
        )}
      </section>
      {msg && <p className={msg.bad ? 'cnx-error' : 'cnx-ok'}>{msg.text}</p>}
    </Shell>
  )
}

export default function ConnectorPage() {
  const location = useLocation()
  const session = useSession()
  const consent = location.pathname.startsWith('/connector/authorize')
  if (session === undefined) return <Shell><p className="cnx-muted cnx-mono">Loading...</p></Shell>
  if (!session) {
    if (!consent) return <NotFound />
    return <Shell><SignIn returnTo={`${window.location.origin}${location.pathname}${location.search}`} /></Shell>
  }
  return consent ? <Consent session={session} search={location.search} /> : <Admin />
}
