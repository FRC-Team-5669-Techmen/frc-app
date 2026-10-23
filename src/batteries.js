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
  const reasons = []
  const recentBrownouts = recent.filter((r) => r.brownout === 'yes').length
  if (recentBrownouts) reasons.push(`Brownout in the last ${Math.min(t.BROWNOUT_LOOKBACK, runs.length)} run${runs.length === 1 ? '' : 's'}`)
  if (resting !== null && resting < t.MIN_RESTING_VOLTS) reasons.push(`Rested at ${resting.toFixed(2)} V before a match (under ${t.MIN_RESTING_VOLTS})`)
  if (resistance !== null && resistance > t.MAX_RESISTANCE_MOHM) reasons.push(`${resistance} mΩ resistance (over ${t.MAX_RESISTANCE_MOHM})`)
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
    reasons,
    check,
    matchReady: battery.status === 'competition' && battery.charge_state === 'charged' && !check,
  }
}

/**
 * The board, worst first: flagged batteries (most reasons, then most
 * brownouts, then lowest resting voltage), then the rest by label, retired
 * last. A battery with no measurement is never treated as measuring 0.
 */
export function batteryBoard(batteries, runs, t = CHECK_THRESHOLDS) {
  const rows = (batteries ?? []).map((b) => summarize(b, runs ?? [], t))
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
  ['voltage_before', 'Resting V before'], ['voltage_after', 'V after'], ['resistance_mohm', 'Resistance (mOhm)'], ['minutes', 'Minutes'],
  ['brownout', 'Brownout'], ['performance', 'Performance (1-5)'], ['member', 'Logged by'], ['notes', 'Notes'],
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
    minutes: num(r.minutes),
    brownout: brownoutLabel(r.brownout),
    performance: num(r.performance),
    member: nameOf(r.member_id),
    notes: r.notes ?? '',
  }))
}
