import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import './Standing.css'
import './RosterAccounts.css'

export default function AccountTransfer({ session }) {
  const school = (session?.user?.email ?? '').toLowerCase().split('@')[1] === 'boscotech.edu'
  const [generated, setGenerated] = useState(null)
  const [code, setCode] = useState('')
  const [requests, setRequests] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  async function load() {
    const r = await supabase.rpc('account_transfers')
    if (r.error) { setMissing(isSchemaMissing(r.error)); setError(r.error.message); return }
    setRequests(r.data ?? [])
  }
  useEffect(() => { load() }, [])
  async function submit(e) {
    e?.preventDefault(); setBusy(true); setError(''); setMessage('')
    const r = school
      ? await writeVia(supabase, 'request_account_transfer', { p_code: code.trim() })
      : await writeVia(supabase, 'create_account_transfer_code', {})
    setBusy(false)
    if (r.error) { setMissing(isSchemaMissing(r.error)); setError(r.error.message); return }
    if (school) { setCode(''); setMessage('Transfer requested. An admin must approve before any history moves.'); await load() }
    else setGenerated(r.data)
  }
  return <section className="st-card ra-panel" aria-label="Summer account transfer">
    <h2 className="st-h2">Move summer account history</h2>
    <p>Signed in as {session?.user?.email}</p>
    <p>Prove both accounts: generate a code while signed into your personal account, then sign into your school account and enter it. An admin reviews the request before history moves. Names are never used to match accounts.</p>
    {missing ? <p>Not set up yet.</p> : <>
      {error && <p className="st-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {school ? <form onSubmit={submit}>
        <label className="st-label">Transfer code<input className="st-input" autoComplete="off" maxLength={32} value={code} onChange={e => setCode(e.target.value)} required /></label>
        <button className="st-btn" disabled={busy || !code.trim()}>Request transfer</button>
      </form> : <>
        <button className="st-btn" disabled={busy} onClick={submit}>Generate one-time transfer code</button>
        {generated && <div role="status"><code className="ra-code">{generated.code}</code><p>Expires {new Date(generated.expires_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}. Single use. Generating another code replaces this one. Keep it private.</p></div>}
      </>}
      <ul className="ra-list">{requests.map(r => <li key={r.id}>{r.source_email} → {r.target_email}<p>Transfer {r.status}</p></li>)}</ul>
    </>}
  </section>
}
