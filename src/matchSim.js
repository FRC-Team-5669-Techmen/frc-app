// The 2026 REBUILT match clock (ledger 0017, part D3). Pure: the simulator
// page renders it and tests/match-sim.test.js holds it to the manual.
//
// SOURCE, verified 2026-10-23 against the 2026 Game Manual (Table 6-2,
// firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf):
//   AUTO 20 s (0:20 to 0:00); TELEOP: TRANSITION SHIFT 10 s (2:20 to 2:10),
//   SHIFT 1 to 4 25 s each (2:10 to 1:45, 1:45 to 1:20, 1:20 to 0:55,
//   0:55 to 0:30), END GAME 30 s (0:30 to 0:00). Total 2:40.
// HUBS (6.4.1): both active in AUTO and the TRANSITION SHIFT. "The ALLIANCE
//   that scores the most FUEL during AUTO will have their HUB set to inactive
//   for SHIFT 1"; status alternates each shift; a tie is broken at random by
//   the FMS. Both active again in END GAME. The FMS sends that alliance's
//   letter ('R' or 'B') as game data about 3 s after AUTO (WPILib 2026 Game
//   Data). So the alliance inactive first is inactive in SHIFTS 1 and 3 and
//   active in 2 and 4.
// The real field pauses between AUTO and TELEOP while AUTO is scored; the
// simulator models it as AUTO_TO_TELEOP_GAP seconds (a proposed default).

export const AUTO_TO_TELEOP_GAP = 3

export const PHASES = Object.freeze([
  { key: 'auto', label: 'AUTO', period: 'auto', seconds: 20, hubs: 'both' },
  { key: 'gap', label: 'SCORING AUTO', period: 'pause', seconds: AUTO_TO_TELEOP_GAP, hubs: 'none' },
  { key: 'transition', label: 'TRANSITION SHIFT', period: 'teleop', seconds: 10, hubs: 'both' },
  { key: 'shift1', label: 'SHIFT 1', period: 'teleop', seconds: 25, hubs: 'first-active' },
  { key: 'shift2', label: 'SHIFT 2', period: 'teleop', seconds: 25, hubs: 'first-inactive' },
  { key: 'shift3', label: 'SHIFT 3', period: 'teleop', seconds: 25, hubs: 'first-active' },
  { key: 'shift4', label: 'SHIFT 4', period: 'teleop', seconds: 25, hubs: 'first-inactive' },
  { key: 'endgame', label: 'END GAME', period: 'teleop', seconds: 30, hubs: 'both' },
])
export const MATCH_SECONDS = PHASES.reduce((n, p) => n + p.seconds, 0)
export const TELEOP_SECONDS = PHASES.filter((p) => p.period === 'teleop').reduce((n, p) => n + p.seconds, 0)

const other = (a) => (a === 'red' ? 'blue' : 'red')

/**
 * Where the match is at `elapsed` seconds since the start.
 * inactiveFirst: 'red' | 'blue', the alliance whose HUB is inactive in SHIFT 1.
 * Answers { phase, index, remainingInPhase, periodClock, done, active: { red, blue } }.
 * periodClock is the official timer: counts 0:20 down in AUTO, 2:20 down in TELEOP.
 */
export function matchState(elapsed, inactiveFirst = 'red') {
  let t = Math.max(0, elapsed)
  for (let i = 0; i < PHASES.length; i++) {
    const p = PHASES[i]
    if (t < p.seconds) {
      const remainingInPhase = p.seconds - t
      const after = PHASES.slice(i + 1).filter((x) => x.period === p.period).reduce((n, x) => n + x.seconds, 0)
      const periodClock = p.period === 'pause' ? TELEOP_SECONDS : remainingInPhase + after
      return { phase: p, index: i, remainingInPhase, periodClock, done: false, active: hubActive(p, inactiveFirst) }
    }
    t -= p.seconds
  }
  const last = PHASES[PHASES.length - 1]
  return { phase: last, index: PHASES.length, remainingInPhase: 0, periodClock: 0, done: true, active: { red: false, blue: false } }
}

export function hubActive(phase, inactiveFirst) {
  const first = inactiveFirst, second = other(inactiveFirst)
  if (phase.hubs === 'both') return { red: true, blue: true }
  if (phase.hubs === 'none') return { red: false, blue: false }
  // first-active: SHIFTS 1 and 3, where the alliance named first is INACTIVE.
  if (phase.hubs === 'first-active') return { [first]: false, [second]: true }
  return { [first]: true, [second]: false }
}

/** The alliance whose HUB goes inactive first, from AUTO FUEL; a tie is random, as the FMS does. */
export function inactiveFirstFrom(redAutoFuel, blueAutoFuel, random = Math.random) {
  if (redAutoFuel > blueAutoFuel) return 'red'
  if (blueAutoFuel > redAutoFuel) return 'blue'
  return random() < 0.5 ? 'red' : 'blue'
}

export const fmtClock = (s) => {
  const v = Math.max(0, Math.ceil(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

/** The cues to sound: at the start, at every phase change, 10 s before the end, and at the end. */
export function cueTimes() {
  const out = [{ at: 0, kind: 'start' }]
  let t = 0
  for (const p of PHASES.slice(0, -1)) { t += p.seconds; out.push({ at: t, kind: 'phase' }) }
  out.push({ at: MATCH_SECONDS - 10, kind: 'warning' })
  out.push({ at: MATCH_SECONDS, kind: 'end' })
  return out.sort((a, b) => a.at - b.at)
}

// TOWER points (2026 Game Manual 6.5): LEVEL 1 is 15 in AUTO and 10 in
// TELEOP; LEVEL 2 is 20 and LEVEL 3 is 30, TELEOP only.
export const TOWER_POINTS = Object.freeze({ none: 0, level1: 10, level2: 20, level3: 30, failed: 0 })
