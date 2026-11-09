import { sessionsFromEvents, breakdownFromSessions } from './hoursUtils'
import { ROLE_ORDER, roleLabel, statusOf } from './roleBoard'
import { ROLE_PLACE, MAX_IN_A_ROW } from './roleRules'
export const RESPONSIBILITY_ROLES = ['driver', 'operator', 'human_player', 'drive_coach', 'team_captain', 'scouting_lead', 'safety_captain', 'battery_captain']
export function verifiedShopHours(member, season) {
  if (!season?.id) return 0
  const attendance = member.attendance ?? []
  const verified = new Set([...(member.verified_outs ?? []), ...(member.reviews ?? []).filter(r => r.status === 'approved').map(r => r.checkout_id)])
  const excluded = new Set((member.reviews ?? []).filter(r => ['pending', 'voided'].includes(r.status)).map(r => r.checkout_id))
  const sessions = sessionsFromEvents(attendance).filter(s => !s.open && (verified.has(s.outId)
    || (attendance.find(e => e.id === s.inId)?.verified && attendance.find(e => e.id === s.outId)?.verified)))
  return breakdownFromSessions([season], sessions, member.logs ?? [], excluded)[season.id]?.build ?? 0
}
export function rotationSuggestions(board, data) {
  const members = (data.members ?? []).map(m => ({ ...m, hours: verifiedShopHours(m, data.season) }))
  const slots = [...(board.slots ?? [])].sort((a, b) => a.day.localeCompare(b.day) || String(a.starts_at).localeCompare(String(b.starts_at)) || a.id.localeCompare(b.id))
  const planned = slots.flatMap(s => (s.requests ?? []).filter(r => statusOf(r) === 'assigned').map(r => ({ slot: s, role: r.role, id: r.member_id })))
  const suggestions = [], gaps = []
  const overlaps = (a, b) => a.id === b.id || (a.starts_at && b.starts_at && Date.parse(a.starts_at) < Date.parse(b.ends_at || new Date(Date.parse(b.starts_at) + 3600e3)) && Date.parse(b.starts_at) < Date.parse(a.ends_at || new Date(Date.parse(a.starts_at) + 3600e3)))
  const free = (m, s) => !planned.some(p => p.id === m.id && overlaps(p.slot, s))
  const load = (m, s, role = null) => planned.filter(p => p.id === m.id && p.slot.day === s.day && (!role || p.role === role)).length
  const add = (m, s, role, reason) => { suggestions.push({ member: m, slot: s, role, reason }); planned.push({ slot: s, role, id: m.id }) }
  const canRotate = (m, s, role) => {
    const prior = slots.filter(x => x.day === s.day && x.needs?.[role] && slots.indexOf(x) < slots.indexOf(s)).slice(-MAX_IN_A_ROW)
    return prior.length < MAX_IN_A_ROW || !prior.every(x => planned.some(p => p.slot.id === x.id && p.id === m.id && p.role === role))
  }
  const inPit = s => planned.filter(p => p.slot.id === s.id && ROLE_PLACE[p.role] === 'pit')
  for (const s of slots) {
    if (Number(s.needs?.pit_crew) > 0) {
      const pit = inPit(s)
      const existingNewer = members.filter(m => m.newer && pit.some(p => p.id === m.id))
      const candidate = existingNewer[0] || members.filter(m => m.newer && free(m, s) && canRotate(m, s, 'pit_crew')).sort((a, b) => load(a, s, 'pit_crew') - load(b, s, 'pit_crew') || load(a, s) - load(b, s) || a.id.localeCompare(b.id))[0]
      if (candidate) {
        const strong = members.filter(m => m.strong && m.id !== candidate.id && (pit.some(p => p.id === m.id) || (free(m, s) && canRotate(m, s, 'pit_crew'))))
          .sort((a, b) => Number(pit.some(p => p.id === b.id)) - Number(pit.some(p => p.id === a.id)) || load(a, s) - load(b, s) || a.id.localeCompare(b.id)).slice(0, 2)
        if (strong.length === 2) {
          if (!existingNewer.length) add(candidate, s, 'pit_crew', `Newer member designated by a mentor; rotates through pit with ${strong.map(m => m.name).join(' and ')}, both mentor-designated strong members.`)
          for (const m of strong) if (!pit.some(p => p.id === m.id)) add(m, s, 'pit_crew', `Mentor-designated strong member; pairs with ${strong.find(x => x.id !== m.id).name} so ${existingNewer.map(m => m.name).concat(existingNewer.length ? [] : [candidate.name]).join(', ')} has two strong members in the pit.`)
        } else gaps.push(`${s.label}: ${candidate.name} needs two available mentor-designated strong members in the pit. Only ${strong.length} available; no unsupported newer-member placement suggested.`)
      }
    }
    for (const role of ROLE_ORDER.filter(r => Number(s.needs?.[r]) > 0)) {
      let short = Number(s.needs[role]) - planned.filter(p => p.slot.id === s.id && p.role === role).length
      while (short-- > 0) {
        const choices = members.filter(m => free(m, s) && !(role === 'pit_crew' && m.newer))
          .filter(m => canRotate(m, s, role))
          .sort((a, b) => (RESPONSIBILITY_ROLES.includes(role) ? b.hours - a.hours : load(a, s, role) - load(b, s, role)) || load(a, s) - load(b, s) || a.id.localeCompare(b.id))
        if (!choices.length) { gaps.push(`${s.label}: no available rotation candidate for ${roleLabel(role)}.`); break }
        const m = choices[0]
        add(m, s, role, RESPONSIBILITY_ROLES.includes(role) ? `${m.hours.toFixed(2)} verified current-season shop hours; highest available total for ${roleLabel(role)}, with existing assignments and two-slot runs respected.` : `Rotates to ${roleLabel(role)} with ${load(m, s, role)} other ${roleLabel(role)} slots today; existing assignments and two-slot runs respected.`)
      }
    }
  }
  for (const day of [...new Set(slots.map(s => s.day))]) for (const m of members.filter(m => m.newer)) if (!planned.some(p => p.id === m.id && p.slot.day === day && ROLE_PLACE[p.role] === 'pit')) gaps.push(`${day}: ${m.name} has no supported pit rotation yet. Add a pit slot or two available strong members.`)
  return { suggestions, gaps, members }
}
