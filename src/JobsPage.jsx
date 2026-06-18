import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabase'
import './JobsPage.css'

// Mirrors the subteam vocabulary used for profiles.subteams (see ProfilePage).
// Offered as datalist suggestions; staff may also type a free value.
const SUBTEAMS = [
  'Mechanical', 'Electrical', 'Programming', 'CAD',
  'Fabrication', 'Media', 'Business/Outreach', 'Drive Team',
]

// Derived display status (richer than tasks.status) → label + color class.
// Scale: open=green, in progress=amber, needs-review=red, completed/closed=gray.
const STATUS_META = {
  open:      { label: 'Open',         cls: 'jobs-st-open' },
  progress:  { label: 'In progress',  cls: 'jobs-st-progress' },
  review:    { label: 'Needs review', cls: 'jobs-st-review' },
  completed: { label: 'Completed',    cls: 'jobs-st-completed' },
  closed:    { label: 'Closed',       cls: 'jobs-st-closed' },
}
const STATUS_RANK = { review: 0, progress: 1, open: 2, completed: 3, closed: 4 }

const SORT_COLS = [
  ['status', 'Status'],
  ['due',    'Due date'],
  ['cert',   'Cert'],
  ['title',  'Title'],
]

// Per-claimant state labels (task_claims.status).
const CLAIM_LABELS = {
  claimed:   'On it',
  submitted: 'Submitted',
  completed: 'Done ✓',
}

const fmtDue = d =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
const todayStr = () => new Date().toISOString().slice(0, 10)

