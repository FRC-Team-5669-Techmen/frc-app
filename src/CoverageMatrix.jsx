import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { roleColor, topRoleOf } from './roles'
import './CoverageMatrix.css'

const displayName = (m) => (m?.nickname && m.nickname.trim()) || m?.full_name || '—'

// canView lets a non-staff member see the matrix read-only (it has no mutations);
// used by the member skills dashboard's "Team coverage" toggle.
export default function CoverageMatrix({ hasRole, canView = false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [members,    setMembers]    = useState(null)
  const [catalog,    setCatalog]    = useState(null)
  const [skillRows,  setSkillRows]  = useState(null)
  const [roleById,   setRoleById]   = useState({})   // member_id -> top role
  const [activeOnly, setActiveOnly] = useState(true)

  useEffect(() => {
    Promise.all([
      // NB: select only columns that exist on profiles. A stray `email` here
      // (email lives on auth.users, not profiles) made this query error, leaving
      // the member list empty — so no one, including freshly certified members,
      // rendered on the matrix.
      supabase.from('profiles').select('id, full_name, nickname, status').order('full_name'),
      supabase.from('skills').select('*').order('sort_order'),
      supabase.from('member_skills').select('member_id, skill_id, status'),
      supabase.from('member_roles').select('member_id, role'),
    ]).then(([{ data: p }, { data: s }, { data: ms }, { data: mr }]) => {
      setMembers(p ?? [])
      setCatalog(s ?? [])
      setSkillRows(ms ?? [])
      const byId = {}
      for (const r of mr ?? []) (byId[r.member_id] ??= []).push(r.role)
      setRoleById(Object.fromEntries(Object.entries(byId).map(([id, rs]) => [id, topRoleOf(rs)])))
    })
  }, [])

  // memberId → skillId → status
  const statusMap = useMemo(() => {
    const m = {}
    for (const row of (skillRows ?? [])) {
      ;(m[row.member_id] ??= {})[row.skill_id] = row.status
    }
    return m
  }, [skillRows])

  // Skills grouped by category, flat ordered list
  const grouped = useMemo(() => {
    if (!catalog) return []
    const map = {}
    for (const s of catalog) (map[s.category] ??= []).push(s)
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, skills]) => ({
        category,
        skills: [...skills].sort((a, b) => a.sort_order - b.sort_order),
      }))
  }, [catalog])

  const flatSkills = useMemo(() => grouped.flatMap(g => g.skills), [grouped])

  const visibleMembers = useMemo(() => {
    if (!members) return []
    return activeOnly
      ? members.filter(m => !m.status || m.status === 'active')
      : members
  }, [members, activeOnly])

  if (!isStaff && !canView) {
    return (
      <div className="cm-wrap">
        <div className="cm-denied">You need a staff role to view this page.</div>
      </div>
    )
  }

  if (!members || !catalog || !skillRows) {
    return (
      <div className="cm-wrap">
        <div className="cm-loading"><div className="cm-spinner" /></div>
      </div>
    )
  }

  if (flatSkills.length === 0) {
    return (
      <div className="cm-wrap">
        <p className="cm-empty">No skills in the catalog yet.</p>
      </div>
    )
  }

  return (
    <div className="cm-wrap">
      <div className="cm-toolbar">
        <label className="cm-toggle-label">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={e => setActiveOnly(e.target.checked)}
            className="cm-toggle-check"
          />
          Active members only
        </label>

        <div className="cm-legend">
          <span className="cm-legend-item">
            <span className="cm-dot" data-status="certified" />
            Certified
          </span>
          <span className="cm-legend-item">
            <span className="cm-dot" data-status="in_progress" />
            In progress
          </span>
        </div>
      </div>

      <div className="cm-scroll">
        <table className="cm-table">
          <thead>
            {/* Category header row */}
            <tr>
              <th className="cm-th cm-member-th cm-corner" rowSpan={2}>
                Member
                <span className="cm-member-count">{visibleMembers.length}</span>
              </th>
              {grouped.map(({ category, skills }) => (
                <th key={category} className="cm-cat-th" colSpan={skills.length}>
                  {category}
                </th>
              ))}
            </tr>
            {/* Skill name row */}
            <tr>
              {flatSkills.map((skill, i) => {
                const isFirst = grouped.some(g => g.skills[0]?.id === skill.id)
                return (
                  <th
                    key={skill.id}
                    className={`cm-skill-th${isFirst ? ' cm-cat-start' : ''}`}
                    title={skill.name}
                  >
                    <div className={`cm-skill-label${skill.safety_critical ? ' cm-skill-safety' : ''}`}>
                      {skill.name}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {visibleMembers.map(m => (
              <tr key={m.id} className="cm-row">
                <td className="cm-td cm-name-cell">
                  {roleById[m.id] && (
                    <span className="role-dot cm-role-dot" style={{ '--rc': roleColor(roleById[m.id]) }} title={roleById[m.id]} />
                  )}
                  {displayName(m)}
                </td>
                {flatSkills.map((skill, i) => {
                  const isFirst = grouped.some(g => g.skills[0]?.id === skill.id)
                  const status = statusMap[m.id]?.[skill.id] ?? 'not_started'
                  return (
                    <td
                      key={skill.id}
                      className={`cm-cell${isFirst ? ' cm-cat-start' : ''}`}
                      title={`${displayName(m)} · ${skill.name}: ${status.replace('_', ' ')}`}
                    >
                      {status !== 'not_started' && (
                        <span className="cm-dot" data-status={status} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="cm-count-row">
              <td className="cm-td cm-name-cell cm-count-label">Certified</td>
              {flatSkills.map((skill, i) => {
                const isFirst = grouped.some(g => g.skills[0]?.id === skill.id)
                const count = visibleMembers.filter(
                  m => statusMap[m.id]?.[skill.id] === 'certified'
                ).length
                return (
                  <td
                    key={skill.id}
                    className={`cm-count-cell${isFirst ? ' cm-cat-start' : ''}${count === 0 ? ' cm-gap-zero' : count === 1 ? ' cm-gap-one' : ''}`}
                    title={`${count} / ${visibleMembers.length} certified`}
                  >
                    {count || '—'}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
