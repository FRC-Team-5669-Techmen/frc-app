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
  ['relevance', 'For you'],
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

const fmtWhen = iso =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtDur = ms => {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60)
  if (ms < 60000) return '—'
  return h === 0 ? `${m}m` : `${h}h ${m % 60}m`
}
const personName = p => (p?.nickname && p.nickname.trim()) || p?.full_name || 'Member'
const jobImageUrl = path => supabase.storage.from('jobs').getPublicUrl(path).data.publicUrl

// Accrue a member's time on one job from their attendance stream: a session
// counts when its 'in' event was stamped with this job id.
function sessionMsForJob(events, taskId) {
  let total = 0, openIn = null
  for (const e of [...events].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))) {
    if (e.type === 'in') openIn = e
    else if (e.type === 'out' && openIn) {
      if (openIn.job_id === taskId) total += new Date(e.event_time) - new Date(openIn.event_time)
      openIn = null
    }
  }
  if (openIn && openIn.job_id === taskId) total += Date.now() - new Date(openIn.event_time)
  return total
}

const EMPTY_FORM = {
  title: '', description: '', subteam: '', skillIds: [], group: false,
  maxClaimants: '', dueDate: '', links: [], images: [],
}

export default function JobsPage({ session, hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const isAdmin = hasRole('admin')
  const uid = session.user.id

  const [tasks, setTasks]     = useState(null)
  const [reqMap, setReqMap]   = useState({})        // task_id -> [skill_id]
  const [skills, setSkills]   = useState({})        // skill_id -> { name, safety_critical }
  const [myCerts, setMyCerts] = useState(new Set()) // skill_ids the member is certified in
  const [claimsMap, setClaimsMap] = useState({})    // task_id -> [claim rows]
  const [certsByMember, setCertsByMember] = useState({}) // member_id -> Set(certified skill_ids); claimants only
  const [viewerTeam, setViewerTeam] = useState({ subteams: [], disciplines: [] }) // for "For you" relevance
  const [busy, setBusy]       = useState({})
  const [error, setError]     = useState('')

  const [formOpen, setFormOpen]     = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)

  // Browsing: search, sort, collapsible groups, row→detail selection.
  const [query, setQuery]           = useState('')
  const [sort, setSort]             = useState({ col: 'relevance', dir: 'asc' })
  const [collapsed, setCollapsed]   = useState(() => new Set())
  const [selectedId, setSelectedId] = useState(null)

  // Detail-view data for the selected job.
  const [updates, setUpdates]             = useState([])  // progress thread
  const [timeByMember, setTimeByMember]   = useState({})  // member_id -> ms on this job
  const [updBody, setUpdBody]             = useState('')
  const [updImg, setUpdImg]               = useState(null)
  const [updBusy, setUpdBusy]             = useState(false)
  const [imgBusy, setImgBusy]             = useState(false)

  const load = useCallback(async () => {
    const [tRes, trsRes, skRes, msRes, tcRes, pfRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('task_required_skills').select('task_id, skill_id'),
      supabase.from('skills').select('id, name, safety_critical').order('name'),
      supabase.from('member_skills').select('skill_id').eq('member_id', uid).eq('status', 'certified'),
      supabase.from('task_claims').select('task_id, member_id, status, profiles!task_claims_member_id_fkey(full_name, avatar_url)'),
      supabase.from('profiles').select('subteams, disciplines').eq('id', uid).single(),
    ])
    if (tRes.error) { setError(tRes.error.message); setTasks([]); return }

    const rm = {}
    for (const r of trsRes.data ?? []) (rm[r.task_id] ??= []).push(r.skill_id)
    const sk = {}
    for (const s of skRes.data ?? []) sk[s.id] = { name: s.name, safety_critical: s.safety_critical }
    const cm = {}
    for (const c of tcRes.data ?? []) (cm[c.task_id] ??= []).push(c)

    // Certified skills for everyone who has claimed a job — needed to compute
    // collective cert coverage (which claimant covers which required cert).
    const claimantIds = [...new Set((tcRes.data ?? []).map(c => c.member_id))]
    const cbRes = claimantIds.length
      ? await supabase.from('member_skills').select('member_id, skill_id').eq('status', 'certified').in('member_id', claimantIds)
      : { data: [] }
    const cbm = {}
    for (const r of cbRes.data ?? []) (cbm[r.member_id] ??= new Set()).add(r.skill_id)

    setReqMap(rm)
    setSkills(sk)
    setMyCerts(new Set((msRes.data ?? []).map(m => m.skill_id)))
    setClaimsMap(cm)
    setCertsByMember(cbm)
    setViewerTeam({
      subteams:    pfRes.data?.subteams    ?? [],
      disciplines: pfRes.data?.disciplines ?? [],
    })
    setTasks(tRes.data ?? [])
  }, [uid])

  useEffect(() => { load() }, [load])

  // Detail-view data: progress thread + per-member time on the selected job.
  const loadDetail = useCallback(async (taskId) => {
    const memberIds = (claimsMap[taskId] ?? []).map(c => c.member_id)
    const [upRes, attRes] = await Promise.all([
      supabase.from('task_updates')
        .select('id, body, image_path, created_at, member_id, author:member_id(full_name, nickname)')
        .eq('task_id', taskId).order('created_at', { ascending: true }),
      memberIds.length
        ? supabase.from('attendance_events').select('user_id, type, event_time, job_id').in('user_id', memberIds)
        : Promise.resolve({ data: [] }),
    ])
    setUpdates(upRes.data ?? [])
    const evByMember = {}
    for (const e of attRes.data ?? []) (evByMember[e.user_id] ??= []).push(e)
    const tbm = {}
    for (const [mid, evs] of Object.entries(evByMember)) tbm[mid] = sessionMsForJob(evs, taskId)
    setTimeByMember(tbm)
  }, [claimsMap])

  useEffect(() => {
    if (!selectedId) { setUpdates([]); setTimeByMember({}); setUpdBody(''); setUpdImg(null); return }
    loadDetail(selectedId)
  }, [selectedId, loadDetail])

  // Upload an image to the 'jobs' bucket; returns the stored path.
  async function uploadImage(file, prefix) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('jobs').upload(path, file, { cacheControl: '3600', upsert: false })
    if (error) throw error
    return path
  }

  // ── Progress updates ──
  async function postUpdate() {
    if (!updBody.trim() && !updImg) return
    setUpdBusy(true); setError('')
    try {
      let image_path = null
      if (updImg) image_path = await uploadImage(updImg, `update/${selectedId}`)
      const { error } = await supabase.from('task_updates')
        .insert({ task_id: selectedId, member_id: uid, body: updBody.trim() || null, image_path })
      if (error) throw error
      setUpdBody(''); setUpdImg(null)
      loadDetail(selectedId)
    } catch (err) { setError(err.message) }
    setUpdBusy(false)
  }

  // ── Time tracking: link my current open session to this job ──
  async function logSessionToJob(taskId) {
    const { error } = await supabase.rpc('set_session_job', { p_task: taskId })
    if (error) { setError(error.message); return }
    setError(''); loadDetail(taskId)
  }

  // ── Admin: undo a completed/approved claim ──
  async function undoApproval(t, member) {
    const msg = t.status === 'completed'
      ? 'Undo this approval? The claim returns to "submitted" for re-review and the job reopens.'
      : 'Undo this approval? The claim returns to "submitted" for re-review.'
    if (!window.confirm(msg)) return
    setBusy(b => ({ ...b, [t.id]: true }))
    const { error } = await supabase.rpc('admin_revert_claim', { p_task: t.id, p_member: member })
    setBusy(b => { const n = { ...b }; delete n[t.id]; return n })
    if (error) { setError(error.message); return }
    setError(''); load(); loadDetail(t.id)
  }

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
  // Collective cert coverage: certs are covered by the GROUP of claimants, not
  // any single member. For each required cert, which claim rows cover it.
  function coverageFor(taskId) {
    const claims = claimsMap[taskId] ?? []
    return requiredSkillsFor(taskId).map(s => ({
      ...s,
      coverers: claims.filter(c => certsByMember[c.member_id]?.has(s.id)),
    }))
  }
  // The current member may claim a cert-gated job if they hold AT LEAST ONE of
  // its required certs (none required → open to all).
  function canClaimCerts(taskId) {
    const reqIds = reqMap[taskId] ?? []
    return reqIds.length === 0 || reqIds.some(id => myCerts.has(id))
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
      links: Array.isArray(t.links) ? t.links : [],
      images: Array.isArray(t.images) ? t.images : [],
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

  // ── Form: reference links + image uploads ──
  function addLink()              { setForm(f => ({ ...f, links: [...f.links, { label: '', url: '' }] })) }
  function setLink(i, key, val)   { setForm(f => ({ ...f, links: f.links.map((l, idx) => idx === i ? { ...l, [key]: val } : l) })) }
  function removeLink(i)          { setForm(f => ({ ...f, links: f.links.filter((_, idx) => idx !== i) })) }
  function removeFormImage(path)  { setForm(f => ({ ...f, images: f.images.filter(p => p !== path) })) }
  async function onFormImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImgBusy(true); setError('')
    try {
      const path = await uploadImage(file, `task/${editTarget?.id ?? 'new'}`)
      setForm(f => ({ ...f, images: [...f.images, path] }))
    } catch (err) { setError(err.message) }
    setImgBusy(false)
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
      links:       form.links.map(l => ({ label: (l.label || '').trim(), url: (l.url || '').trim() }))
                             .filter(l => l.url),
      images:      form.images,
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

  // ── "For you" relevance ──
  // A job is relevant when its subteam is one the viewer belongs to. (Discipline
  // relevance — a required skill belonging to one of the viewer's disciplines —
  // is NOT wired: skills carry only a free-text `category` with no FK or join
  // table to the disciplines catalog, so there is no clean skill→discipline link.
  // Subteam-only is the documented fallback; `disciplineRelevant` stays as a hook
  // for when such a link exists.)
  const mySubteams = new Set((viewerTeam.subteams ?? []).map(s => s.toLowerCase()))
  const subteamRelevant    = t => !!t.subteam && mySubteams.has(t.subteam.toLowerCase())
  const disciplineRelevant = () => false
  const relevanceMode = sort.col === 'relevance'

  // Search → filter → group by subteam → sort within each group.
  const q = query.trim().toLowerCase()
  const certKey = t => requiredSkillsFor(t.id).map(s => s.name).sort().join(', ')
  const filtered = tasks.filter(t => !q || t.title.toLowerCase().includes(q))
  function cmp(a, b) {
    const dir = sort.dir === 'desc' ? -1 : 1
    const tie = a.title.localeCompare(b.title)
    switch (sort.col) {
      case 'relevance': {
        // Discipline-relevant first (inactive — no skill→discipline link), then
        // fall back to the current tiebreak (status order, then title).
        const dr = (disciplineRelevant(b) ? 1 : 0) - (disciplineRelevant(a) ? 1 : 0)
        if (dr) return dr
        return (STATUS_RANK[displayStatus(a)] - STATUS_RANK[displayStatus(b)]) || tie
      }
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
  // In "For you" mode, the viewer's matching subteams lead, then the rest A→Z;
  // any explicit sort drops back to plain alphabetical (overrides relevance).
  const groupNames = Object.keys(groups).sort((a, b) => {
    if (relevanceMode) {
      const ra = mySubteams.has(a.toLowerCase()) ? 0 : 1
      const rb = mySubteams.has(b.toLowerCase()) ? 0 : 1
      if (ra !== rb) return ra - rb
    }
    return a.localeCompare(b)
  })
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
                <label className="jobs-label">Reference links</label>
                {form.links.map((l, i) => (
                  <div key={i} className="jobs-link-row">
                    <input
                      type="text" className="jobs-input jobs-link-label" placeholder="Label"
                      value={l.label} onChange={e => setLink(i, 'label', e.target.value)}
                    />
                    <input
                      type="url" className="jobs-input jobs-link-url" placeholder="https://…"
                      value={l.url} onChange={e => setLink(i, 'url', e.target.value)}
                    />
                    <button type="button" className="jobs-link-remove" onClick={() => removeLink(i)} aria-label="Remove link">×</button>
                  </div>
                ))}
                <button type="button" className="jobs-link-add" onClick={addLink}>+ Add link</button>
              </div>

              <div className="jobs-field">
                <label className="jobs-label">Images</label>
                {form.images.length > 0 && (
                  <div className="jobs-img-grid">
                    {form.images.map(path => (
                      <div key={path} className="jobs-img-thumb">
                        <img src={jobImageUrl(path)} alt="" />
                        <button type="button" className="jobs-img-remove" onClick={() => removeFormImage(path)} aria-label="Remove image">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="jobs-img-upload">
                  <input type="file" accept="image/*" onChange={onFormImage} disabled={imgBusy} />
                  {imgBusy ? 'Uploading…' : '+ Upload image'}
                </label>
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
                    const ds        = displayStatus(t)
                    const meta      = STATUS_META[ds]
                    const reqs      = requiredSkillsFor(t.id)
                    const uncovered = coverageFor(t.id).filter(c => c.coverers.length === 0)
                    const claims    = claimsMap[t.id] ?? []
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
                              className={`jobs-row-cert${uncovered.length > 0 ? ' locked' : ''}`}
                              title={uncovered.length > 0
                                ? `Cert gap: ${uncovered.map(s => s.name).join(', ')}`
                                : `Certs covered: ${reqs.map(s => s.name).join(', ')}`}
                            >
                              {uncovered.length > 0 ? `⚠ ${uncovered.length} cert gap` : '✓ certs'}
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
        const t        = selectedTask
        const ds       = displayStatus(t)
        const meta     = STATUS_META[ds]
        const reqs     = requiredSkillsFor(t.id)
        const coverage = coverageFor(t.id)
        const uncovered = coverage.filter(c => c.coverers.length === 0)
        const fullyCovered = reqs.length === 0 || uncovered.length === 0
        const canClaim = canClaimCerts(t.id)
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

              {error && <p className="jobs-error" onClick={() => setError('')}>{error}</p>}

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
                <div className="jobs-coverage">
                  <div className="jobs-coverage-head">
                    <span className="jobs-coverage-title">Cert coverage</span>
                    <span className={`jobs-coverage-state${fullyCovered ? ' ok' : ' gap'}`}>
                      {fullyCovered
                        ? 'Fully staffed ✓'
                        : `Not fully staffed · ${uncovered.length} uncovered`}
                    </span>
                  </div>
                  <ul className="jobs-cov-list">
                    {coverage.map(c => (
                      <li key={c.id} className={`jobs-cov-row${c.coverers.length === 0 ? ' uncovered' : ''}`}>
                        <span className="jobs-cov-cert">
                          {c.name}{c.safety_critical && <span className="jobs-cov-safety" title="Safety critical"> ⚠</span>}
                        </span>
                        <span className="jobs-cov-by">
                          {c.coverers.length === 0
                            ? 'uncovered'
                            : c.coverers.map(cl => nameOf(cl)).join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(t.links) && t.links.length > 0 && (
                <div className="jobs-detail-links">
                  {t.links.map((l, i) => (
                    <a key={i} className="jobs-detail-link" href={l.url} target="_blank" rel="noopener noreferrer">
                      🔗 {l.label || l.url}
                    </a>
                  ))}
                </div>
              )}

              {Array.isArray(t.images) && t.images.length > 0 && (
                <div className="jobs-img-grid">
                  {t.images.map(path => (
                    <a key={path} className="jobs-img-thumb" href={jobImageUrl(path)} target="_blank" rel="noopener noreferrer">
                      <img src={jobImageUrl(path)} alt="" />
                    </a>
                  ))}
                </div>
              )}

              {claims.length > 0 && (
                <ul className="jobs-claimants">
                  {claims.map(c => (
                    <li key={c.member_id} className="jobs-claimant">
                      <span className="jobs-claimant-name">{nameOf(c)}</span>
                      <span className={`jobs-claim-state jobs-claim-${c.status}`}>{CLAIM_LABELS[c.status]}</span>
                      {timeByMember[c.member_id] > 0 && (
                        <span className="jobs-claimant-time hud-mono" title="Check-in time logged to this job">
                          ⏱ {fmtDur(timeByMember[c.member_id])}
                        </span>
                      )}
                      {isStaff && c.status === 'submitted' && (
                        <span className="jobs-claimant-actions">
                          <button className="jobs-link-btn" disabled={!!busy[t.id]} onClick={() => verify(t.id, c.member_id, true)}>Approve</button>
                          <button className="jobs-link-btn jobs-link-danger" disabled={!!busy[t.id]} onClick={() => verify(t.id, c.member_id, false)}>Reject</button>
                        </span>
                      )}
                      {isAdmin && c.status === 'completed' && (
                        <span className="jobs-claimant-actions">
                          <button className="jobs-link-btn jobs-link-danger" disabled={!!busy[t.id]} onClick={() => undoApproval(t, c.member_id)}>Undo approval</button>
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
                ) : null}

                {myClaim && myClaim.status !== 'completed' && (
                  <button
                    className="jobs-btn jobs-btn-release"
                    disabled={!!busy[t.id]}
                    onClick={() => logSessionToJob(t.id)}
                    title="Link your current check-in session to this job"
                  >I'm on this job</button>
                )}

                {!myClaim && (t.status === 'open' ? (
                  full
                    ? <span className="jobs-note">Full</span>
                    : !canClaim
                      ? <span className="jobs-locked">🔒 Needs one of: {reqs.map(s => s.name).join(', ')}</span>
                      : <button className="jobs-btn jobs-btn-claim" disabled={!!busy[t.id]} onClick={() => claim(t.id)}>Claim</button>
                ) : (
                  <span className="jobs-note">{t.status === 'completed' ? 'Completed ✓' : 'Closed'}</span>
                ))}

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

              {/* ── Progress updates thread ── */}
              <div className="jobs-thread">
                <h3 className="jobs-thread-title">Progress updates</h3>
                {updates.length === 0
                  ? <p className="jobs-thread-empty">No updates yet.</p>
                  : <ul className="jobs-thread-list">
                      {updates.map(u => (
                        <li key={u.id} className="jobs-update">
                          <div className="jobs-update-head">
                            <span className="jobs-update-author">{personName(u.author)}</span>
                            <span className="jobs-update-when hud-mono">{fmtWhen(u.created_at)}</span>
                          </div>
                          {u.body && <p className="jobs-update-body">{u.body}</p>}
                          {u.image_path && (
                            <a className="jobs-update-img" href={jobImageUrl(u.image_path)} target="_blank" rel="noopener noreferrer">
                              <img src={jobImageUrl(u.image_path)} alt="" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>}

                {(myClaim || isStaff) && (
                  <div className="jobs-update-compose">
                    <textarea
                      className="jobs-input jobs-textarea"
                      rows={2}
                      maxLength={1000}
                      placeholder="Post a progress update…"
                      value={updBody}
                      onChange={e => setUpdBody(e.target.value)}
                    />
                    <div className="jobs-update-compose-row">
                      <label className="jobs-img-upload jobs-img-upload-sm">
                        <input type="file" accept="image/*" onChange={e => setUpdImg(e.target.files?.[0] ?? null)} />
                        {updImg ? updImg.name.slice(0, 20) : '+ Image'}
                      </label>
                      <button
                        className="jobs-btn jobs-btn-claim"
                        disabled={updBusy || (!updBody.trim() && !updImg)}
                        onClick={postUpdate}
                      >{updBusy ? 'Posting…' : 'Post update'}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
