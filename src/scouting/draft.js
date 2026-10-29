// Alliance selection as a log of what was announced (ledger 0032). Pure.
//
// The rules modeled (2026 game manual 13.2; Beach Blitz 2026 rule BB3):
//   - The top `alliances` seeds are captains, in rank order.
//   - Round 1 picks run alliance 1 to N, round 2 runs N to 1, and any later
//     round alternates again (Beach Blitz: 3 rounds, four-team alliances).
//   - A captain may pick a LOWER captain whose alliance has no pick yet; that
//     alliance dissolves, the ones below move up, and the next highest seed
//     not already on an alliance becomes the last captain.
//   - A team that declines can never be picked; the same alliance picks
//     again. (A declining captain still captains its own alliance, and a
//     declined team can still be moved up to captain.)
// The state is rebuilt from the log every time, so undo is "drop the last
// entry" and two devices that hold the same log always agree.

export function slotOrder(rounds = 3, alliances = 8) {
  const out = []
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < alliances; i++) out.push({ round: r + 1, position: r % 2 === 0 ? i : alliances - 1 - i })
  }
  return out
}

const same = (a, b) => String(a) === String(b)
const has = (list, t) => list.some(x => same(x, t))

/** Start state from seeds (the qualification ranking, best first). */
export function startState({ seeds = [], rounds = 3, alliances = 8 } = {}) {
  const n = Math.min(alliances, seeds.length)
  return { seeds: [...seeds], rounds, size: n, alliances: seeds.slice(0, n).map(t => [t]), declined: [], slot: 0, slots: slotOrder(rounds, n), errors: [] }
}

/** Who may be picked by the alliance on the clock right now. */
export function pickable(state, team) {
  if (state.slot >= state.slots.length) return false
  if (has(state.declined, team)) return false
  const pos = state.slots[state.slot].position
  const at = state.alliances.findIndex(a => has(a, team))
  if (at === -1) return true
  // A lower captain whose alliance has not picked yet.
  return at > pos && state.alliances[at].length === 1 && same(state.alliances[at][0], team)
}

/** Apply one action to a copy of the state. */
export function apply(state, action) {
  const s = { ...state, alliances: state.alliances.map(a => [...a]), declined: [...state.declined], errors: [...state.errors] }
  const t = action?.team
  if (s.slot >= s.slots.length) { s.errors.push({ action, why: 'Selection is complete.' }); return s }
  if (t === undefined || t === null || t === '') { s.errors.push({ action, why: 'No team named.' }); return s }
  if (!pickable(s, t)) { s.errors.push({ action, why: has(s.declined, t) ? `${t} declined earlier and cannot be picked.` : `${t} is already on an alliance.` }); return s }
  if (action.type === 'decline') { s.declined.push(t); return s }
  if (action.type !== 'pick') { s.errors.push({ action, why: 'Unknown action.' }); return s }
  const pos = s.slots[s.slot].position
  const at = s.alliances.findIndex(a => has(a, t))
  if (at > pos) {
    s.alliances.splice(at, 1)
    const next = s.seeds.find(x => !s.alliances.some(a => has(a, x)) && !same(x, t))
    if (next !== undefined) s.alliances.push([next])
  }
  s.alliances[pos].push(t)
  s.slot++
  return s
}

export function replay(setup, log = []) {
  return (log ?? []).reduce(apply, startState(setup))
}

/** The alliance on the clock, or null when selection is complete. */
export function onClock(state) {
  if (state.slot >= state.slots.length) return null
  const { round, position } = state.slots[state.slot]
  return { round, position, number: position + 1, captain: state.alliances[position]?.[0] ?? null, overall: state.slot + 1 }
}

/** Teams on no alliance that have not declined (lower captains excluded). */
export function availableTeams(state, ids) {
  return ids.filter(t => !has(state.declined, t) && !state.alliances.some(a => has(a, t)))
}

/** Our alliance position, or -1. */
export const allianceOf = (state, team) => state.alliances.findIndex(a => has(a, team))

/** How many picks happen before our alliance picks again (0 = we are on the clock), or null. */
export function picksUntilOurs(state, team) {
  const pos = allianceOf(state, team)
  if (pos === -1) return null
  for (let i = state.slot; i < state.slots.length; i++) if (state.slots[i].position === pos) return i - state.slot
  return null
}

function randn(rng) {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** A seeded generator, so the board shows the same odds on every device. */
export function mulberry32(seed = 5669) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/**
 * The chance each available team is still there when our alliance next
 * picks. Other alliances are modeled as picking the best team by our
 * estimate with noise (they do not see what we see): value * e^(noise * N(0,1)).
 * Lower captains are candidates in round 1, as the rules allow.
 * values: Map id -> number. Answers Map id -> probability, or null when we
 * do not pick again.
 */
export function availability(state, values, team, { runs = 400, noise = 0.35, rng = mulberry32() } = {}) {
  const until = picksUntilOurs(state, team)
  if (until === null) return null
  const ids = [...values.keys()]
  const counts = new Map(ids.map(id => [id, 0]))
  for (let r = 0; r < runs; r++) {
    let s = state
    for (let k = 0; k < until; k++) {
      let best = null, bestV = -Infinity
      for (const id of ids) {
        if (!pickable(s, id)) continue
        const v = values.get(id)
        if (!(typeof v === 'number' && Number.isFinite(v))) continue
        const noisy = Math.max(v, 0.1) * Math.exp(noise * randn(rng))
        if (noisy > bestV) { bestV = noisy; best = id }
      }
      if (best === null) break
      s = apply(s, { type: 'pick', team: best })
    }
    for (const id of ids) if (pickable(s, id)) counts.set(id, counts.get(id) + 1)
  }
  return new Map(ids.map(id => [id, counts.get(id) / runs]))
}
