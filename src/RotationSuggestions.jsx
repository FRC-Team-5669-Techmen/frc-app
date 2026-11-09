import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { roleLabel } from './roleBoard'
import { rotationSuggestions, RESPONSIBILITY_ROLES } from './rotationSuggestions'
import './Operations.css'
export default function RotationSuggestions({ board, onAssigned }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async () => { const r = await supabase.rpc('mentor_rotation_data'); setError(r.error ? (isSchemaMissing(r.error) ? 'Rotation suggestions are not set up yet.' : 'Could not load mentor rotation data.') : ''); if (!r.error) setData(r.data) }, [])
  useEffect(() => { load() }, [load])
  async function act(name, args) {
    setBusy(true); setMsg('')
    try { const r = await writeVia(supabase, name, args); if (r.error || r.via !== 'function') throw r.error || new Error('Not set up yet.'); await load(); await onAssigned(); setMsg('Saved.') }
    catch (e) { setMsg(e.message || 'Could not save.') } finally { setBusy(false) }
  }
  const plan = useMemo(() => data ? rotationSuggestions(board, data) : null, [board, data])
  return <details className="rb-rules ops-section" data-rotation-suggestions><summary>Mentor rotation suggestions</summary>
    <p className="rb-muted">Advisory option under decision 54. Every assignment remains your choice. Mark newer members and strong pit members below; neither is inferred from hours. A newer pit placement needs two distinct strong members available in that slot. Overfilling is allowed.</p>
    <p className="rb-muted">Responsibility roles: {RESPONSIBILITY_ROLES.map(roleLabel).join(', ')}. Ordered by verified current-season Build hours: approved sign-outs, approved session reviews or verified IN/OUT pairs, plus verified Build logs. Pauses, caps and excluded reviews use the shared hours rules. Open and unverified sessions do not count.</p>
    {error ? <p role="alert">{error} <button className="rb-btn" onClick={load}>Retry</button></p> : plan && <>
      <p className="hud-mono">Season: {data.season?.name || 'No current season; verified hour totals are zero'}</p>
      <details><summary>Mentor designations</summary><ul className="rb-assign-list ops-designations">{plan.members.map(m => <li key={m.id} data-designation={m.id}><span>{m.name} · {m.hours.toFixed(2)} verified shop hours</span><label><input type="checkbox" checked={m.strong} disabled={busy} onChange={e => act('mentor_set_rotation_member', { p_member: m.id, p_strong: e.target.checked, p_newer: m.newer })} /> Strong pit member</label><label><input type="checkbox" checked={m.newer} disabled={busy} onChange={e => act('mentor_set_rotation_member', { p_member: m.id, p_strong: m.strong, p_newer: e.target.checked })} /> Newer member</label></li>)}</ul></details>
      {plan.gaps.length > 0 && <div role="status"><h3 className="rb-h2">Rotation gaps</h3><ul>{plan.gaps.map(g => <li key={g}>{g}</li>)}</ul></div>}
      <ul className="rb-assign-list ops-suggestion-list">{plan.suggestions.map(s => <li key={`${s.slot.id}:${s.role}:${s.member.id}`} data-rotation-suggestion><span><b>{s.slot.label} · {roleLabel(s.role)} · {s.member.name}</b><br />{s.reason}</span><button className="rb-btn" disabled={busy} onClick={() => act('staff_add_to_slot', { p_slot: s.slot.id, p_member: s.member.id, p_role: s.role, p_status: 'assigned' })}>Assign suggestion</button></li>)}</ul>
      {!plan.suggestions.length && <p>No additional assignments suggested. Existing assignments remain.</p>}
    </>}{msg && <p role="status">{msg}</p>}
  </details>
}
