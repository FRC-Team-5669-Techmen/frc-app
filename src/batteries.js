// The battery log's rules (migration 0026, ledger 0017): which battery needs
// a look, which ones are match-ready, worst first, and the CSV. Pure: no
// React, no Supabase, so tests/batteries.test.js drives it and the connector's
// list_batteries reads the SAME rules (api/_lib/connector/tools.js imports
// this file), so the app and Claude never disagree about a battery.

// PROPOSED DEFAULTS, not team policy yet. Mr. Pina or the electrical lead can
// change them here, in one place. A card flags Check when any one holds:
//   - a brownout is among the battery's last BROWNOUT_LOOKBACK runs;
//   - the newest resting voltage measured before a match or practice match
//     is under MIN_RESTING_VOLTS (a healthy, charged 12 V SLA rests near 12.8
//     to 13.2 V);
//   - the newest internal resistance reading is over MAX_RESISTANCE_MOHM
//     (Battery Beak; a healthy competition battery reads well under 20).
export const CHECK_THRESHOLDS = Object.freeze({
  BROWNOUT_LOOKBACK: 3,
  MIN_RESTING_VOLTS: 12.5,
  MAX_RESISTANCE_MOHM: 20,
})

// ROBOT-MEASURED resistance (migration 0041, ledger 0031). The robot fits R
// from its own load, so it INCLUDES the main wiring (Anderson SB50, 120 A
// breaker, PDH lugs, leads) and reads 5 to 10 mOhm above a Battery Beak on
// the battery alone. Its own numbers, never mixed with MAX_RESISTANCE_MOHM
// (research, 2026-10-28): OK under 22, watch 22 to 28, pull over 28 or over
// the fleet median + 5. A battery stands out at 1.3x the fleet median or
// more, or over median + 5. A fleet median over 28 means the robot's wiring.
// The fleet needs readings on MIN_FLEET batteries before it compares.
export const ROBOT_R = Object.freeze({ OK_UNDER: 22, PULL_OVER: 28, FLEET_MARGIN: 5, FLEET_RATIO: 1.3, WIRING_MEDIAN: 28, MIN_FLEET: 3, TREND_RUNS: 8 })
// Rested voltage before a match: OK 12.7 and up, watch 12.5 to 12.7, pull under 12.5.
export const REST_V = Object.freeze({ OK: 12.7, PULL_UNDER: CHECK_THRESHOLDS.MIN_RESTING_VOLTS })

/** ok, watch or pull for one robot R reading (mOhm), with the fleet median when there is one; null when not measured. */
export function robotLevel(r, median = null) {
  if (r === null || r === undefined || !Number.isFinite(Number(r))) return null
  const v = Number(r)
  if (v > ROBOT_R.PULL_OVER || (median !== null && v > median + ROBOT_R.FLEET_MARGIN)) return 'pull'
  return v < ROBOT_R.OK_UNDER ? 'ok' : 'watch'
}
/** ok, watch or pull for a rested voltage; null when not measured. */
export function restLevel(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null
  return Number(v) < REST_V.PULL_UNDER ? 'pull' : Number(v) < REST_V.OK ? 'watch' : 'ok'
}
export const LEVEL_LABELS = Object.freeze({ ok: 'OK', watch: 'Watch', pull: 'Pull' })

// The robot's verdict (BatteryEstimator.verdict, plus load-test lines): items
// joined by " | ". Each item is tagged by how it starts; anything else is
// detail (a load test's "R = ..." line) and is kept as text.
const VERDICT_TAGS = [
  [/^OK$|^normal$/i, 'ok', 'OK'], [/^CHARGE/, 'charge', 'Charge'], [/^HIGH RESISTANCE|^HIGH\b/, 'resistance', 'High R'],
  [/^ROBOT DRAW/, 'draw', 'Robot draw'], [/^BROWNOUT/, 'brownout', 'Brownout'], [/^BRANCH/, 'branch', 'Branch'],
]
/** One verdict as [{ key, label, text }]; empty for none. key 'detail' is a line with no tag. */
export function verdictItems(verdict) {
  if (typeof verdict !== 'string' || !verdict.trim()) return []
  return verdict.split(' | ').map((s) => s.trim()).filter(Boolean).map((s) => {
    const hit = VERDICT_TAGS.find(([re]) => re.test(s))
    return hit ? { key: hit[1], label: hit[2], text: s } : { key: 'detail', label: null, text: s }
  })
}

