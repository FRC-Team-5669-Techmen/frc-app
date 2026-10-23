// Shifts by MATCH NUMBER, not clock time (ledger 0022).
//
// Events run late. A shift written as "10:00 to 11:00" breaks the moment the
// field is 20 minutes behind; a shift written as "Q13 to Q24" never does. So
// shift blocks are ranges of qualification match numbers, every assignment is
// already tied to a match, and a shared "now" match number (0030,
// scouting_now_get / scouting_now_set) tells everyone whose shift is on. A
// lead bumps it (+1, or set) as matches actually start.
//
// Pure functions only; tests/scouting-shifts.test.js holds every rule here.
import { matchIdentity } from './provenance.js'

export const DEFAULT_BLOCK = 12
export const MAX_MATCH = 999

/**
 * The qualification match number a key names, or null. Accepts the TBA key
 * (2026cabb_qm12), the short label (qm12), and the plain forms leads type
 * (Q12, q12, 12). Playoff keys (sf1m1, f1m2) and practice matches have no
 * qualification number, so they are never part of a numbered shift.
 */
export function matchNumber(key) {
  if (key === null || key === undefined) return null
  const id = matchIdentity({ match_key: String(key) })
  const m = /^(?:qm|q)?([0-9]{1,3})$/.exec(id)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= MAX_MATCH ? n : null
}

const blockSize = size => (Number.isInteger(size) && size >= 1 && size <= 200 ? size : DEFAULT_BLOCK)

/** The block a match number falls in: { index, from, to, label }. */
export function blockFor(n, size = DEFAULT_BLOCK) {
  const s = blockSize(size)
  if (!Number.isInteger(n) || n < 1) return null
  const index = Math.floor((n - 1) / s)
  const from = index * s + 1, to = from + s - 1
  return { index, from, to, label: `Q${from} to Q${to}` }
}

/** Every block covering qualification matches 1..last. */
export function shiftBlocks(last, size = DEFAULT_BLOCK) {
  const s = blockSize(size), out = []
  if (!Number.isInteger(last) || last < 1) return out
  for (let from = 1; from <= last; from += s) {
    const to = Math.min(from + s - 1, last)
    out.push({ index: out.length, from, to, label: `Q${from} to Q${to}` })
  }
  return out
}

/** The schedule index range (for planAssignments start/end) of a block. */
export function blockRange(matches, block) {
  const idx = matches.map((m, i) => ({ i, n: matchNumber(m.key) })).filter(x => x.n !== null && x.n >= block.from && x.n <= block.to)
  if (!idx.length) return null
  return { start: Math.min(...idx.map(x => x.i)), end: Math.max(...idx.map(x => x.i)) }
}

const active = r => r.kind === 'assignment' && r.payload?.status !== 'cancelled'

/**
 * "You're up in N matches" for one member. The next assignment at or after
 * the current match number; N = 0 means the match on the field now.
 * Assignments without a qualification number are ignored. Returns null when
 * nothing is ahead, or when the current match number is unknown.
 */
export function upNext(records, memberId, now) {
  if (!Number.isInteger(now) || now < 0) return null
  const mine = records.filter(r => active(r) && r.payload?.assignee === memberId)
    .map(r => ({ r, n: matchNumber(r.match_key) })).filter(x => x.n !== null && x.n >= now)
    .sort((a, b) => a.n - b.n || (a.r.team_number ?? 0) - (b.r.team_number ?? 0))
  if (!mine.length) return null
  const n = mine[0].n
  const rows = mine.filter(x => x.n === n).map(x => x.r)
  return { match: n, inMatches: n - now, key: rows[0].match_key, role: rows.some(r => r.payload?.role === 'super') ? 'super' : 'scout', rows }
}

export function upNextText(next) {
  if (!next) return ''
  if (next.inMatches === 0) return `You're up now: Q${next.match}`
  return `You're up in ${next.inMatches} ${next.inMatches === 1 ? 'match' : 'matches'}: Q${next.match}`
}

/**
 * Who is on shift for the block containing `now`: every assignee with an
 * active assignment in that block, split by role, with their match count.
 */
export function onShift(records, now, size = DEFAULT_BLOCK) {
  const block = blockFor(now, size)
  if (!block) return { block: null, scouts: [], supers: [] }
  const counts = { scout: new Map(), super: new Map() }
  for (const r of records) {
    if (!active(r)) continue
    const n = matchNumber(r.match_key)
    if (n === null || n < block.from || n > block.to) continue
    const role = r.payload?.role === 'super' ? 'super' : 'scout'
    const who = r.payload?.assignee
    counts[role].set(who, (counts[role].get(who) ?? 0) + 1)
  }
  const list = m => [...m.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || String(a.id).localeCompare(String(b.id)))
  return { block, scouts: list(counts.scout), supers: list(counts.super) }
}

/** The next "now" after a lead's bump or set, clamped to 0..MAX_MATCH. */
export function nextNow(current, { delta, set } = {}) {
  const base = Number.isInteger(current) ? current : 0
  const value = Number.isInteger(set) ? set : base + (Number.isInteger(delta) ? delta : 0)
  return Math.max(0, Math.min(MAX_MATCH, value))
}
