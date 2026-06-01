import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from './supabase'
import MemberSkillsPanel from './MemberSkillsPanel'
import './MemberPage.css'

export default function MemberPage({ session, hasRole }) {
  const { id }    = useParams()
  const isStaff   = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const [member, setMember] = useState(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', id)
      .single()
      .then(({ data }) => setMember(data ?? { full_name: 'Unknown member', avatar_url: null }))
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
            <span className="mp-subtitle">
              {isStaff ? 'Staff view — you can certify skills' : 'Skills progress (read-only)'}
            </span>
          </div>
        </div>

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
