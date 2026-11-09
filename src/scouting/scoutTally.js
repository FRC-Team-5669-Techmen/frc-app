import { isCurrentEvidence, matchIdentity } from './provenance'
import { isSuperNote } from './superscout'
import { displayName } from '../names'
// Confirmed current-event evidence only. One match per scout even when a super
// scout submits three robot notes. Assignment gaps remain per robot/alliance.
export function scoutTally(records, members, eventId) {
  const confirmed = records.filter(r => r.event_id === eventId && !r.localStatus && isCurrentEvidence(r))
  const observations = confirmed.filter(r => r.kind === 'observation' && r.match_key)
  const assignments = confirmed.filter(r => r.kind === 'assignment' && r.payload.status === 'assigned' && r.match_key)
  const ids = new Set([...members.map(m => m.id), ...observations.map(r => r.member_id), ...assignments.map(r => r.payload.assignee)].filter(Boolean))
  return [...ids].map(id => {
    const mine = observations.filter(r => r.member_id === id)
    const assigned = assignments.filter(r => r.payload.assignee === id)
    const gaps = assigned.filter(a => {
      const targets = a.payload.role === 'super' ? a.payload.teams ?? [] : [a.team_number]
      return !targets.length || !targets.every(team => mine.some(o => matchIdentity(o) === matchIdentity(a) && o.team_number === team
        && (a.payload.role === 'super' ? isSuperNote(o) : !isSuperNote(o))))
    })
    return { id, name: (() => { const m = members.find(m => m.id === id); return m ? m.name || displayName(m) : 'Former scout' })(), matches: new Set(mine.map(matchIdentity)).size,
      robot: new Set(mine.filter(r => !isSuperNote(r)).map(matchIdentity)).size, super: new Set(mine.filter(isSuperNote).map(matchIdentity)).size,
      assignments: assigned.length, gaps: gaps.map(a => ({ id: a.id, match: a.match_key, target: a.payload.role === 'super' ? `${a.payload.alliance} alliance` : `Team ${a.team_number}` })) }
  }).sort((a, b) => b.gaps.length - a.gaps.length || a.matches - b.matches || a.name.localeCompare(b.name))
}
