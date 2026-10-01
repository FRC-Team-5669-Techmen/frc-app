import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { computeHoursMs, fmtHours } from './hoursUtils'
import { fetchAllRows } from './fetchAllRows'
import { RoleBadge, roleColor } from './roles'
import { displayName } from './names'
import { CAPABILITIES, isStaffRoles, loadAllGrants, setCapability } from './permissions'
import './RosterPage.css'

const ALL_ROLES    = ['student', 'mentor', 'lead', 'admin', 'parent']
const ALL_STATUSES = ['active', 'inactive', 'alumni']
const ROLE_RANK    = ['admin', 'lead', 'mentor', 'student', 'parent']
const topRole = (roles = []) => ROLE_RANK.find(r => roles.includes(r))
const roleRank = (roles = []) => {
  const i = ROLE_RANK.indexOf(topRole(roles))
  return i === -1 ? ROLE_RANK.length : i
}

const SORT_COLS = [
  ['name',    'Name'],
  ['subteam', 'Subteam'],
  ['role',    'Role'],
  ['hours',   'Hours'],
]

export default function RosterPage() {
  const [members, setMembers]     = useState(null)
  const [denied, setDenied]       = useState(false)
  const [pageError, setPageError] = useState('')
  const [saving, setSaving]       = useState({})
  const [domains, setDomains]     = useState([])
  const [newDomain, setNewDomain] = useState('')
  const [expanded, setExpanded]   = useState(() => new Set())
  const [links, setLinks]         = useState([])        // guardian_links rows
  const [linkPick, setLinkPick]   = useState({})        // parent_id -> selected student_id
  const [hoursById, setHoursById] = useState({})        // member_id -> total hours (number)
  const [query, setQuery]         = useState('')        // name/nickname/email search
  const [sort, setSort]           = useState({ col: 'role', dir: 'asc' })  // default: role order, pending last
  const [delTarget, setDelTarget] = useState(null)      // member being deleted, or null
  const [delConfirm, setDelConfirm] = useState('')      // typed full-name confirmation
  const [deleting, setDeleting]   = useState(false)
  // Per-member capabilities (supabase/migrations/0004_member_permissions.sql).
  // grantState: 'loading' | 'ok' | 'missing' (0004 not applied yet) | 'error'
  const [grants, setGrants]       = useState({})        // member_id -> capability keys
  const [grantState, setGrantState] = useState('loading')
  const [grantError, setGrantError] = useState('')

  useEffect(() => { load(); loadDomains(); loadLinks(); loadHours(); loadGrants() }, [])

  async function loadGrants() {
    const r = await loadAllGrants(supabase)
    setGrants(r.byMember)
    setGrantState(r.state)
    setGrantError(r.state === 'error' ? (r.error?.message ?? 'Could not load permissions') : '')
  }

  // Grant / revoke through the admin RPCs, never a direct write: writes on
  // member_permissions are revoked, and the RPC checks is_admin() itself, so a
  // refusal raises instead of "saving" 0 rows the way member_roles used to.
  async function toggleCapability(memberId, key, has) {
    const sk = `${memberId}_cap_${key}`
    setSaving(s => ({ ...s, [sk]: true }))
    const r = await setCapability(supabase, memberId, key, !has)
    setSaving(s => { const n = { ...s }; delete n[sk]; return n })
    if (r.state === 'missing') { setGrantState('missing'); return }
    if (!r.ok) { setPageError(r.error?.message ?? 'Could not change the permission'); return }
    setGrants(g => {
      const cur = g[memberId] ?? []
      return { ...g, [memberId]: has ? cur.filter(k => k !== key) : [...new Set([...cur, key])].sort() }
    })
  }

  async function loadLinks() {
    const { data } = await supabase.from('guardian_links').select('parent_id, student_id')
    setLinks(data ?? [])
  }

  async function linkStudent(parentId) {
    const studentId = linkPick[parentId]
    if (!studentId) return
    const key = `${parentId}_link`
    setSaving(s => ({ ...s, [key]: true }))
    const { error } = await supabase.rpc('link_guardian', { p_parent: parentId, p_student: studentId })
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
    if (error) { setPageError(error.message); return }
    setLinks(ls => ls.some(l => l.parent_id === parentId && l.student_id === studentId)
      ? ls : [...ls, { parent_id: parentId, student_id: studentId }])
    setLinkPick(p => ({ ...p, [parentId]: '' }))
  }

  async function unlinkStudent(parentId, studentId) {
    const { error } = await supabase.rpc('unlink_guardian', { p_parent: parentId, p_student: studentId })
    if (error) { setPageError(error.message); return }
    setLinks(ls => ls.filter(l => !(l.parent_id === parentId && l.student_id === studentId)))
  }

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function load() {
    const { data, error } = await supabase.rpc('admin_get_members')
    if (error) {
      // 42501 is insufficient_privilege (an execute grant revoked, or a check
      // raised with that errcode). The deployed admin_get_members raises its
      // admin check as P0001 with this text (admin_member_management.sql), so
      // the text match is what fires today and has to stay.
      if (error.code === '42501' || error.message.includes('Permission denied')) setDenied(true)
      else setPageError(error.message)
      setMembers([])
      return
    }
    // admin_get_members() doesn't return geofence_exempt — fetch it separately
    // and merge onto each member by id.
    const { data: exemptRows } = await supabase.from('profiles').select('id, geofence_exempt')
    const exemptById = Object.fromEntries((exemptRows ?? []).map(r => [r.id, r.geofence_exempt === true]))
    setMembers((data ?? []).map(m => ({ ...m, geofence_exempt: exemptById[m.id] ?? false })))
  }

  async function loadDomains() {
    const { data } = await supabase
      .from('allowed_domains')
      .select('domain')
      .order('domain')
    setDomains(data?.map(d => d.domain) ?? [])
  }

  // Total hours per member (attendance + verified logged hours) for sorting.
  // Every page of both team-wide reads (src/fetchAllRows.js): an unranged read
  // stops at the API's 1000-row cap, which the team passes inside a season, and
  // oldest-first that drops this week's sessions from every member's total.
  async function loadHours() {
    const [{ data: ae }, { data: lh }] = await Promise.all([
      fetchAllRows(() => supabase.from('attendance_events').select('id, user_id, type, event_time').order('event_time').order('id')),
      fetchAllRows(() => supabase.from('logged_hours').select('id, member_id, hours').eq('status', 'verified').order('id')),
    ])
    const byId = {}
    const evByMember = {}
    for (const e of ae ?? []) (evByMember[e.user_id] ??= []).push(e)
    for (const [id, evts] of Object.entries(evByMember)) {
      byId[id] = (byId[id] ?? 0) + computeHoursMs(evts) / 3600000
    }
    for (const l of lh ?? []) byId[l.member_id] = (byId[l.member_id] ?? 0) + parseFloat(l.hours)
    setHoursById(byId)
  }

  async function approve(memberId) {
    const key = `${memberId}_approve`
    setSaving(s => ({ ...s, [key]: true }))
    // Approve the member and ensure the default student role (idempotent)
    const { error: e1 } = await supabase.from('profiles').update({ approved: true }).eq('id', memberId)
    const { error: e2 } = await supabase
      .from('member_roles')
      .upsert({ member_id: memberId, role: 'student' }, { onConflict: 'member_id,role', ignoreDuplicates: true })
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
    if (e1 || e2) { setPageError((e1 || e2).message); return }
    setMembers(ms => ms.map(m =>
      m.id !== memberId ? m : {
        ...m,
        approved: true,
        roles: m.roles?.includes('student') ? m.roles : [...(m.roles ?? []), 'student'].sort(),
      }
    ))
  }

  async function addDomain(e) {
    e.preventDefault()
    const d = newDomain.trim().toLowerCase()
    if (!d) return
    const { error } = await supabase.from('allowed_domains').insert({ domain: d })
    if (error) { setPageError(error.message); return }
    setNewDomain('')
    setDomains(ds => [...ds, d].sort())
  }

  async function removeDomain(d) {
    if (!window.confirm(`Remove ${d}? New sign-ins from @${d} will need approval.`)) return
    const { error } = await supabase.from('allowed_domains').delete().eq('domain', d)
    if (error) { setPageError(error.message); return }
    setDomains(ds => ds.filter(x => x !== d))
  }

  async function toggleRole(memberId, role, currentRoles) {
    const key = `${memberId}_${role}`
    setSaving(s => ({ ...s, [key]: true }))
    const has = currentRoles.includes(role)
    // Route through a SECURITY DEFINER RPC: a direct client write on member_roles
    // silently no-ops (0 rows, no error) when the row policy doesn't match, which
    // is why role edits used to "save" in the UI but never persist. The RPC
    // enforces admin server-side and raises a real error otherwise.
    const { error } = await supabase.rpc('admin_set_member_role', {
      p_member: memberId, p_role: role, p_grant: !has,
    })
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
    if (error) { setPageError(error.message); return }
    setMembers(ms => ms.map(m =>
      m.id !== memberId ? m : {
        ...m,
        roles: has
          ? (m.roles ?? []).filter(r => r !== role)
          : [...(m.roles ?? []), role].sort(),
      }
    ))
  }

  async function deleteMember() {
    if (!delTarget || delConfirm.trim() !== (delTarget.full_name ?? '').trim()) return
    setDeleting(true)
    const { error } = await supabase.rpc('admin_delete_member', { p_member: delTarget.id })
    setDeleting(false)
    if (error) { setPageError(error.message); return }
    const id = delTarget.id
    setMembers(ms => ms.filter(m => m.id !== id))
    setLinks(ls => ls.filter(l => l.parent_id !== id && l.student_id !== id))
    setExpanded(prev => { const n = new Set(prev); n.delete(id); return n })
    setDelTarget(null)
    setDelConfirm('')
  }

  async function setStatus(memberId, status) {
    const key = `${memberId}_status`
    setSaving(s => ({ ...s, [key]: true }))
    const { error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', memberId)
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
    if (error) { setPageError(error.message); return }
    setMembers(ms => ms.map(m => m.id === memberId ? { ...m, status } : m))
  }

  // Per-student geofence exemption: lets a member (e.g. an iPhone with flaky GPS)
  // check in without the location gate. Mirrors setStatus.
  async function toggleGeoExempt(memberId, next) {
    const key = `${memberId}_geo`
    setSaving(s => ({ ...s, [key]: true }))
    const { error } = await supabase
      .from('profiles')
      .update({ geofence_exempt: next })
      .eq('id', memberId)
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
    if (error) { setPageError(error.message); return }
    setMembers(ms => ms.map(m => m.id === memberId ? { ...m, geofence_exempt: next } : m))
  }

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (members ?? []).filter(m => {
      if (!q) return true
      return [m.full_name, m.nickname, m.email].some(v => (v ?? '').toLowerCase().includes(q))
    })
    const dir = sort.dir === 'desc' ? -1 : 1
    const byName = (a, b) => displayName(a).localeCompare(displayName(b))
    const cmp = (a, b) => {
      switch (sort.col) {
        case 'hours':
          return ((hoursById[a.id] ?? 0) - (hoursById[b.id] ?? 0)) * dir || byName(a, b)
        case 'subteam':
          return ((a.subteams ?? [])[0] ?? '').localeCompare((b.subteams ?? [])[0] ?? '') * dir || byName(a, b)
        case 'role': {
          // Order: admin, (lead), mentor, student, parent — then pending
          // (unapproved) members last, regardless of role.
          const rank = m => m.approved === false ? ROLE_RANK.length + 1 : roleRank(m.roles)
          return (rank(a) - rank(b)) * dir || byName(a, b)
        }
        default:
          return byName(a, b) * dir
      }
    }
    return [...list].sort(cmp)
  }, [members, query, sort, hoursById])

  function toggleSort(col) {
    setSort(s => s.col === col
      ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: col === 'hours' ? 'desc' : 'asc' })
  }

  if (members === null) {
    return <div className="roster-loading"><div className="roster-spinner" /></div>
  }

  if (denied) {
    return (
      <div className="roster-wrap">
        <div className="roster-denied">You need the admin role to view this page.</div>
      </div>
    )
  }

  return (
    <div className="roster-wrap">
      <div className="roster-body">
        {pageError && (
          <p className="roster-page-error" onClick={() => setPageError('')}>{pageError}</p>
        )}

        <div className="roster-domains">
          <h2 className="roster-domains-title">Allowed sign-in domains</h2>
          <form className="roster-domain-add" onSubmit={addDomain}>
            <input
              className="roster-domain-input"
              type="text"
              placeholder="example.edu"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
            />
            <button className="roster-domain-btn" type="submit">Add</button>
          </form>
          <div className="roster-domain-list">
            {domains.length === 0 && <span className="roster-domain-none">No domains yet.</span>}
            {domains.map(d => (
              <span key={d} className="roster-domain-chip">
                {d}
                <button
                  className="roster-domain-remove"
                  onClick={() => removeDomain(d)}
                  aria-label={`Remove ${d}`}
                >×</button>
              </span>
            ))}
          </div>
        </div>

        <div className="roster-toolbar">
          <input
            className="roster-search"
            type="search"
            placeholder="Search name, nickname, or email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="roster-sort">
            <span className="roster-sort-label">Sort</span>
            {SORT_COLS.map(([col, label]) => (
              <button
                key={col}
                className={`roster-sort-btn${sort.col === col ? ' active' : ''}`}
                onClick={() => toggleSort(col)}
              >
                {label}{sort.col === col && (sort.dir === 'asc' ? ' ↑' : ' ↓')}
              </button>
            ))}
          </div>
        </div>

        <div className="roster-count">
          {visibleMembers.length} {visibleMembers.length === 1 ? 'member' : 'members'}
          {query && ` matching “${query}”`}
        </div>

        <div className="roster-list">
          {visibleMembers.length === 0 && (
            <p className="roster-domain-none">No members match your search.</p>
          )}
          {visibleMembers.map(m => {
            const open = expanded.has(m.id)
            const role = topRole(m.roles ?? [])
            const isParentMember = (m.roles ?? []).includes('parent')
            const linkedIds = isParentMember
              ? links.filter(l => l.parent_id === m.id).map(l => l.student_id) : []
            const linkedStudents = isParentMember
              ? members.filter(mm => linkedIds.includes(mm.id)) : []
            const candidates = isParentMember
              ? members.filter(mm => mm.id !== m.id && (mm.roles ?? []).includes('student') && !linkedIds.includes(mm.id))
              : []
            return (
              <div key={m.id} className={`roster-member${m.approved ? '' : ' roster-member-pending'}`}>
                <button
                  className="roster-member-head"
                  onClick={() => toggleExpand(m.id)}
                  aria-expanded={open}
                >
                  <span className={`roster-caret${open ? ' open' : ''}`}>▸</span>
                  <span className="roster-member-name">{displayName(m)}</span>
                  <span className="roster-member-email">{m.email}</span>
                  <span className="roster-member-tags">
                    {!m.approved && <span className="roster-pending-tag">Pending</span>}
                    {grantState === 'ok' && CAPABILITIES
                      .filter(c => (grants[m.id] ?? []).includes(c.key))
                      .map(c => <span key={c.key} className="roster-perm-tag" title={c.label}>{c.short}</span>)}
                    {role && <RoleBadge role={role} />}
                    <span
                      className={`roster-status-dot status-dot-${m.status ?? 'active'}`}
                      title={m.status ?? 'active'}
                    />
                  </span>
                </button>

                {open && (
                  <div className="roster-member-detail">
                    <div className="roster-detail-row">
                      <span className="roster-detail-label">Email</span>
                      <span className="roster-detail-value">{m.email}</span>
                    </div>
                    <div className="roster-detail-row">
                      <span className="roster-detail-label">Subteams</span>
                      {(m.subteams ?? []).length === 0
                        ? <span className="roster-detail-none">—</span>
                        : <div className="subteam-chips">
                            {m.subteams.map(st => <span key={st} className="subteam-chip">{st}</span>)}
                          </div>}
                    </div>
                    <div className="roster-detail-row">
                      <span className="roster-detail-label">Roles</span>
                      <div className="role-checks">
                        {ALL_ROLES.map(r => {
                          const on  = (m.roles ?? []).includes(r)
                          const key = `${m.id}_${r}`
                          return (
                            <label
                              key={r}
                              className={`role-chip${on ? ' role-on' : ''}`}
                              style={on ? { color: roleColor(r), borderColor: roleColor(r) } : undefined}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={!!saving[key]}
                                onChange={() => toggleRole(m.id, r, m.roles ?? [])}
                              />
                              {r}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                    <div className="roster-detail-row">
                      <span className="roster-detail-label">Permissions</span>
                      {grantState === 'missing' ? (
                        <span className="roster-detail-none roster-perm-unset">
                          Not set up yet. Apply supabase/migrations/0004_member_permissions.sql to grant these.
                        </span>
                      ) : grantState === 'loading' ? (
                        <span className="roster-detail-none">Loading…</span>
                      ) : grantState === 'error' ? (
                        <span className="roster-detail-none">Could not load permissions: {grantError}</span>
                      ) : (
                        <div className="roster-perms">
                          {CAPABILITIES.map(c => {
                            const on  = (grants[m.id] ?? []).includes(c.key)
                            const key = `${m.id}_cap_${c.key}`
                            return (
                              <button
                                key={c.key}
                                type="button"
                                className={`roster-perm-toggle${on ? ' on' : ''}`}
                                aria-pressed={on}
                                title={c.hint}
                                disabled={!!saving[key]}
                                onClick={() => toggleCapability(m.id, c.key, on)}
                              >{c.label}</button>
                            )
                          })}
                          {isStaffRoles(m.roles) && (
                            <span className="roster-perm-note">Their staff role already allows this.</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="roster-detail-row">
                      <span className="roster-detail-label">Status</span>
                      <select
                        value={m.status ?? 'active'}
                        disabled={!!saving[`${m.id}_status`]}
                        onChange={e => setStatus(m.id, e.target.value)}
                        className={`status-select status-${m.status ?? 'active'}`}
                      >
                        {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="roster-detail-row">
                      <span className="roster-detail-label">Geo exempt</span>
                      <select
                        value={m.geofence_exempt ? 'yes' : 'no'}
                        disabled={!!saving[`${m.id}_geo`]}
                        onChange={e => toggleGeoExempt(m.id, e.target.value === 'yes')}
                        className="status-select"
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    <div className="roster-detail-row">
                      <span className="roster-detail-label">Access</span>
                      {m.approved
                        ? <span className="roster-approved">Approved</span>
                        : <button
                            className="roster-approve-btn"
                            disabled={!!saving[`${m.id}_approve`]}
                            onClick={() => approve(m.id)}
                          >Approve</button>}
                    </div>
                    {isParentMember && (
                      <div className="roster-detail-row">
                        <span className="roster-detail-label">Students</span>
                        <div className="roster-guardian">
                          {linkedStudents.length === 0
                            ? <span className="roster-detail-none">No students linked</span>
                            : <div className="roster-guardian-chips">
                                {linkedStudents.map(st => (
                                  <span key={st.id} className="roster-guardian-chip">
                                    {displayName(st)}
                                    <button
                                      className="roster-guardian-remove"
                                      onClick={() => unlinkStudent(m.id, st.id)}
                                      aria-label={`Unlink ${displayName(st)}`}
                                    >×</button>
                                  </span>
                                ))}
                              </div>}
                          <div className="roster-guardian-add">
                            <select
                              className="status-select roster-guardian-select"
                              value={linkPick[m.id] || ''}
                              onChange={e => setLinkPick(p => ({ ...p, [m.id]: e.target.value }))}
                            >
                              <option value="">Add a student…</option>
                              {candidates.map(c => (
                                <option key={c.id} value={c.id}>{displayName(c)}</option>
                              ))}
                            </select>
                            <button
                              className="roster-guardian-btn"
                              disabled={!linkPick[m.id] || !!saving[`${m.id}_link`]}
                              onClick={() => linkStudent(m.id)}
                            >Link</button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="roster-detail-row">
                      <span className="roster-detail-label">Hours</span>
                      <span className="roster-detail-value">{fmtHours(hoursById[m.id] ?? 0)}</span>
                    </div>
                    <div className="roster-detail-row">
                      <span className="roster-detail-label">Profile</span>
                      <Link to={`/members/${m.id}`} className="roster-skills-link">View skills</Link>
                    </div>
                    <div className="roster-detail-row">
                      <span className="roster-detail-label">Danger zone</span>
                      <button
                        className="roster-delete-btn"
                        onClick={() => { setDelTarget(m); setDelConfirm('') }}
                      >Delete account</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {delTarget && (
        <div className="roster-modal-backdrop" onClick={() => !deleting && setDelTarget(null)}>
          <div className="roster-modal" onClick={e => e.stopPropagation()}>
            <h2 className="roster-modal-title">Delete account</h2>
            <p className="roster-modal-text">
              This permanently removes <strong>{displayName(delTarget)}</strong> and all of their
              data — attendance, hours, job claims, skills, parent links, and notifications.
              This cannot be undone.
            </p>
            <p className="roster-modal-text">
              Type their full name <strong>{delTarget.full_name || '(no name on file)'}</strong> to confirm:
            </p>
            <input
              className="roster-modal-input"
              type="text"
              autoFocus
              value={delConfirm}
              placeholder={delTarget.full_name || ''}
              onChange={e => setDelConfirm(e.target.value)}
            />
            <div className="roster-modal-actions">
              <button
                className="roster-modal-cancel"
                onClick={() => { setDelTarget(null); setDelConfirm('') }}
                disabled={deleting}
              >Cancel</button>
              <button
                className="roster-modal-delete"
                disabled={deleting || delConfirm.trim() !== (delTarget.full_name ?? '').trim()}
                onClick={deleteMember}
              >{deleting ? 'Deleting…' : 'Delete permanently'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
