// The role interest board (migration 0028, ledger 0017, part D1). Pure: the
// page and the connector read the same cell states. A cell is (slot, role);
// its state compares ASSIGNED people with the number needed (0031):
//   unfilled  fewer assigned than needed (asks and backups do not count)
//   covered   exactly as many assigned as needed
//   over      more assigned than needed (overfilling is allowed and normal)
// Each request carries a per slot status: asked, assigned or backup.

export const ROLE_ORDER = Object.freeze([
  'driver', 'operator', 'human_player', 'drive_coach', 'pit_crew', 'battery_captain',
  'team_captain', 'scouting_lead', 'scout', 'safety_captain', 'media', 'impact_presenter', 'pit_speaker', 'meet_team',
])
export const ROLE_LABELS = Object.freeze({
  team_captain: 'Team captain', driver: 'Driver', operator: 'Operator', human_player: 'Human player', drive_coach: 'Drive coach', pit_crew: 'Pit crew',
  battery_captain: 'Battery captain', scouting_lead: 'Scouting lead', scout: 'Scout', safety_captain: 'Safety captain',
  media: 'Media', impact_presenter: 'Impact presenter', pit_speaker: 'Pit speaker', meet_team: 'Meet a team',
})
export const roleLabel = (r) => ROLE_LABELS[r] ?? r
export const STATUS_LABELS = Object.freeze({ assigned: 'Assigned', backup: 'Backup', asked: 'Asked' })
const STATUS_RANK = { assigned: 0, backup: 1, asked: 2 }

/** A cell compares ASSIGNED people with the number needed (0031). Asks and backups never fill it. */
export function cellState(assigned, needed) {
  if (!needed) return 'none'
  if (assigned < needed) return 'unfilled'
  if (assigned === needed) return 'covered'
  return 'over'
}

/** The status of a request: 0031 sends status; a 0028 board only had assigned true or false. */
export const statusOf = (r) => r?.status ?? (r?.assigned ? 'assigned' : 'asked')

/** "2 of 6 assigned · 1 backup · 4 asked" */
export function countLine(c) {
  return [`${c.assigned} of ${c.needed} assigned`, c.backup ? `${c.backup} backup` : null, `${c.asked} asked`].filter(Boolean).join(' · ')
}

/** The board shaped for rendering: days of slots, each slot's cells in role order, and my shifts. */
export function boardView(board, me) {
  const slots = board?.slots ?? []
  const roles = ROLE_ORDER.filter((r) => slots.some((s) => Number(s.needs?.[r]) > 0))
  const days = []
  const myShifts = []
  for (const s of slots) {
    let day = days.find((d) => d.day === s.day)
    if (!day) { day = { day: s.day, slots: [], unfilled: [] }; days.push(day) }
    const cells = roles.map((role) => {
      const needed = Number(s.needs?.[role]) || 0
      const requests = (s.requests ?? []).filter((r) => r.role === role).map((r) => ({ ...r, status: statusOf(r) }))
        .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
      const n = (st) => requests.filter((r) => r.status === st).length
      const assigned = n('assigned'), backup = n('backup'), asked = n('asked')
      const mineReq = requests.find((r) => r.member_id === me)
      return { role, needed, requests, requested: requests.length, assigned, backup, asked, state: cellState(assigned, needed), mine: !!mineReq, myStatus: mineReq?.status ?? null }
    })
    day.slots.push({ ...s, cells })
    for (const c of cells) {
      if (c.state === 'unfilled') day.unfilled.push({ slot: s.label, slotId: s.id, role: c.role, short: c.needed - c.assigned })
      if (c.myStatus === 'assigned' || c.myStatus === 'backup') myShifts.push({ slotId: s.id, day: s.day, label: s.label, starts_at: s.starts_at, ends_at: s.ends_at, role: c.role, status: c.myStatus })
    }
  }
  const total = days.reduce((n, d) => n + d.unfilled.length, 0)
  return { roles, days, myShifts, unfilledCells: total, mine: slots.reduce((n, s) => n + (s.requests ?? []).filter((r) => r.member_id === me).length, 0) }
}

export const DAY_FMT = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
export const TIME_FMT = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) : '')

/** A shift is over at its end, or an hour after it starts when it has no end (the rule staff_meet_team_fill uses). */
export const shiftEnd = (m) => (m.ends_at ? Date.parse(m.ends_at) : Date.parse(m.starts_at) + 3600e3)
/** My next shift that has not finished yet, earliest first; with now: true when it is running. Null when none is left. */
export function nextShift(myShifts, now = Date.now()) {
  const left = (myShifts ?? []).filter((m) => m.starts_at && shiftEnd(m) > now).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  if (!left.length) return null
  const running = left.filter((m) => Date.parse(m.starts_at) <= now)
  const pick = running[0] ?? left[0]
  return { ...pick, now: Date.parse(pick.starts_at) <= now }
}
