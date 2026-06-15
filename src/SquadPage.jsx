import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import './SquadPage.css'

const EMPTY_FORM = { name: '', description: '', target_count: 1, sort_order: 0 }

export default function SquadPage({ session, hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const uid = session.user.id

  const [positions, setPositions]   = useState(null)
  const [assignments, setAssignments] = useState({})  // position_id -> [{ member_id, name }]
  const [members, setMembers]       = useState([])    // active approved profiles
  const [assignSel, setAssignSel]   = useState({})    // position_id -> selected member_id
  const [busy, setBusy]             = useState({})
  const [error, setError]           = useState('')

  const [formOpen, setFormOpen]     = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)

  const load = useCallback(async () => {
    const [posRes, asgRes, memRes] = await Promise.all([
      supabase.from('positions').select('*').order('sort_order', { ascending: true }),
      // member_id and assigned_by both reference profiles, so name the FK
      supabase.from('position_assignments')
        .select('position_id, member_id, member:profiles!position_assignments_member_id_fkey(full_name)'),
      supabase.from('profiles').select('id, full_name')
        .eq('status', 'active').eq('approved', true).order('full_name'),
    ])
    if (posRes.error) { setError(posRes.error.message); setPositions([]); return }
    const map = {}
    for (const a of asgRes.data ?? []) {
      (map[a.position_id] ??= []).push({ member_id: a.member_id, name: a.member?.full_name })
    }
    setAssignments(map)
    setMembers(memRes.data ?? [])
    setPositions(posRes.data ?? [])
  }, [])

  useEffect(() => { if (isStaff) load() }, [isStaff, load])

  // ── Assignment ──
  async function assign(positionId) {
    const memberId = assignSel[positionId]
    if (!memberId) return
    setBusy(b => ({ ...b, [positionId]: true }))
    const { error } = await supabase.from('position_assignments')
      .insert({ position_id: positionId, member_id: memberId, assigned_by: uid })
    setBusy(b => { const n = { ...b }; delete n[positionId]; return n })
    if (error) { setError(error.message); return }
    setAssignSel(s => ({ ...s, [positionId]: '' }))
    load()
  }

  async function unassign(positionId, memberId) {
    setBusy(b => ({ ...b, [positionId]: true }))
    const { error } = await supabase.from('position_assignments')
      .delete().eq('position_id', positionId).eq('member_id', memberId)
    setBusy(b => { const n = { ...b }; delete n[positionId]; return n })
    if (error) { setError(error.message); return }
    load()
  }

  // ── Catalog management ──
  function openAdd() {
    const maxOrder = positions?.length ? Math.max(...positions.map(p => p.sort_order)) : -1
    setEditTarget(null)
    setForm({ ...EMPTY_FORM, sort_order: maxOrder + 1 })
    setError(''); setFormOpen(true)
  }
  function openEdit(p) {
    setEditTarget(p)
    setForm({
      name: p.name,
      description: p.description ?? '',
      target_count: p.target_count,
      sort_order: p.sort_order,
    })
    setError(''); setFormOpen(true)
  }
  function closeForm() { setFormOpen(false); setEditTarget(null); setError('') }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = {
      name:         form.name.trim(),
      description:  form.description.trim() || null,
      target_count: Math.max(0, parseInt(form.target_count, 10) || 0),
      sort_order:   parseInt(form.sort_order, 10) || 0,
    }
    const { error } = editTarget
      ? await supabase.from('positions').update(payload).eq('id', editTarget.id)
      : await supabase.from('positions').insert(payload)
    setSaving(false)
    if (error) { setError(error.message); return }
    closeForm()
    load()
  }

  async function remove(p) {
    if (!window.confirm(`Remove "${p.name}" and all its assignments?`)) return
    setBusy(b => ({ ...b, [p.id]: true }))
    const { error } = await supabase.from('positions').delete().eq('id', p.id)
    setBusy(b => { const n = { ...b }; delete n[p.id]; return n })
    if (error) { setError(error.message); return }
    load()
  }

  if (!isStaff) {
    return <div className="squad-wrap"><div className="squad-denied">Staff access only.</div></div>
  }
  if (positions === null) {
    return <div className="squad-loading"><div className="squad-spinner" /></div>
  }

  return (
    <div className="squad-wrap">
      <div className="squad-body">

        <div className="squad-header">
          <h1 className="squad-title">Squad</h1>
          {!formOpen && <button className="squad-add-btn" onClick={openAdd}>+ Add position</button>}
        </div>

        {error && <p className="squad-error" onClick={() => setError('')}>{error}</p>}

        {formOpen && (
          <div className="squad-form-card">
            <h2 className="squad-form-heading">{editTarget ? 'Edit position' : 'Add position'}</h2>
            <form onSubmit={handleSubmit} className="squad-form">
              <div className="squad-field">
                <label className="squad-label" htmlFor="sq-name">Name</label>
                <input id="sq-name" type="text" required maxLength={120}
                  placeholder="e.g. Driver"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="squad-input" />
              </div>
              <div className="squad-field">
                <label className="squad-label" htmlFor="sq-desc">Description</label>
                <textarea id="sq-desc" rows={2} maxLength={500}
                  placeholder="Optional"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="squad-input squad-textarea" />
              </div>
              <div className="squad-form-row">
                <div className="squad-field">
                  <label className="squad-label" htmlFor="sq-target">Target count</label>
                  <input id="sq-target" type="number" min="0" max="50"
                    value={form.target_count}
                    onChange={e => setForm(f => ({ ...f, target_count: e.target.value }))}
                    className="squad-input squad-input-num" />
                </div>
                <div className="squad-field">
                  <label className="squad-label" htmlFor="sq-order">Sort order</label>
                  <input id="sq-order" type="number"
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                    className="squad-input squad-input-num" />
                </div>
              </div>
              <div className="squad-form-actions">
                <button type="button" className="squad-cancel-btn" onClick={closeForm}>Cancel</button>
                <button type="submit" className="squad-save-btn" disabled={saving}>
                  {saving ? 'Saving…' : editTarget ? 'Save changes' : 'Add position'}
                </button>
              </div>
            </form>
          </div>
        )}

        {positions.length === 0 && !formOpen && (
          <p className="squad-empty">No positions yet. Use "Add position" to build the squad.</p>
        )}

        <div className="squad-list">
          {positions.map(p => {
            const holders    = assignments[p.id] ?? []
            const holderIds  = new Set(holders.map(h => h.member_id))
            const available  = members.filter(m => !holderIds.has(m.id))
            const short      = holders.length < p.target_count
            return (
              <div key={p.id} className="squad-card">
                <div className="squad-card-top">
                  <span className="squad-card-name">{p.name}</span>
                  <span className={`squad-count${short ? ' squad-count-short' : ''}`}>
                    {holders.length} / {p.target_count}
                  </span>
                </div>
                {p.description && <p className="squad-card-desc">{p.description}</p>}

                <div className="squad-holders">
                  {holders.length === 0
                    ? <span className="squad-vacant">Vacant</span>
                    : holders.map(h => (
                        <span key={h.member_id} className="squad-holder">
                          {h.name || '—'}
                          <button
                            className="squad-holder-x"
                            disabled={!!busy[p.id]}
                            onClick={() => unassign(p.id, h.member_id)}
                            aria-label={`Unassign ${h.name || 'member'}`}
                          >×</button>
                        </span>
                      ))}
                </div>

                <div className="squad-assign">
                  <select
                    className="squad-select"
                    value={assignSel[p.id] ?? ''}
                    onChange={e => setAssignSel(s => ({ ...s, [p.id]: e.target.value }))}
                  >
                    <option value="">Assign a member…</option>
                    {available.map(m => (
                      <option key={m.id} value={m.id}>{m.full_name || m.id}</option>
                    ))}
                  </select>
                  <button
                    className="squad-assign-btn"
                    disabled={!assignSel[p.id] || !!busy[p.id]}
                    onClick={() => assign(p.id)}
                  >Assign</button>
                </div>

                <div className="squad-card-actions">
                  <button className="squad-link-btn" disabled={formOpen} onClick={() => openEdit(p)}>Edit</button>
                  <button className="squad-link-btn squad-link-danger" disabled={!!busy[p.id]} onClick={() => remove(p)}>Remove</button>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