const EMPTY_FORM = { title: '', description: '', subteam: '', skillIds: [], group: false, maxClaimants: '', dueDate: '' }

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

  // Browsing: search, sort, collapsible groups, row→detail selection.
  const [query, setQuery]           = useState('')
  const [sort, setSort]             = useState({ col: 'status', dir: 'asc' })
  const [collapsed, setCollapsed]   = useState(() => new Set())
  const [selectedId, setSelectedId] = useState(null)

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
      dueDate: t.due_date ?? '',
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
      due_date:    form.dueDate || null,
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
    setSelectedId(null)
    load()
  }

  // Richer per-job status than tasks.status: surfaces in-progress vs needs-review
  // from the claim lifecycle. Drives the color scale on rows and the detail view.
  function displayStatus(t) {
    if (t.status === 'completed') return 'completed'
    if (t.status === 'closed')    return 'closed'
    const claims = claimsMap[t.id] ?? []
    if (claims.some(c => c.status === 'submitted')) return 'review'
    if (claims.some(c => c.status === 'claimed'))   return 'progress'
    return 'open'
  }

  function toggleGroup(name) {
    setCollapsed(prev => {
      const n = new Set(prev)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })
  }
  function toggleSort(col) {
    setSort(s => s.col === col
      ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' })
  }

  // ── Render ──
  if (tasks === null) {
    return <div className="jobs-loading"><div className="jobs-spinner" /></div>
  }

  // Search → filter → group by subteam → sort within each group.
  const q = query.trim().toLowerCase()
  const certKey = t => requiredSkillsFor(t.id).map(s => s.name).sort().join(', ')
  const filtered = tasks.filter(t => !q || t.title.toLowerCase().includes(q))
  function cmp(a, b) {
    const dir = sort.dir === 'desc' ? -1 : 1
    const tie = a.title.localeCompare(b.title)
    switch (sort.col) {
      case 'status':
        return (STATUS_RANK[displayStatus(a)] - STATUS_RANK[displayStatus(b)]) * dir || tie
      case 'due':
        // Nulls always last regardless of direction.
        if (!a.due_date && !b.due_date) return tie
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date) * dir || tie
      case 'cert': {
        const ca = certKey(a), cb = certKey(b)
        if (!ca && cb) return 1
        if (ca && !cb) return -1
        return ca.localeCompare(cb) * dir || tie
      }
      default:
        return tie * dir
    }
  }
  const groups = {}
  for (const t of filtered) (groups[t.subteam || 'Other'] ??= []).push(t)
  const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b))
  for (const n of groupNames) groups[n].sort(cmp)

  const selectedTask = selectedId ? tasks.find(t => t.id === selectedId) : null
  const today = todayStr()

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
                <label className="jobs-label" htmlFor="job-due">Due date</label>
                <input
                  id="job-due" type="date"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="jobs-input" placeholder="Optional"
                />
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

        {/* ── Browse: search + sort ── */}
        {tasks.length === 0 && <p className="jobs-empty">No jobs posted yet.</p>}

        {tasks.length > 0 && (
          <div className="jobs-toolbar">
            <input
              className="jobs-search"
              type="search"
              placeholder="Search jobs by title…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <div className="jobs-sort">
              <span className="jobs-sort-label">Sort</span>
              {SORT_COLS.map(([col, label]) => (
                <button
                  key={col}
                  className={`jobs-sort-btn${sort.col === col ? ' active' : ''}`}
                  onClick={() => toggleSort(col)}
                >
                  {label}{sort.col === col && (sort.dir === 'asc' ? ' ↑' : ' ↓')}
                </button>
              ))}
            </div>
          </div>
        )}

        {tasks.length > 0 && groupNames.length === 0 && (
          <p className="jobs-empty">No jobs match “{query}”.</p>
        )}

        {/* ── Compact list rows, grouped by subteam (collapsible) ── */}
        {groupNames.map(name => {
          const rows = groups[name]
          const isCollapsed = collapsed.has(name)
          return (
            <div key={name} className="jobs-group">
              <button
                className="jobs-group-header"
                onClick={() => toggleGroup(name)}
                aria-expanded={!isCollapsed}
              >
                <span className={`jobs-group-caret${isCollapsed ? '' : ' open'}`}>▸</span>
                <span className="jobs-group-name">{name}</span>
                <span className="jobs-group-count hud-mono">{rows.length}</span>
              </button>

              {!isCollapsed && (
                <ul className="jobs-rows">
                  {rows.map(t => {
                    const ds      = displayStatus(t)
                    const meta    = STATUS_META[ds]
                    const reqs    = requiredSkillsFor(t.id)
                    const missing = missingFor(t.id)
                    const claims  = claimsMap[t.id] ?? []
                    const max     = t.max_claimants
                    const isGroup = max === null || max > 1
                    const overdue = t.due_date && t.due_date < today && (ds === 'open' || ds === 'progress')
                    return (
                      <li
                        key={t.id}
                        className={`jobs-row${selectedId === t.id ? ' selected' : ''}`}
                        onClick={() => setSelectedId(t.id)}
                      >
                        <span className={`jobs-row-pill ${meta.cls}`}>{meta.label}</span>
                        <span className="jobs-row-title">{t.title}</span>
                        <span className="jobs-row-meta hud-mono">
                          {t.due_date && (
                            <span className={`jobs-row-due${overdue ? ' overdue' : ''}`}>
                              {fmtDue(t.due_date)}
                            </span>
                          )}
                          <span className="jobs-row-count">
                            {max == null
                              ? `${claims.length} on it`
                              : `${claims.length}/${max}`}
                            {isGroup && <span className="jobs-row-grouptag">grp</span>}
                          </span>
                          {reqs.length > 0 && (
                            <span
                              className={`jobs-row-cert${missing.length > 0 ? ' locked' : ''}`}
                              title={reqs.map(s => s.name).join(', ')}
                            >
                              {missing.length > 0 ? '🔒' : '✓'} cert
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}

      </div>

      {/* ── Detail view ── */}
      {selectedTask && (() => {
        const t       = selectedTask
        const ds      = displayStatus(t)
        const meta    = STATUS_META[ds]
        const reqs    = requiredSkillsFor(t.id)
        const missing = missingFor(t.id)
        const claims  = claimsMap[t.id] ?? []
        const myClaim = claims.find(c => c.member_id === uid)
        const max     = t.max_claimants
        const isGroup = max === null || max > 1
        const full    = max != null && claims.length >= max
        const spots   = max == null ? null : max - claims.length
        const overdue = t.due_date && t.due_date < today && (ds === 'open' || ds === 'progress')
        const nameOf  = c => (c.member_id === uid ? 'You' : (c.profiles?.full_name || 'Member'))
        return (
          <div className="jobs-detail-backdrop" onClick={() => setSelectedId(null)}>
            <div className="jobs-detail" onClick={e => e.stopPropagation()}>
              <div className="jobs-detail-head">
                <span className={`jobs-row-pill ${meta.cls}`}>{meta.label}</span>
                <button className="jobs-detail-close" onClick={() => setSelectedId(null)} aria-label="Close">×</button>
              </div>

              <h2 className="jobs-detail-title">{t.title}</h2>

              <div className="jobs-detail-meta hud-mono">
                <span>{t.subteam || 'Other'}</span>
                {t.due_date && <span className={overdue ? 'jobs-row-due overdue' : 'jobs-row-due'}>Due {fmtDue(t.due_date)}</span>}
                <span>
                  {isGroup ? 'Group · ' : 'Solo · '}
                  {max == null
                    ? `${claims.length} on it`
                    : `${claims.length} of ${max}${full ? ' · full' : spots > 0 ? ` · ${spots} left` : ''}`}
                </span>
              </div>

              {t.description && <p className="jobs-detail-desc">{t.description}</p>}

              {reqs.length > 0 && (
                <div className="jobs-card-skills">
                  {reqs.map(s => (
                    <span key={s.id} className={`jobs-skill-badge${s.safety_critical ? ' safety' : ''}`}>
                      {s.name}
                    </span>
                  ))}
                </div>
              )}

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
                    <button className="jobs-link-btn" disabled={formOpen} onClick={() => { setSelectedId(null); openEdit(t) }}>Edit</button>
                    <button className="jobs-link-btn jobs-link-danger" disabled={!!busy[t.id]} onClick={() => remove(t)}>Delete</button>
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
