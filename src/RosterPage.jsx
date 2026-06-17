import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import './RosterPage.css'

const ALL_ROLES    = ['student', 'mentor', 'lead', 'admin', 'parent']
const ALL_STATUSES = ['active', 'inactive', 'alumni']
const ROLE_RANK    = ['admin', 'lead', 'mentor', 'student', 'parent']
const topRole = (roles = []) => ROLE_RANK.find(r => roles.includes(r))

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

  useEffect(() => { load(); loadDomains(); loadLinks() }, [])

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
      if (error.message.includes('Permission denied')) setDenied(true)
      else setPageError(error.message)
      setMembers([])
      return
    }
    setMembers(data ?? [])
  }

  async function loadDomains() {
    const { data } = await supabase
      .from('allowed_domains')
      .select('domain')
      .order('domain')
    setDomains(data?.map(d => d.domain) ?? [])
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
    const { error } = await supabase.from('allowed_domains').delete().eq('domain', d)
    if (error) { setPageError(error.message); return }
    setDomains(ds => ds.filter(x => x !== d))
  }

  async function toggleRole(memberId, role, currentRoles) {
    const key = `${memberId}_${role}`
    setSaving(s => ({ ...s, [key]: true }))
    const has = currentRoles.includes(role)
    const { error } = has
      ? await supabase.from('member_roles').delete().match({ member_id: memberId, role })
      : await supabase.from('member_roles').insert({ member_id: memberId, role })
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
    if (error) { setPageError(error.message); return }
    setMembers(ms => ms.map(m =>
      m.id !== memberId ? m : {
        ...m,
        roles: has
          ? m.roles.filter(r => r !== role)
          : [...m.roles, role].sort(),
      }
    ))
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

        <div className="roster-list">
          {members.map(m => {
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
                  <span className="roster-member-name">{m.full_name || '—'}</span>
                  <span className="roster-member-email">{m.email}</span>
                  <span className="roster-member-tags">
                    {!m.approved && <span className="roster-pending-tag">Pending</span>}
                    {role && <span className="roster-role-tag">{role}</span>}
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
                            <label key={r} className={`role-chip${on ? ' role-on' : ''}`}>
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
                                    {st.full_name || st.email}
                                    <button
                                      className="roster-guardian-remove"
                                      onClick={() => unlinkStudent(m.id, st.id)}
                                      aria-label={`Unlink ${st.full_name || st.email}`}
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
                                <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
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
                      <span className="roster-detail-label">Profile</span>
                      <Link to={`/members/${m.id}`} className="roster-skills-link">View skills</Link>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