/** What the robot said after the tag, for a verdict item ("ROBOT DRAW: 236 A ..." -> "236 A ..."). */
export function verdictText(x) {
  if (!x) return ''
  if (x.key === 'ok') return 'Nothing to fix.'
  if (x.key === 'detail') return x.text
  return x.text.replace(/^[A-Z ]+:?\s*/, '') || x.text
}

export const STATUSES = Object.freeze([
  { key: 'competition', label: 'Competition' },
  { key: 'practice', label: 'Practice' },
  { key: 'retired', label: 'Retired' },
])
export const CHARGE_STATES = Object.freeze([
  { key: 'charged', label: 'Charged', short: 'Charged' },
  { key: 'charging', label: 'Charging', short: 'Charging' },
  { key: 'needs_charge', label: 'Needs charge', short: 'Needs charge' },
  { key: 'in_robot', label: 'In robot', short: 'In robot' },
])
export const RUN_KINDS = Object.freeze([
  { key: 'match', label: 'Match' },
  { key: 'practice_match', label: 'Practice match' },
  { key: 'drive_practice', label: 'Drive practice' },
  { key: 'bench_test', label: 'Bench test' },
])
export const BROWNOUT = Object.freeze([
  { key: 'no', label: 'No' },
  { key: 'yes', label: 'Yes' },
  { key: 'unknown', label: 'Not sure' },
])

const label = (list, key) => list.find((x) => x.key === key)?.label ?? key ?? ''
export const statusLabel = (k) => label(STATUSES, k)
export const chargeLabel = (k) => label(CHARGE_STATES, k)
export const kindLabel = (k) => label(RUN_KINDS, k)
export const brownoutLabel = (k) => label(BROWNOUT, k)

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const time = (r) => Date.parse(r?.ran_at ?? r?.created_at ?? '') || 0
const MATCH_KINDS = new Set(['match', 'practice_match'])

/** Natural label order: B2 before B10. */
export function byLabel(a, b) {
  return String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' })
}

/** One battery's summary from its runs (newest first is not required). */
export function summarize(battery, allRuns, t = CHECK_THRESHOLDS) {
  const runs = allRuns.filter((r) => r.battery_id === battery.id).sort((a, b) => time(b) - time(a))
  const recent = runs.slice(0, t.BROWNOUT_LOOKBACK)
  const restingRun = runs.find((r) => MATCH_KINDS.has(r.kind) && num(r.voltage_before) !== null)
  const resting = restingRun ? num(restingRun.voltage_before) : null
  const anyVoltageRun = runs.find((r) => num(r.voltage_before) !== null)
  const resistanceRun = runs.find((r) => num(r.resistance_mohm) !== null)
  const resistance = resistanceRun ? num(resistanceRun.resistance_mohm) : null
  // Robot-measured (0041): newest first; the trend is oldest first.
  const robotRuns = runs.filter((r) => num(r.robot_resistance_mohm) !== null)
  const robotR = robotRuns.length ? num(robotRuns[0].robot_resistance_mohm) : null
  const verdictRun = runs.find((r) => typeof r.verdict === 'string' && r.verdict.trim())
  const reasons = []
  const recentBrownouts = recent.filter((r) => r.brownout === 'yes').length
  if (recentBrownouts) reasons.push(`Brownout in the last ${Math.min(t.BROWNOUT_LOOKBACK, runs.length)} run${runs.length === 1 ? '' : 's'}`)
  if (resting !== null && resting < t.MIN_RESTING_VOLTS) reasons.push(`Rested at ${resting.toFixed(2)} V before a match (under ${t.MIN_RESTING_VOLTS})`)
  if (resistance !== null && resistance > t.MAX_RESISTANCE_MOHM) reasons.push(`${resistance} mΩ resistance (over ${t.MAX_RESISTANCE_MOHM})`)
  if (robotR !== null && robotR > ROBOT_R.PULL_OVER) reasons.push(`Robot read ${robotR} mΩ last time (over ${ROBOT_R.PULL_OVER}, battery + wiring)`)
  const retired = battery.status === 'retired'
  const check = !retired && reasons.length > 0
  return {
    ...battery,
    runs,
    runCount: runs.length,
    brownouts: runs.filter((r) => r.brownout === 'yes').length,
    lastUsed: runs[0]?.ran_at ?? null,
    restingVolts: resting,
    lastVolts: anyVoltageRun ? num(anyVoltageRun.voltage_before) : null,
    resistance,
    robotR,
    robotRAt: robotRuns[0]?.ran_at ?? null,
    robotTrend: robotRuns.slice(0, ROBOT_R.TREND_RUNS).reverse().map((r) => num(r.robot_resistance_mohm)),
    minVolts: (() => { const r = runs.find((x) => num(x.min_volts) !== null); return r ? num(r.min_volts) : null })(),
    verdict: verdictRun?.verdict ?? null,
    verdictAt: verdictRun?.ran_at ?? null,
    robotLevel: robotLevel(robotR),
    restLevel: restLevel(resting),
    standsOut: false,
    reasons,
    check,
    matchReady: battery.status === 'competition' && battery.charge_state === 'charged' && !check,
  }
}

