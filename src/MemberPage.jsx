import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from './supabase'
import MemberSkillsPanel from './MemberSkillsPanel'
import './MemberPage.css'

export default function MemberPage({ session, hasRole }) {
  const { id }  = useParams()
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const [member, setMember] = useState(null)
  const [positions, setPositions] = useState([])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('full_name, avatar_url, subteams, disciplines')
      .eq('id', id)
      .single()
      .then(({ data }) => setMember(data ?? { full_name: 'Unknown member', avatar_url: null, subteams: [], disciplines: [] }))

    supabase
      .from('position_assignments')
      .select('position:positions(name, sort_order)')
      .eq('member_id', id)
      .then(({ data }) => setPositions(
        (data ?? [])
          .map(r => r.position)
          .filter(Boolean)
          .sort((a, b) => a.sort_order - b.sort_order)
      ))
  }, [id])

  if (!member) {
    return <div className="mp-loading"><div className="mp-spinner" /></div>
  }

  const initials = (member.full_name || '?')[0].toUpperCase()

  return (
    <div className="mp-wrap">
      <div className="mp-body">

        <div className="mp-id-card">
          {member.avatar_url
            ? <img src={member.avatar_url} className="mp-avatar" alt={member.full_name} />
            : <div className="mp-avatar mp-avatar-init">{initials}</div>
          }
          <div className="mp-id-text">
            <span className="mp-name">{member.full_name || '—'}</span>
            {(member.subteams ?? []).length > 0 && (
              <div className="mp-subteams">
                {member.subteams.map(st => (
                  <span key={st} className="mp-subteam">{st}</span>
                ))}
              </div>
            )}
            {(member.disciplines ?? []).length > 0 && (
              <div className="mp-subteams">
                {member.disciplines.map(d => (
                  <span key={d} className="mp-discipline">{d}</span>
                ))}
              </div>
            )}
            {positions.length > 0 && (
              <div className="mp-subteams">
                {positions.map(p => (
                  <span key={p.name} className="mp-position">{p.name}</span>
                ))}
              </div>
            )}
            <span className="mp-subtitle">
              {isStaff ? 'Staff view — certify skills from the in-progress or not-started rows' : 'Skills progress (read-only)'}
            </span>
          </div>
        </div>

        <p className="mp-section-heading">Skills</p>
        <MemberSkillsPanel
          memberId={id}
          currentUserId={session.user.id}
          canEdit={false}
          canCertify={isStaff}
        />

      </div>
    </div>
  )
}
