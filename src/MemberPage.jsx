import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from './supabase'
import MemberSkillsPanel from './MemberSkillsPanel'
import './MemberPage.css'

export default function MemberPage({ session, hasRole }) {
  const { id }  = useParams()
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const [member, setMember] = useState(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('full_name, avatar_url, subteams, disciplines')
      .eq('id', id)
      .single()
      .then(({ data }) => setMember(data ?? { full_name: 'Unknown member', avatar_url: null, subteams: [], disciplines: [] }))
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