const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * The fleet line: the median of each in-service battery's latest robot R, and
 * the rule in plain words. One battery high while the rest read normal = that
 * battery; most high (median over 28) = the robot's wiring. Answers
 * { readings, median, standOut: [{ id, label, robotR }], diagnosis, says }
 * with diagnosis none, few, ok, battery or wiring.
 */
export function fleetLine(rows) {
  const live = (rows ?? []).filter((r) => r.status !== 'retired' && r.robotR !== null && r.robotR !== undefined)
  const n = live.length
  if (!n) return { readings: 0, median: null, standOut: [], diagnosis: 'none', says: 'No robot readings yet. Import a match file or a pit load test.' }
  const med = Math.round(median(live.map((r) => r.robotR)) * 10) / 10
  if (n < ROBOT_R.MIN_FLEET) return { readings: n, median: med, standOut: [], diagnosis: 'few', says: `Robot readings on ${n} of the batteries. ${ROBOT_R.MIN_FLEET} or more make the comparison.` }
  if (med > ROBOT_R.WIRING_MEDIAN) {
    return { readings: n, median: med, standOut: [], diagnosis: 'wiring',
      says: `Most batteries read high (median ${med} mΩ): the robot's wiring. Inspect the main breaker, SB50 contacts and PDH terminals.` }
  }
  const standOut = live.filter((r) => r.robotR >= med * ROBOT_R.FLEET_RATIO || r.robotR > med + ROBOT_R.FLEET_MARGIN)
    .sort((a, b) => b.robotR - a.robotR).map((r) => ({ id: r.id, label: r.label, robotR: r.robotR }))
  if (!standOut.length) return { readings: n, median: med, standOut, diagnosis: 'ok', says: 'No battery stands out. The robot wiring reads normal.' }
  const names = standOut.map((s) => `${s.label} (${s.robotR})`).join(', ')
  return { readings: n, median: med, standOut, diagnosis: 'battery',
    says: `${names} ${standOut.length === 1 ? 'stands' : 'stand'} out against the others: ${standOut.length === 1 ? 'that battery' : 'those batteries'}, not the robot. Load-test again or pull ${standOut.length === 1 ? 'it' : 'them'}.` }
}

/**
 * The board, worst first: flagged batteries (most reasons, then most
 * brownouts, then lowest resting voltage), then the rest by label, retired
 * last. A battery with no measurement is never treated as measuring 0.
 */
export function batteryBoard(batteries, runs, t = CHECK_THRESHOLDS) {
  const rows = (batteries ?? []).map((b) => summarize(b, runs ?? [], t))
  // The fleet sharpens each battery's robot R level (over median + 5 = pull)
  // and marks the ones that stand out; it never adds a Check reason.
  const fleet = fleetLine(rows)
  const med = fleet.diagnosis === 'ok' || fleet.diagnosis === 'battery' ? fleet.median : null
  const out = new Set(fleet.standOut.map((s) => s.id))
  for (const r of rows) { r.robotLevel = robotLevel(r.robotR, med); r.standsOut = out.has(r.id) }
  const rank = (r) => (r.status === 'retired' ? 2 : r.check ? 0 : 1)
  return rows.sort((a, b) => rank(a) - rank(b)
    || (a.check && b.check ? (b.reasons.length - a.reasons.length) || (b.brownouts - a.brownouts)
      || ((a.restingVolts ?? Infinity) - (b.restingVolts ?? Infinity)) : 0)
    || byLabel(a, b))
}

