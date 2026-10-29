// The Teams tab's compact table (one row per team). Every figure comes from
// an existing rule; nothing here recomputes one (CLAUDE.md "Do not duplicate
// a rule"):
//   scouted matches  coverage.js eventCoverage().currentMatches (the Teams
//                    coverage panel's own count)
//   FUEL, TOWER,     match.js teamMatchSummary() (the team card's numbers),
//   trouble, defense formatted by fmtMedian / towerLabel / fmtRate
//   driver           superscout.js superSummary().driver_skill, fmtMean
//   capabilities     model.js reliability(), via eventCoverage().trials
// An empty value is null for sorting and "--" on screen, never 0.
import { CAPABILITIES } from './model.js'
import { eventCoverage } from './coverage.js'
import { teamMatchSummary, fmtMedian, fmtRate, towerLabel } from './match.js'
import { superSummary, fmtMean } from './superscout.js'

// `phone: true` columns stay on a phone; the rest show from 641 px up (CSS).
// `first` is the direction a first click sorts in.
export const TABLE_COLUMNS = Object.freeze([
  { key: 'team', label: 'Team', title: 'Team number', phone: true, first: 'asc' },
  { key: 'name', label: 'Name', title: 'Team name', phone: true, first: 'asc', text: true },
  { key: 'matches', label: 'Matches', title: 'Scouted matches, confirmed, current event', phone: true, first: 'desc' },
  { key: 'fuel', label: 'FUEL', title: 'Median FUEL per match (auto + teleop)', phone: true, first: 'desc' },
  { key: 'tower', label: 'TOWER', title: 'Best TOWER level', phone: true, first: 'desc' },
  { key: 'trouble', label: 'Trouble', title: 'Share of decisive matches where it died, tipped, got stuck or broke', phone: true, first: 'desc' },
  { key: 'defense', label: 'Defense', title: 'Share of matches where it played defense', first: 'desc' },
  { key: 'driver', label: 'Super driver', title: 'Super scouts: driver skill mean, 1 to 5', first: 'desc' },
  ...CAPABILITIES.map(c => ({ key: `cap_${c.key}`, label: c.short ?? c.label, title: `${c.label}: observed matches yes / decisive matches`, first: 'desc', capability: c.key })),
])

export const DEFAULT_SORT = Object.freeze({ key: 'team', dir: 'asc' })
export const SORT_STORAGE_KEY = 'techmen.scouting.teamSort.v1'

/**
 * One row per team number. `records` is what the page shows (its team list),
 * `confirmed` the confirmed records every summary reads, as on the card.
 */
export function teamTableRows(numbers, records, confirmed, nameFor = () => '') {
  const coverage = new Map(eventCoverage(records, confirmed).map(c => [c.team, c]))
  return numbers.map(team => {
    const s = teamMatchSummary(confirmed, team), sup = superSummary(confirmed, team), cov = coverage.get(team)
    const row = {
      team,
      values: {
        team,
        name: nameFor(team) || '',
        matches: cov?.currentMatches ? cov.currentMatches : null,
        fuel: s.totalFuel.median ?? null,
        tower: s.tower.best ?? null,
        trouble: s.troubleRate.rate ?? null,
        defense: s.defense.rate ?? null,
        driver: sup.driver_skill.mean ?? null,
      },
      cells: {
        team: String(team),
        name: nameFor(team) || '--',
        matches: cov?.currentMatches ? String(cov.currentMatches) : '--',
        fuel: fmtMedian(s.totalFuel),
        tower: towerLabel(s.tower.best),
        trouble: fmtRate(s.troubleRate),
        defense: fmtRate(s.defense),
        driver: fmtMean(sup.driver_skill),
      },
    }
    for (const c of CAPABILITIES) {
      const r = cov?.trials.find(t => t.key === c.key)
      row.values[`cap_${c.key}`] = r?.denominator ? r.percent : null
      row.cells[`cap_${c.key}`] = r?.denominator ? `${r.yes}/${r.denominator}` : '--'
    }
    return row
  })
}

/** Empty values last in either direction; ties by team number, ascending. */
export function sortTeamRows(rows, sort = DEFAULT_SORT) {
  const col = TABLE_COLUMNS.find(c => c.key === sort?.key) ?? TABLE_COLUMNS[0]
  const sign = sort?.dir === 'asc' ? 1 : -1
  const empty = v => v === null || v === undefined || v === ''
  return [...rows].sort((a, b) => {
    const x = a.values[col.key], y = b.values[col.key]
    if (empty(x) !== empty(y)) return empty(x) ? 1 : -1
    if (!empty(x)) {
      const d = col.text ? String(x).localeCompare(String(y), undefined, { sensitivity: 'base' }) : x - y
      if (d) return sign * d
    }
    return a.team - b.team
  })
}

/** A header click: the same column flips, another starts in its first direction. */
export function nextSort(sort, key) {
  const col = TABLE_COLUMNS.find(c => c.key === key)
  if (!col) return sort
  if (sort?.key === key) return { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: col.first }
}

/** The remembered sort, or the default for anything missing or unknown. */
export function readSort(storage) {
  try {
    const v = JSON.parse(storage?.getItem(SORT_STORAGE_KEY) ?? 'null')
    if (v && TABLE_COLUMNS.some(c => c.key === v.key) && ['asc', 'desc'].includes(v.dir)) return { key: v.key, dir: v.dir }
  } catch { /* unreadable or blocked storage: the default */ }
  return DEFAULT_SORT
}

export function writeSort(storage, sort) {
  try { storage?.setItem(SORT_STORAGE_KEY, JSON.stringify({ key: sort.key, dir: sort.dir })) } catch { /* private mode: the sort still applies this visit */ }
}
