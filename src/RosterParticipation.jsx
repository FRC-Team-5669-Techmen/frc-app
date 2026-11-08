import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { displayName } from './names'
import './Standing.css'
import './RosterAccounts.css'

export function FoldingSettings() {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  async function load() {
    setBusy(true)
    const r = await supabase.rpc('admin_preview_folding')
    setBusy(false)
    if (r.error) { setMissing(isSchemaMissing(r.error)); setError(r.error.message); return }
    setError(''); setPreview(r.data)
  }
  useEffect(() => { load() }, [])
  async function toggle() {
    setBusy(true)
    const r = await writeVia(supabase, 'admin_set_folding', { p_enabled: !preview.enabled })
    if (r.error) { setError(r.error.message); setBusy(false); return }
    await load()
  }
  return <section className="st-card ra-panel" aria-label="Automatic folding">
    <h2 className="st-h2">Automatic participation folding</h2>
    <p>After a failed participation probation, move a member to Folded members. Their account and access stay available. Break weeks and excused absences do not count.</p>
    <p>A mentor can keep someone active until the override is withdrawn. Review the preview before choosing whether to turn this on.</p>
    {missing ? <p>Not set up yet.</p> : <>
      {error && <p role="alert" className="st-error">{error}</p>}
      {preview && <>
        <p role="status">Automatic folding: <strong>{preview.enabled ? 'On' : 'Off'}</strong></p>
        <button className="st-btn" disabled={busy} onClick={toggle}>{preview.enabled ? 'Turn automatic folding off' : 'Turn automatic folding on'}</button>
        <h3>Dry-run preview</h3>
        <p>As of {new Date(preview.as_of).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}. Preview saves no changes.</p>
        {preview.held && <p>The standing mass-change hold stopped new results. Review attendance before enabling folding.</p>}
        {preview.candidates.length ? <ul className="ra-list">{preview.candidates.map(c => <li key={c.member_id}><strong>{c.name}</strong><p>{c.reason}</p></li>)}</ul> : <p>No members would fold today.</p>}
      </>}
      <button className="st-btn" onClick={load} disabled={busy}>{busy ? 'Checking…' : 'Refresh dry-run preview'}</button>
    </>}
  </section>
}

export default function RosterParticipation({ onChange = () => {} }) {
  const [loaded, setLoaded] = useState(false)
  const [rows, setRows] = useState([])
  const [members, setMembers] = useState([])
  const [pick, setPick] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  async function load() {
    const [r, p] = await Promise.all([supabase.rpc('staff_participation'), supabase.from('profiles').select('id, full_name, nickname, status')])
    setLoaded(true)
    if (r.error || p.error) { const e = r.error || p.error; setMissing(isSchemaMissing(e)); setError(e.message); return }
    setRows(r.data ?? []); setMembers(p.data ?? []); setError('')
  }
  useEffect(() => { load() }, [])
  async function change(member, keep, restore = false) {
    setBusy(true)
    const r = await writeVia(supabase, 'mentor_set_participation', { p_member: member, p_keep_active: keep, p_restore: restore })
    setBusy(false)
    if (r.error) { setError(r.error.message); return }
    setPick(''); await load(); onChange()
  }
  const name = id => displayName(members.find(p => p.id === id))
  const folded = members.filter(p => p.status === 'folded')
  if (!loaded) return <section className="st-card"><p role="status">Loading participation…</p></section>
  if (missing) return <section className="st-card"><h2 className="st-h2">Participation</h2><p>Not set up yet.</p></section>
  return <section className="st-card ra-panel" aria-label="Roster participation">
    {error && <p className="st-error" role="alert">{error}</p>}
    <h2 className="st-h2">Keep active</h2>
    <p>Mentor overrides last until withdrawn. Restoring a member also withdraws the current removal proposal.</p>
    <label className="st-label">Member
      <select className="st-input" value={pick} onChange={e => setPick(e.target.value)}>
        <option value="">Choose a member</option>
        {members.filter(p => p.status === 'active' && !rows.some(r => r.member_id === p.id && r.keep_active)).map(p => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
      </select>
    </label>
    <button className="st-btn" disabled={!pick || busy} onClick={() => change(pick, true)}>Keep member active</button>
    <ul className="ra-list">{rows.filter(r => r.keep_active).map(r => <li key={r.member_id}><strong>{name(r.member_id)}</strong><p>Kept active until withdrawn</p><button className="st-btn" disabled={busy} onClick={() => change(r.member_id, false)}>Withdraw override</button></li>)}</ul>
    <h2 className="st-h2">Folded members</h2>
    {folded.length ? <ul className="ra-list">{folded.map(p => {
      const r = rows.find(r => r.member_id === p.id)
      return <li key={p.id}><strong>{displayName(p)}</strong><p>{r?.reason || 'Participation probation failed.'}</p><p>Folded {r?.folded_at ? new Date(r.folded_at).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) : 'date unavailable'}</p><button className="st-btn" disabled={busy} onClick={() => change(p.id, false, true)}>Restore to active</button></li>
    })}</ul> : <p>No folded members.</p>}
  </section>
}
