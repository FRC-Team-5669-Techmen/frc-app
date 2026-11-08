import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import './Standing.css'
import './RosterAccounts.css'

export default function AccountsPage({ hasRole = () => false }) {
  const admin = hasRole('admin')
  const [loaded, setLoaded] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [transfers, setTransfers] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState({})
  async function load() {
    const [a, t] = await Promise.all([supabase.rpc('admin_account_review'), supabase.rpc('account_transfers')])
    setLoaded(true)
    if (a.error || t.error) { const e = a.error || t.error; setMissing(isSchemaMissing(e)); setError(e.message); return }
    setAccounts(a.data ?? []); setTransfers(t.data ?? [])
  }
  useEffect(() => { if (admin) load() }, [admin])
  async function act(fn, args, message) {
    setBusy(true); setError(''); setMessage('')
    const r = await writeVia(supabase, fn, args)
    setBusy(false)
    if (r.error) { setError(r.error.message); return }
    setMessage(message); await load()
  }
  if (!admin) return <div className="st-wrap"><h1 className="st-title">Account review</h1><p>Admin only.</p></div>
  if (!loaded) return <div className="st-wrap"><h1 className="st-title">Account review</h1><p role="status">Loading accounts…</p></div>
  return <div className="st-wrap st-wide ra-panel">
    <h1 className="st-title">Account review</h1>
    <Link className="st-link" to="/roster">Back to roster</Link>
    {missing ? <p>Not set up yet.</p> : <>
      {error && <p className="st-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <section className="st-card" aria-label="Personal email accounts">
        <h2 className="st-h2">Personal-email accounts</h2>
        <p>Existing student accounts keep their roles. Review these individually. Reclassification changes student/parent classification; staff roles and access approval stay the same.</p>
        <ul className="ra-list">{accounts.map(a => <li key={a.member_id}>
          <strong>{a.name}</strong><p>{a.email}</p>
          <p>{a.needs_review ? 'Existing personal-email student: needs review.' : `Classification: ${a.classification || a.roles.join(', ') || 'unassigned'}`}</p>
          <p>{a.reason}</p>
          <label className="st-label">Classification for {a.name}<select className="st-input" value={pick[a.member_id] || a.classification || (a.roles.includes('student') ? 'student' : 'parent')} onChange={e => setPick(p => ({ ...p, [a.member_id]: e.target.value }))}><option value="parent">Parent</option><option value="student">Student</option></select></label>
          <button className="st-btn" disabled={busy} onClick={() => act('admin_reclassify_account', { p_member: a.member_id, p_classification: pick[a.member_id] || a.classification || (a.roles.includes('student') ? 'student' : 'parent') }, 'Classification saved.')}>Save classification</button>
        </li>)}</ul>
        {!accounts.length && <p>No personal-email accounts to review.</p>}
      </section>
      <section className="st-card" aria-label="Transfer approval">
        <h2 className="st-h2">Summer-account transfer requests</h2>
        <p>Each request proves a session in both accounts. Approving moves the personal history into the school account through the existing audited merge. The merge checks catalog coverage and retains the school account on duplicate records.</p>
        <ul className="ra-list">{transfers.map(r => <li key={r.id}><strong>{r.source_email} → {r.target_email}</strong><p>Transfer {r.status}</p>
          {r.status === 'pending' && <>
            <button className="st-btn" disabled={busy} onClick={() => act('admin_decide_account_transfer', { p_request: r.id, p_approve: true }, 'Transfer approved. History moved to the school account.')}>Approve transfer</button>
            <button className="st-btn" disabled={busy} onClick={() => act('admin_decide_account_transfer', { p_request: r.id, p_approve: false }, 'Transfer denied. No history moved.')}>Deny transfer</button>
          </>}
          {r.result && <p>Moved {r.result.moved_total} records. Duplicate records retained on the school account: {r.result.duplicates_removed}.</p>}
        </li>)}</ul>
        {!transfers.length && <p>No transfer requests.</p>}
      </section>
    </>}
  </div>
}
