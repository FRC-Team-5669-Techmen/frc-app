import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabase'
import './JobsPage.css'

// Mirrors the subteam vocabulary used for profiles.subteams (see ProfilePage).
// Offered as datalist suggestions; staff may also type a free value.
const SUBTEAMS = [
  'Mechanical', 'Electrical', 'Programming', 'CAD',
  'Fabrication', 'Media', 'Business/Outreach', 'Drive Team',
]

// tasks.status is now staff-controlled availability.
const STATUS_LABELS = {
  open:      'Open',
  closed:    'Closed',
  completed: 'Completed',
}

// Per-claimant state labels (task_claims.status).
const CLAIM_LABELS = {
  claimed:   'On it',
  submitted: 'Submitted',
  completed: 'Done ✓',
}

const EMPTY_FORM = { title: '', description: '', subteam: '', skillIds: [], group: false, maxClaimants: '' }

export default function JobsPage({ session, hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const uid = session.user.id

  const [tasks, setTasks]     = useState(null)
  const [reqMap, setReqMap]   = useState({})        // task_id -> [skill_id]
  const [skills, setSkills]   = useState({})        // skill_id -> { name, safety_critical }
  const [myCerts, setMyCerts] = useState(new Set()) // skill_ids the member is certified in
  const [claimsMap, setClaimsMap] = useState({})    // task_id -> [claim rows]
  const [busy, setBusy]       = useState({})
  const [error, setError]     = useState('')

  const [formOpen, setFormOpen]     = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)

  const load = useCallback(async () => {
    const [tRes, trsRes, skRes, msRes, tcRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('task_required_skills').select('task_id, skill_id'),
      supabase.from('skills').select('id, name, safety_critical').order('name'),
      supabase.from('member_skills').select('skill_id').eq('member_id', uid).eq('status', 'certified'),
      supabase.from('task_claims').select('task_id, member_id, status, profiles!task_claims_member_id_fkey(full_name, avatar_url)'),
    ])
    if (tRes.error) { setError(tRes.error.message); setTasks([]); return }

    const rm = {}
    for (const r of trsRes.data ?? []) (rm[r.task_id] ??= []).push(r.skill_id)
    const sk = {}
    for (const s of skRes.data ?? []) sk[s.id] = { name: s.name, safety_critical: s.safety_critical }
    const cm = {}
    for (const c of tcRes.data ?? []) (cm[c.task_id] ??= []).push(c)

    setReqMap(rm)
    setSkills(sk)
    setMyCerts(new Set((msRes.data ?? []).map(m => m.skill_id)))
    setClaimsMap(cm)
    setTasks(tRes.data ?? [])
  }, [uid])

  useEffect(() => { load() }, [load])

  const allSkills = useMemo(
    () => Object.entries(skills)
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [skills]
  )

  function requiredSkillsFor(taskId) {
    return (reqMap[taskId] ?? []).map(id => ({
      id, ...(skills[id] ?? { name: '(unknown skill)', safety_critical: false }),
    }))
  }
  function missingFor(taskId) {
    return requiredSkillsFor(taskId).filter(s => !myCerts.has(s.id))
  }

  // ── Member / staff transitions, all via SECURITY DEFINER RPCs ──
  async function runRpc(fn, args, taskId) {
    setBusy(b => ({ ...b, [taskId]: true }))
    const { error } = await supabase.rpc(fn, args)
    setBusy(b => { const n = { ...b }; delete n[taskId]; return n })
    if (error) { setError(error.message); return }
    setError('')
    load()
  }
  const claim   = id => runRpc('claim_task',   { p_task: id }, id)
  const release = id => runRpc('release_task', { p_task: id }, id)
  const submit  = id => runRpc('submit_task',  { p_task: id }, id)
  const verify  = (id, member, approve) => runRpc('verify_task', { p_task: id, p_member: member, p_approve: approve }, id)

  // Staff set the whole job's availability directly (existing staff write policy).
  async function setJobStatus(t, status) {
    setBusy(b => ({ ...b, [t.id]: true }))
    const patch = { status, updated_at: new Date().toISOString() }
    if (status === 'completed') patch.completed_at = new Date().toISOString()
    if (status === 'open')      patch.completed_at = null
    const { error } = await supabase.from('tasks').update(patch).eq('id', t.id)
    setBusy(b => { const n = { ...b }; delete n[t.id]; return n })
    if (error) { setError(error.message); return }
    setError(''); load()
  }

  // ── Staff create / edit form ──
  function openAdd() { setEditTarget(null); setForm(EMPTY_FORM); setError(''); setFormOpen(true) }
  function openEdit(t) {
    setEditTarget(t)
    setForm({
      title: t.title,
      description: t.description ?? '',
      subteam: t.subteam ?? '',
      skillIds: reqMap[t.id] ?? [],
      group: t.max_claimants !== 1,                                  // null (unlimited) or >1
      maxClaimants: (t.max_claimants && t.max_claimants > 1) ? String(t.max_claimants) : '',
    })
    setError(''); setFormOpen(true)
  }
  function closeForm() { setFormOpen(false); setEditTarget(null); setError('') }

  function toggleSkill(id) {
    setForm(f => ({
      ...f,
      skillIds: f.skillIds.includes(id) ? f.skillIds.filter(x => x !== id) : [...f.skillIds, id],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    // Solo => 1; Group => a number >= 2, or null for unlimited.
    const capNum = parseInt(form.maxClaimants, 10)
    const maxClaimants = !form.group ? 1 : (Number.isFinite(capNum) && capNum >= 2 ? capNum : null)
    const payload = {
      title:       form.title.trim(),
      description: form.description.trim() || null,
      subteam:     form.subteam.trim() || null,
      max_claimants: maxClaimants,
    }

    let taskId
    if (editTarget) {
      const { error } = await supabase.from('tasks')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editTarget.id)
      if (error) { setSaving(false); setError(error.message); return }
      taskId = editTarget.id
      // Resync required skills: clear then re-insert the selection
      await supabase.from('task_required_skills').delete().eq('task_id', taskId)
    } else {
      const { data, error } = await supabase.from('tasks')
        .insert({ ...payload, created_by: uid }).select('id').single()
      if (error) { setSaving(false); setError(error.message); return }
      taskId = data.id
    }

    if (form.skillIds.length) {
      const rows = form.skillIds.map(skill_id => ({ task_id: taskId, skill_id }))
      const { error } = await supabase.from('task_required_skills').insert(rows)
      if (error) { setSaving(false); setError(error.message); return }
    }

    setSaving(false)
    closeForm()
    load()
  }

  async function remove(t) {
    if (!window.confirm(`Delete "${t.title}"? This cannot be undone.`)) return
    setBusy(b => ({ ...b, [t.id]: true }))
    const { error } = await supabase.from('tasks').delete().eq('id', t.id)
    setBusy(b => { const n = { ...b }; delete n[t.id]; return n })
    if (error) { setError(error.message); return }
    load()
  }

  // ── Render ──
  if (tasks === null) {
    return <div className="jobs-loading"><div className="jobs-spinner" /></div>
  }

  const groups = {}
  for (const t of tasks) (groups[t.subteam || 'Other'] ??= []).push(t)
  const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b))

  return (
    <div className="jobs-wrap">
      <div className="jobs-body">

        <div className="jobs-header">
          <h1 className="jobs-title">Jobs</h1>
          {isStaff && !formOpen && (
            <button className="jobs-add-btn" onClick={openAdd}>+ New job</button>
          )}
        </div>

        {error && <p className="jobs-error" onClick={() => setError('')}>{error}</p>}

        {/* ── Staff: create / edit ── */}
        {isStaff && formOpen && (
          <div className="jobs-form-card">
            <h2 className="jobs-form-heading">{editTarget ? 'Edit job' : 'New job'}</h2>
            <form onSubmit={handleSubmit} className="jobs-form">
              <div className="jobs-field">
                <label className="jobs-label" htmlFor="job-title">Title</label>
                <input
                  id="job-title" type="text" required maxLength={140}
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="jobs-input" placeholder="e.g. Wire the swerve modules"
                />
              </div>

              <div className="jobs-field">
                <label className="jobs-label" htmlFor="job-subteam">Subteam</label>
                <input
                  id="job-subteam" type="text" list="job-subteam-list" maxLength={60}
                  value={form.subteam}
                  onChange={e => setForm(f => ({ ...f, subteam: e.target.value }))}
                  className="jobs-input" placeholder="Optional"
                />
                <datalist id="job-subteam-list">
                  {SUBTEAMS.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

              <div className="jobs-field">
                <label className="jobs-label" htmlFor="job-desc">Description</label>
                <textarea
                  id="job-desc" rows={3} maxLength={1000}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="jobs-input jobs-textarea" placeholder="Details, scope, links"
                />
              </div>

              <div className="jobs-field">
                <label className="jobs-label">Required certifications</label>
                {allSkills.length === 0
                  ? <span className="jobs-none">No skills in the catalog yet.</span>
                  : <div className="jobs-skill-picker">
                      {allSkills.map(s => (
                        <label key={s.id} className={`jobs-skill-chip${form.skillIds.includes(s.id) ? ' on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={form.skillIds.includes(s.id)}
                            onChange={() => toggleSkill(s.id)}
                          />
                          {s.name}
                          {s.safety_critical && <span className="jobs-skill-safety" title="Safety critical">!</span>}
                        </label>
                      ))}
                    </div>}
              </div>

              <div className="jobs-field">
                <label className="jobs-label">Who can claim</label>
                <div className="jobs-claimtype">
                  <label className={`jobs-claimtype-opt${!form.group ? ' on' : ''}`}>
                    <input type="radio" name="claimtype" checked={!form.group}
                      onChange={() => setForm(f => ({ ...f, group: false }))} />
                    Solo (one person)
                  </label>
                  <label className={`jobs-claimtype-opt${form.group ? ' on' : ''}`}>
                    <input type="radio" name="claimtype" checked={form.group}
                      onChange={() => setForm(f => ({ ...f, group: true }))} />
                    Group
                  </label>
                  {form.group && (
                    <input
                      type="number" min="2" className="jobs-input jobs-cap-input"
                      value={form.maxClaimants}
                      onChange={e => setForm(f => ({ ...f, maxClaimants: e.target.value }))}
                      placeholder="Max (blank = no limit)"
                    />
                  )}
                </div>
              </div>

              <div className="jobs-form-actions">
                <button type="button" className="jobs-cancel-btn" onClick={closeForm}>Cancel</button>
                <button type="submit" className="jobs-save-btn" disabled={saving}>
                  {saving ? 'Saving…' : editTarget ? 'Save changes' : 'Create job'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Task cards grouped by subteam ── */}
        {tasks.length === 0 && <p className="jobs-empty">No jobs posted yet.</p>}

        {groupNames.map(name => (
          <div key={name} className="jobs-group">
            <p className="jobs-group-label">{name}</p>
            <div className="jobs-cards">
              {groups[name].map(t => {
                const reqs    = requiredSkillsFor(t.id)
                const missing = missingFor(t.id)
                const claims  = claimsMap[t.id] ?? []
                const myClaim = claims.find(c => c.member_id === uid)
                const max     = t.max_claimants            // 1 solo, null unlimited, N capped
                const isGroup = max === null || max > 1
                const full    = max != null && claims.length >= max
                const spots   = max == null ? null : max - claims.length
                const nameOf  = c => (c.member_id === uid ? 'You' : (c.profiles?.full_name || 'Member'))
                return (
                  <div key={t.id} className="jobs-card">
                    <div className="jobs-card-top">
                      <span className="jobs-card-title">{t.title}</span>
                      <span className={`jobs-status jobs-status-${t.status}`}>{STATUS_LABELS[t.status]}</span>
                    </div>

                    <div className="jobs-card-meta">
                      {isGroup && <span className="jobs-group-tag">Group</span>}
                      <span className="jobs-card-count hud-mono">
                        {max == null
                          ? `${claims.length} on it`
                          : `${claims.length} of ${max}${full ? ' · full' : spots > 0 ? ` · ${spots} left` : ''}`}
                      </span>
                    </div>

                    {t.description && <p className="jobs-card-desc">{t.description}</p>}

                    {reqs.length > 0 && (
                      <div className="jobs-card-skills">
                        {reqs.map(s => (
                          <span key={s.id} className={`jobs-skill-badge${s.safety_critical ? ' safety' : ''}`}>
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Claimant list with per-claimant state (+ staff sign-off) */}
                    {claims.length > 0 && (
                      <ul className="jobs-claimants">
                        {claims.map(c => (
                          <li key={c.member_id} className="jobs-claimant">
                            <span className="jobs-claimant-name">{nameOf(c)}</span>
                            <span className={`jobs-claim-state jobs-claim-${c.status}`}>{CLAIM_LABELS[c.status]}</span>
                            {isStaff && c.status === 'submitted' && (
                              <span className="jobs-claimant-actions">
                                <button className="jobs-link-btn" disabled={!!busy[t.id]} onClick={() => verify(t.id, c.member_id, true)}>Approve</button>
                                <button className="jobs-link-btn jobs-link-danger" disabled={!!busy[t.id]} onClick={() => verify(t.id, c.member_id, false)}>Reject</button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="jobs-card-actions">
                      {/* My own claim lifecycle */}
                      {myClaim ? (
                        myClaim.status === 'claimed' ? (
                          <>
                            <button className="jobs-btn jobs-btn-done" disabled={!!busy[t.id]} onClick={() => submit(t.id)}>Mark done</button>
                            <button className="jobs-btn jobs-btn-release" disabled={!!busy[t.id]} onClick={() => release(t.id)}>Release</button>
                          </>
                        ) : myClaim.status === 'submitted' ? (
                          <span className="jobs-note">Awaiting sign-off</span>
                        ) : (
                          <span className="jobs-note jobs-note-done">Done ✓</span>
                        )
                      ) : t.status === 'open' ? (
                        full
                          ? <span className="jobs-note">Full</span>
                          : missing.length > 0
                            ? <span className="jobs-locked">🔒 Needs: {missing.map(s => s.name).join(', ')}</span>
                            : <button className="jobs-btn jobs-btn-claim" disabled={!!busy[t.id]} onClick={() => claim(t.id)}>Claim</button>
                      ) : (
                        <span className="jobs-note">{t.status === 'completed' ? 'Completed ✓' : 'Closed'}</span>
                      )}

                      {isStaff && (
                        <span className="jobs-staff-actions">
                          {t.status === 'open'      && <button className="jobs-link-btn" disabled={!!busy[t.id]} onClick={() => setJobStatus(t, 'closed')}>Close</button>}
                          {t.status === 'closed'    && <button className="jobs-link-btn" disabled={!!busy[t.id]} onClick={() => setJobStatus(t, 'open')}>Reopen</button>}
                          {t.status !== 'completed' && <button className="jobs-link-btn" disabled={!!busy[t.id]} onClick={() => setJobStatus(t, 'completed')}>Complete</button>}
                          {t.status === 'completed' && <button className="jobs-link-btn" disabled={!!busy[t.id]} onClick={() => setJobStatus(t, 'open')}>Reopen</button>}
                          <button className="jobs-link-btn" disabled={formOpen} onClick={() => openEdit(t)}>Edit</button>
                          <button className="jobs-link-btn jobs-link-danger" disabled={!!busy[t.id]} onClick={() => remove(t)}>Delete</button>
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}
