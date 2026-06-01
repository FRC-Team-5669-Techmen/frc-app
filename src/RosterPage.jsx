import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import './RosterPage.css'

const ALL_ROLES    = ['student', 'mentor', 'lead', 'admin']
const ALL_STATUSES = ['active', 'inactive', 'alumni']

export default function RosterPage() {
  const [members, setMembers]     = useState(null)
  const [denied, setDenied]       = useState(false)
  const [pageError, setPageError] = useState('')
  const [saving, setSaving]       = useState({})

  useEffect(() => { load() }, [])

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
        <div className="roster-table-wrap">
          <table className="roster-table">
            <thead>
              <tr>
                <th className="roster-th">Member</th>
                <th className="roster-th">Email</th>
                <th className="roster-th">Subteams</th>
                <th className="roster-th">Roles</th>
                <th className="roster-th">Status</th>
                <th className="roster-th"></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="roster-row">
                  <td className="roster-td roster-name">{m.full_name || '—'}</td>
                  <td className="roster-td roster-email">{m.email}</td>
                  <td className="roster-td">
                    <div className="subteam-chips">
                      {(m.subteams ?? []).map(st => (
                        <span key={st} className="subteam-chip">{st}</span>
                      ))}
                    </div>
                  </td>
                  <td className="roster-td">
                    <div className="role-checks">
                      {ALL_ROLES.map(role => {
                        const on  = (m.roles ?? []).includes(role)
                        const key = `${m.id}_${role}`
                        return (
                          <label key={role} className={`role-chip${on ? ' role-on' : ''}`}>
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!!saving[key]}
                              onChange={() => toggleRole(m.id, role, m.roles ?? [])}
                            />
                            {role}
                          </label>
                        )
                      })}
                    </div>
                  </td>
                  <td className="roster-td">
                    <select
                      value={m.status ?? 'active'}
                      disabled={!!saving[`${m.id}_status`]}
                      onChange={e => setStatus(m.id, e.target.value)}
                      className={`status-select status-${m.status ?? 'active'}`}
                    >
                      {ALL_STATUSES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="roster-td">
                    <Link to={`/members/${m.id}`} className="roster-skills-link">
                      Skills
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
