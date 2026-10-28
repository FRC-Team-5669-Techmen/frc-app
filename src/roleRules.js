// Role board rule check (ledger 0029). Pure: the role board page and the
// connector's role_board read call the same function, so the two never
// disagree. It never blocks anything (the board's no-blocking rule, 0031); it
// only names what breaks Mr. Pina's event rotation rules (2026-10-26):
//
//   1. one place at a time   a person ASSIGNED to two roles in one slot that
//                            happen in different places (field, stands, pit,
//                            roaming), or two field roles at once, or scout
//                            and scouting lead at once
//   2. two in a row at most  nobody outside the drive team holds the same role
//                            more than two slots in a row on a day (slots that
//                            do not need the role do not break the run)
//   3. everyone scouts       everyone assigned on a day who is not on the drive
//                            team that day has at least one scout (or
//                            scouting lead) slot that day
//
// Only ASSIGNED counts. Backups and asks are not commitments yet.

export const DRIVE_TEAM = Object.freeze(['driver', 'operator', 'human_player', 'drive_coach'])
export const MAX_IN_A_ROW = 2

// Where each role happens during a slot.
export const ROLE_PLACE = Object.freeze({
  driver: 'field', operator: 'field', human_player: 'field', drive_coach: 'field', team_captain: 'field',
  scout: 'stands', scouting_lead: 'stands',
  pit_crew: 'pit', battery_captain: 'pit', safety_captain: 'pit', pit_speaker: 'pit', impact_presenter: 'pit',
  meet_team: 'roaming', media: 'roaming',
})
// Places where one person can hold several roles at once.
const SHARED_PLACES = new Set(['pit', 'roaming'])

const LABELS = {
  team_captain: 'Team captain', driver: 'Driver', operator: 'Operator', human_player: 'Human player', drive_coach: 'Drive coach', pit_crew: 'Pit crew',
  battery_captain: 'Battery captain', scouting_lead: 'Scouting lead', scout: 'Scout', safety_captain: 'Safety captain',
  media: 'Media', impact_presenter: 'Impact presenter', pit_speaker: 'Pit speaker', meet_team: 'Meet a team',
}
const label = (r) => LABELS[r] ?? r
const statusOf = (r) => r?.status ?? (r?.assigned ? 'assigned' : 'asked')

/** Can one person hold roles a and b in the same slot? */
export function compatible(a, b) {
  if (a === b) return true
  const pa = ROLE_PLACE[a], pb = ROLE_PLACE[b]
  if (!pa || !pb) return true // an unknown role is never flagged
  if (pa !== pb) return false
  return SHARED_PLACES.has(pa)
}

const byTime = (x, y) => String(x.starts_at ?? '').localeCompare(String(y.starts_at ?? '')) || (x.position ?? 0) - (y.position ?? 0)

/**
 * Every rule break on a board, worst first. Each issue:
 * { rule: 'one_place'|'in_a_row'|'no_scout', severity: 'conflict'|'rotation', day, member_id, name, slots: [labels], roles: [roles], text }
 */
export function roleRuleIssues(board) {
  const slots = [...(board?.slots ?? [])].sort(byTime)
  const issues = []
  const days = [...new Set(slots.map((s) => s.day))]
  for (const day of days) {
    const daySlots = slots.filter((s) => s.day === day)
    // member -> { name, perSlot: Map(slotId -> Set(role)) }
    const people = new Map()
    for (const s of daySlots) {
      for (const r of s.requests ?? []) {
        if (statusOf(r) !== 'assigned' || !r.member_id) continue
        if (!people.has(r.member_id)) people.set(r.member_id, { name: r.name || 'Member', perSlot: new Map() })
        const p = people.get(r.member_id)
        if (!p.perSlot.has(s.id)) p.perSlot.set(s.id, new Set())
        p.perSlot.get(s.id).add(r.role)
      }
    }
    for (const [id, p] of people) {
      // 1. one place at a time
      for (const s of daySlots) {
        const roles = [...(p.perSlot.get(s.id) ?? [])]
        const clash = []
        for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) if (!compatible(roles[i], roles[j])) clash.push(roles[i], roles[j])
        if (clash.length) {
          const rs = [...new Set(clash)].sort()
          issues.push({ rule: 'one_place', severity: 'conflict', day, member_id: id, name: p.name, slots: [s.label], roles: rs,
            text: `${p.name} is assigned ${rs.map(label).join(' and ')} at the same time in ${s.label}.` })
        }
      }
      // 2. two in a row at most, per role, over the slots that need that role
      const heldRoles = new Set([...p.perSlot.values()].flatMap((set) => [...set]))
      for (const role of heldRoles) {
        if (DRIVE_TEAM.includes(role)) continue
        const needing = daySlots.filter((s) => Number(s.needs?.[role]) > 0 || (p.perSlot.get(s.id)?.has(role)))
        let run = []
        const flush = () => {
          if (run.length > MAX_IN_A_ROW) issues.push({ rule: 'in_a_row', severity: 'rotation', day, member_id: id, name: p.name, slots: run.map((s) => s.label), roles: [role],
            text: `${p.name} holds ${label(role)} ${run.length} slots in a row (${run[0].label} to ${run[run.length - 1].label}); the limit is ${MAX_IN_A_ROW}.` })
          run = []
        }
        for (const s of needing) { if (p.perSlot.get(s.id)?.has(role)) run.push(s); else flush() }
        flush()
      }
      // 3. everyone scouts, unless on the drive team that day
      const driveTeam = [...heldRoles].some((r) => DRIVE_TEAM.includes(r))
      const dayNeedsScouts = daySlots.some((s) => Number(s.needs?.scout) > 0)
      if (!driveTeam && dayNeedsScouts && !heldRoles.has('scout') && !heldRoles.has('scouting_lead')) {
        issues.push({ rule: 'no_scout', severity: 'rotation', day, member_id: id, name: p.name, slots: [], roles: [...heldRoles].sort(),
          text: `${p.name} has no scout slot on this day; everyone outside the drive team rotates through scouting.` })
      }
    }
  }
  const RANK = { one_place: 0, in_a_row: 1, no_scout: 2 }
  return issues.sort((a, b) => String(a.day).localeCompare(String(b.day)) || RANK[a.rule] - RANK[b.rule] || a.name.localeCompare(b.name))
}

export const RULE_TITLES = Object.freeze({
  one_place: 'Two places at once',
  in_a_row: 'More than two in a row',
  no_scout: 'Not scouting this day',
})
