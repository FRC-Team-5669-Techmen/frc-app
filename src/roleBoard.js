// The role interest board (migration 0028, ledger 0017, part D1). Pure: the
// page and the connector read the same cell states. A cell is (slot, role);
// its state compares requests with the number needed.
//   unfilled  fewer requests than needed (the team must still fill it)
//   covered   exactly as many as needed
//   over      more than needed (staff choose)
// Assignments come from event_roles (the posted roster stays the record).

export const ROLE_ORDER = Object.freeze([
  'driver', 'operator', 'human_player', 'drive_coach', 'pit_crew', 'battery_captain',
  'scouting_lead', 'scout', 'safety_captain', 'media', 'impact_presenter', 'pit_speaker',
])
export const ROLE_LABELS = Object.freeze({
  driver: 'Driver', operator: 'Operator', human_player: 'Human player', drive_coach: 'Drive coach', pit_crew: 'Pit crew',
  battery_captain: 'Battery captain', scouting_lead: 'Scouting lead', scout: 'Scout', safety_captain: 'Safety captain',
  media: 'Media', impact_presenter: 'Impact presenter', pit_speaker: 'Pit speaker',
})
export const roleLabel = (r) => ROLE_LABELS[r] ?? r

export function cellState(requested, needed) {
  if (!needed) return 'none'
  if (requested < needed) return 'unfilled'
  if (requested === needed) return 'covered'
  return 'over'
}

/** The board shaped for rendering: days of slots, each slot's cells in role order. */
export function boardView(board, me) {
  const slots = board?.slots ?? []
  const roles = ROLE_ORDER.filter((r) => slots.some((s) => Number(s.needs?.[r]) > 0))
  const days = []
  for (const s of slots) {
    let day = days.find((d) => d.day === s.day)
    if (!day) { day = { day: s.day, slots: [], unfilled: [] }; days.push(day) }
    const cells = roles.map((role) => {
      const needed = Number(s.needs?.[role]) || 0
      const requests = (s.requests ?? []).filter((r) => r.role === role)
      const state = cellState(requests.length, needed)
      return { role, needed, requests, requested: requests.length, state, mine: requests.some((r) => r.member_id === me), assigned: requests.filter((r) => r.assigned).length }
    })
    day.slots.push({ ...s, cells })
    for (const c of cells) if (c.state === 'unfilled') day.unfilled.push({ slot: s.label, slotId: s.id, role: c.role, short: c.needed - c.requested })
  }
  const total = days.reduce((n, d) => n + d.unfilled.length, 0)
  return { roles, days, unfilledCells: total, mine: slots.reduce((n, s) => n + (s.requests ?? []).filter((r) => r.member_id === me).length, 0) }
}

export const DAY_FMT = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
export const TIME_FMT = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) : '')
