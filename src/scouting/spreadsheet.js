// Download spreadsheet (ledger 0017). A tester filed: "When you export event
// data, it gives you it as this hard to read text." The JSON recovery archive
// stays (backup.js); this adds two CSVs a person opens in Sheets or Excel:
//   observations  one row per observation, one column per field, scout name,
//                 match and team; a field not recorded is an EMPTY cell,
//                 never 0, and "did not see" is written out.
//   teams         one row per team, the confirmed current-event summaries the
//                 team view shows (match.js, model.js reliability).
// Pure: tests/scouting-spreadsheet.test.js drives it. The formula guard is
// src/csv.js (decision 18).
import { CAPABILITIES, reliability, currentObservations } from './model.js'
import { MATCH_FIELDS, teamMatchSummary } from './match.js'
import { footageLabel, isCurrentEvidence } from './provenance.js'

const WORD = { yes: 'yes', no: 'no', did_not_see: 'did not see', not_applicable: 'not applicable', none: 'none', some: 'some', most: 'most of the match',
  level1: 'level 1', level2: 'level 2', level3: 'level 3', failed: 'attempted and failed' }
const word = v => (v === undefined || v === null ? null : typeof v === 'number' ? v : WORD[v] ?? v)

export const OBSERVATION_COLUMNS = Object.freeze([
  ['team', 'Team'], ['team_name', 'Team name'], ['match', 'Match'], ['scout', 'Scout'], ['source', 'Source'], ['current', 'Counts toward this event'],
  ...MATCH_FIELDS.map(f => [`m_${f.key}`, f.label]),
  ...CAPABILITIES.map(c => [`c_${c.key}`, c.label]),
  ['notes', 'Notes'], ['version', 'Version'], ['updated_at', 'Saved (UTC)'], ['status', 'Sync status'],
])

/** One row per observation (latest version of each record), sorted by team then match. */
export function observationRows(records, { memberName = () => '', nameFor = () => '' } = {}) {
  const latest = new Map()
  for (const r of records.filter(x => x.kind === 'observation')) {
    const old = latest.get(r.id)
    if (!old || (r.version ?? 0) > (old.version ?? 0)) latest.set(r.id, r)
  }
  const sortKey = m => { const x = /(qm|sf|f)(\d+)(?:m(\d+))?$/i.exec(String(m ?? '')); return x ? [{ qm: 0, sf: 1, f: 2 }[x[1].toLowerCase()], Number(x[2]), Number(x[3] ?? 0)] : [9, 0, 0] }
  return [...latest.values()].sort((a, b) => a.team_number - b.team_number || sortKey(a.match_key).join('.').localeCompare(sortKey(b.match_key).join('.'), undefined, { numeric: true }) || String(a.match_key).localeCompare(String(b.match_key)))
    .map(r => {
      const row = {
        team: r.team_number, team_name: nameFor(r.team_number), match: r.match_key, scout: memberName(r.member_id), source: footageLabel(r),
        current: isCurrentEvidence(r) ? 'yes' : 'no', notes: r.payload?.notes ?? '', version: r.version, updated_at: r.updated_at ?? r.created_at ?? '',
        status: r.localStatus ? 'saved on this device, not synced' : 'synced',
      }
      for (const f of MATCH_FIELDS) row[`m_${f.key}`] = word(r.payload?.match?.[f.key])
      for (const c of CAPABILITIES) row[`c_${c.key}`] = word(r.payload?.answers?.[c.key])
      return row
    })
}

const pct = v => (v === null || v === undefined ? null : Math.round(v * 1000) / 10)
const med = s => (s?.median === null || s?.median === undefined ? null : s.median)

export const TEAM_COLUMNS = Object.freeze([
  ['team', 'Team'], ['team_name', 'Team name'], ['matches', 'Scouted matches (match fields)'],
  ['total_fuel', 'Median FUEL (auto + teleop)'], ['auto_fuel', 'Median auto FUEL'], ['teleop_fuel', 'Median teleop FUEL'], ['teleop_missed', 'Median FUEL missed'], ['fuel_n', 'FUEL matches'],
  ['tower_best', 'Best TOWER level'], ['tower_median', 'Median TOWER level'], ['tower_n', 'TOWER matches'],
  ['auto_climb', 'Auto climb rate %'], ['shuttled', 'Shuttled rate %'], ['defense', 'Played defense %'], ['defense_rating', 'Median defense 1-5'], ['driver_skill', 'Median driver 1-5'],
  ['trouble', 'Died, tipped, stuck or broke %'], ['trouble_n', 'Reliability matches'],
  ['died', 'Died %'], ['tipped', 'Tipped %'], ['stuck', 'Stuck %'], ['broke', 'Broke %'],
  ...CAPABILITIES.flatMap(c => [[`c_${c.key}`, `${c.label} %`], [`c_${c.key}_n`, `${c.label} matches`]]),
  ['observations', 'Observations (confirmed, current)'], ['fouls', 'Fouls and cards'],
])

/** One row per team, from CONFIRMED records only (pass the server records). */
export function teamRows(confirmed, { nameFor = () => '' } = {}) {
  const teams = [...new Set(confirmed.filter(r => r.kind === 'observation' || r.kind === 'team' || r.kind === 'pit').map(r => r.team_number).filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
  return teams.map(team => {
    const s = teamMatchSummary(confirmed, team)
    const row = {
      team, team_name: nameFor(team), matches: s.matches,
      total_fuel: med(s.totalFuel), auto_fuel: med(s.auto_fuel), teleop_fuel: med(s.teleop_fuel), teleop_missed: med(s.teleop_missed), fuel_n: s.totalFuel.n,
      tower_best: s.tower.best, tower_median: s.tower.median, tower_n: s.tower.n,
      auto_climb: pct(s.auto_climb.rate), shuttled: pct(s.shuttled.rate), defense: pct(s.defense.rate), defense_rating: med(s.defense_rating), driver_skill: med(s.driver_skill),
      trouble: pct(s.troubleRate.rate), trouble_n: s.troubleRate.n,
      died: pct(s.died.rate), tipped: pct(s.tipped.rate), stuck: pct(s.stuck.rate), broke: pct(s.broke.rate),
      observations: currentObservations(confirmed, team).length, fouls: s.fouls.notes.join(' | '),
    }
    for (const c of CAPABILITIES) { const r = reliability(confirmed, team, c.key); row[`c_${c.key}`] = r.percent === null ? null : Math.round(r.percent * 10) / 10; row[`c_${c.key}_n`] = r.denominator }
    return row
  })
}

export const SHEET_NOTE = 'Techmen scouting. Empty cell = not recorded (never zero). Rates and medians use confirmed, current-event observations, one value per match.'