export const FILTERS = Object.freeze([
  { key: 'all', label: 'In service' },
  { key: 'ready', label: 'Match-ready' },
  { key: 'check', label: 'Check' },
  { key: 'retired', label: 'Retired' },
])
export function applyFilter(board, key) {
  if (key === 'ready') return board.filter((b) => b.matchReady)
  if (key === 'check') return board.filter((b) => b.check)
  if (key === 'retired') return board.filter((b) => b.status === 'retired')
  return board.filter((b) => b.status !== 'retired')
}

/** A number typed on a phone keypad: '12,6' and '12.6' both read 12.6; blank is null, never 0. */
export function readNumber(text) {
  const s = String(text ?? '').trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** The run form's values checked the way the database checks them. Answers an error sentence or null. */
export function runProblem(v) {
  if (!v.battery_id) return 'Choose a battery.'
  if (!RUN_KINDS.some((k) => k.key === v.kind)) return 'Choose what the run was.'
  for (const [k, name, lo, hi] of [['voltage_before', 'Voltage before', 0, 16], ['voltage_after', 'Voltage after', 0, 16], ['resistance_mohm', 'Resistance', 0, 500], ['minutes', 'Minutes', 0, 600]]) {
    const n = v[k]
    if (n === null || n === undefined) continue
    if (Number.isNaN(n)) return `${name} must be a number.`
    if (n < lo || n > hi) return `${name} must be between ${lo} and ${hi}.`
  }
  if (v.minutes !== null && v.minutes !== undefined && !Number.isInteger(v.minutes)) return 'Minutes must be a whole number.'
  if (v.performance !== null && v.performance !== undefined && ![1, 2, 3, 4, 5].includes(v.performance)) return 'Performance is 1 to 5.'
  return null
}

/** The function call for a run, from the form values. */
export function runArgs(v) {
  return {
    p_battery: v.battery_id,
    p_kind: v.kind,
    p_event: v.event_id || null,
    p_match: (v.match_label ?? '').trim() || null,
    p_voltage_before: v.voltage_before ?? null,
    p_voltage_after: v.voltage_after ?? null,
    p_resistance: v.resistance_mohm ?? null,
    p_minutes: v.minutes ?? null,
    p_brownout: v.brownout || 'unknown',
    p_performance: v.performance ?? null,
    p_notes: (v.notes ?? '').trim() || null,
  }
}

/** True when this member may still correct this run: their own within 24 hours, or staff. */
export function canEditRun(run, { uid, isStaff, now = Date.now() }) {
  if (isStaff) return true
  return run.member_id === uid && now - (Date.parse(run.created_at) || 0) < 24 * 3600_000
}

export const CSV_COLUMNS = Object.freeze([
  ['battery', 'Battery'], ['status', 'Status'], ['ran_at', 'When (UTC)'], ['kind', 'Kind'], ['event', 'Event'], ['match_label', 'Match'],
  ['voltage_before', 'Resting V before'], ['voltage_after', 'V after'], ['resistance_mohm', 'Beak resistance (mOhm, battery only)'],
  ['robot_resistance_mohm', 'Robot resistance (mOhm, battery + wiring)'], ['min_volts', 'Lowest V'], ['minutes', 'Minutes'],
  ['brownout', 'Brownout'], ['performance', 'Performance (1-5)'], ['verdict', 'Robot verdict'], ['member', 'Logged by'], ['notes', 'Notes'],
])

/** One CSV row per run, newest first, with the battery label and names filled in. */
export function csvRows(batteries, runs, { nameOf = () => '', eventOf = () => '' } = {}) {
  const byId = new Map((batteries ?? []).map((b) => [b.id, b]))
  return [...(runs ?? [])].sort((a, b) => time(b) - time(a)).map((r) => ({
    battery: byId.get(r.battery_id)?.label ?? '',
    status: statusLabel(byId.get(r.battery_id)?.status),
    ran_at: r.ran_at,
    kind: kindLabel(r.kind),
    event: r.event_id ? eventOf(r.event_id) : '',
    match_label: r.match_label ?? '',
    voltage_before: num(r.voltage_before),
    voltage_after: num(r.voltage_after),
    resistance_mohm: num(r.resistance_mohm),
    robot_resistance_mohm: num(r.robot_resistance_mohm),
    min_volts: num(r.min_volts),
    minutes: num(r.minutes),
    brownout: brownoutLabel(r.brownout),
    performance: num(r.performance),
    verdict: r.verdict ?? '',
    member: nameOf(r.member_id),
    notes: r.notes ?? '',
  }))
}
