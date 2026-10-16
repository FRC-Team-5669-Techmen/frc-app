import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from './supabase'
import { displayName } from './names'
import './MemberPage.css'

export default function MemberPage({ session, hasRole }) {
  const { id }  = useParams()
  const [member, setMember] = useState(null)
  const [positions, setPositions] = useState([])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('full_name, nickname, avatar_url, subteams, disciplines')
      .eq('id', id)
      .single()
      .then(({ data }) => setMember(data ?? { full_name: 'Unknown member', nickname: null, avatar_url: null, subteams: [], disciplines: [] }))

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

  const name     = displayName(member)
  const initials = (name || '?')[0].toUpperCase()

  return (
    <div className="mp-wrap">
      <div className="mp-body">

        <div className="mp-id-card">
          {member.avatar_url
            ? <img src={member.avatar_url} className="mp-avatar" alt={name} />
            : <div className="mp-avatar mp-avatar-init">{initials}</div>
          }
          <div className="mp-id-text">
            <span className="mp-name">{name}</span>
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
          </div>
        </div>

        {/* The old skills panel was retired with the old skills system
            (decision 27). Certifications are the official IDEA ones. */}
        <p className="mp-section-heading">Certifications</p>
        <p className="mp-cert-note">
          Certifications are the official IDEA certifications. See them on{' '}
          <Link to="/certifications">Certifications</Link>.
        </p>

      </div>
    </div>
  )
}
