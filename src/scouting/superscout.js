// Super scouts (ledger 0022, migration 0030).
//
// Elite FRC teams pair their per-robot data scouts with one or two "super
// scouts" per alliance who record NO counts: they watch the whole alliance and
// rate what numbers miss (driver skill, defense, speed, intake reliability)
// and write down failures. Their notes feed pick lists.
//
// A super-scout note is an observation with payload.role = 'super' and a
// payload.super object (0030's scouting_private.validate_super holds the same
// keys). It never carries capability answers or match fields, and it is
// excluded from every quantitative figure and from robot coverage
// (model.js currentObservations, coverage.js, schedule.js).
import { matchIdentity, isCurrentEvidence } from './provenance.js'

export const SUPER_RATINGS = Object.freeze([
  { key: 'driver_skill', label: 'Driver skill', hint: 'Smooth, aware, recovers fast' },
  { key: 'defense', label: 'Defense', hint: 'Slows the other alliance without fouls' },
  { key: 'speed', label: 'Speed', hint: 'Cycle and field-crossing speed' },
  { key: 'intake', label: 'Intake reliability', hint: 'Picks up FUEL first try' },
])
export const SUPER_NOTE_KEY = 'failures'
export const SUPER_SCALE = Object.freeze([[1, 'Poor'], [2, 'Below'], [3, 'Average'], [4, 'Strong'], [5, 'Elite']])
export const SUPER_KEYS = Object.freeze([...SUPER_RATINGS.map(r => r.key), SUPER_NOTE_KEY])

export const isSuperNote = r => r?.kind === 'observation' && r.payload?.role === 'super'
export const isSuperAssignment = r => r?.kind === 'assignment' && r.payload?.role === 'super'

/** Keep only recorded super fields; an unrated field is absent, never 0. */
export function cleanSuper(input = {}) {
  const out = {}
  for (const { key } of SUPER_RATINGS) {
    const v = input[key]
    if (Number.isInteger(v) && v >= 1 && v <= 5) out[key] = v
  }
  const note = typeof input[SUPER_NOTE_KEY] === 'string' ? input[SUPER_NOTE_KEY].trim().slice(0, 1000) : ''
  if (note) out[SUPER_NOTE_KEY] = note
  return out
}

/** The alliances of a scheduled match: red is the first three teams, blue the rest (TBA order). */
export function alliances(match) {
  const teams = match?.teams ?? []
  return [{ alliance: 'red', teams: teams.slice(0, 3) }, { alliance: 'blue', teams: teams.slice(3, 6) }].filter(a => a.teams.length)
}

/** Build one observation per team for a super scout's alliance sheet. */
export function superProposals({ match, notes, general = '', existing = [] }) {
  return Object.entries(notes).flatMap(([team, values]) => {
    const sup = cleanSuper(values)
    if (!Object.keys(sup).length) return []
    const prior = existing.find(r => r.team_number === Number(team) && matchIdentity(r) === matchIdentity({ match_key: match }))
    return [{ id: prior?.id, version: prior?.version ?? 0, kind: 'observation', team_number: Number(team), match_key: match,
      payload: { answers: {}, source: 'live', source_scope: 'current', role: 'super', super: sup, ...(general.trim() ? { notes: general.trim().slice(0, 4000) } : {}) } }]
  })
}

function newestSuper(records, team) {
  const rows = records.filter(r => isSuperNote(r) && r.team_number === Number(team) && isCurrentEvidence(r))
  const by = new Map()
  for (const r of rows) {
    const k = `${r.event_id}:${r.member_id}:${matchIdentity(r)}`
    const old = by.get(k)
    if (!old || (r.version ?? 0) > (old.version ?? 0) || String(r.updated_at ?? '') > String(old.updated_at ?? '')) by.set(k, r)
  }
  return [...by.values()]
}

/**
 * Per-team super-scout summary from CONFIRMED records: the mean of each
 * rating over the notes that rated it (n shown), and every failure note.
 * A team nobody rated has n = 0 and mean null, never 0.
 */
export function superSummary(records, team) {
  const rows = newestSuper(records, team)
  const out = { team: Number(team), notes: rows.length, failures: [] }
  for (const { key } of SUPER_RATINGS) {
    const vals = rows.map(r => r.payload?.super?.[key]).filter(v => Number.isInteger(v))
    out[key] = { mean: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null, n: vals.length }
  }
  for (const r of rows) {
    const f = r.payload?.super?.[SUPER_NOTE_KEY]
    if (typeof f === 'string' && f.trim()) out.failures.push({ match: r.match_key, text: f.trim() })
  }
  return out
}

export const fmtMean = s => (s?.mean === null || s?.mean === undefined ? '--' : s.mean.toFixed(1))

/** Done when the assignee has a super note for every team on the alliance. */
export function superAssignmentDone(row, records) {
  const teams = row.payload?.teams?.length ? row.payload.teams : [row.team_number]
  return teams.every(t => records.some(r => isSuperNote(r) && r.member_id === row.payload.assignee && r.team_number === t && matchIdentity(r) === matchIdentity(row)))
}
