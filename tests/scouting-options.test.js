// Observation options (src/scouting/options.js, migration 0037, ledger 0029).
// Every rule is driven both ways: what is accepted next to what is refused,
// on the same option.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { OPTION_TYPES, OPTION_PHASES, activeOptions, cleanCustom, validAnswer, choicesFromText, optionProblem, optionSummary, summaryText, answerCell, choiceAnswers } from '../src/scouting/options.js'
import { observationRows, teamRows, optionObservationColumns, optionTeamColumns } from '../src/scouting/spreadsheet.js'
import { customProblem } from '../src/dev/fixture/features/scoutingoptions.js'

const SQL = readFileSync(new URL('../supabase/migrations/0037_scouting_observation_options.sql', import.meta.url), 'utf8')
const zone = { id: 'o1', key: 'passing_zone', label: 'Passes from', type: 'choice', choices: [['alliance', 'Alliance zone'], ['neutral', 'Neutral zone']], phase: 'teleop', status: 'active', position: 10 }
const works = { id: 'o2', key: 'passing_works', label: 'Passes reach a partner', type: 'rating', phase: 'teleop', status: 'active', position: 20 }
const shifts = { id: 'o3', key: 'handles_shifts', label: 'Ready for phase shifts', type: 'yesno', phase: 'strategy', status: 'active', position: 5 }
const passes = { id: 'o4', key: 'passes', label: 'Passes made', type: 'count', phase: 'teleop', status: 'retired', position: 30 }
const asked = { id: 'o5', key: 'asked', label: 'Asked', type: 'yesno', phase: 'auto', status: 'requested', position: 1 }
const declined = { id: 'o6', key: 'declined', label: 'Declined', type: 'note', phase: 'auto', status: 'declined', position: 1 }
const ALL = [zone, works, shifts, passes, asked, declined]

describe('the vocabulary matches 0037', () => {
  it('types and phases are exactly the SQL check lists', () => {
    expect(SQL).toContain(`type in (${OPTION_TYPES.map(t => `'${t.value}'`).join(',')})`)
    expect(SQL).toContain(`phase in (${OPTION_PHASES.map(([p]) => `'${p}'`).join(',')})`)
  })
})

describe('which options a scout answers', () => {
  it('active only, by phase then position', () => {
    expect(activeOptions(ALL).map(o => o.key)).toEqual(['passing_zone', 'passing_works', 'handles_shifts'])
  })
})

describe('answers', () => {
  it('each type accepts its own values and refuses others (null is never an answer)', () => {
    expect(['alliance', 'neutral', 'did_not_see'].every(v => validAnswer(zone, v))).toBe(true)
    expect(['upper', null, undefined, 0].some(v => validAnswer(zone, v))).toBe(false)
    expect([1, 5].every(v => validAnswer(works, v)) && ![0, 6, 2.5, '3'].some(v => validAnswer(works, v))).toBe(true)
    expect([0, 500].every(v => validAnswer(passes, v)) && ![-1, 501, 1.5].some(v => validAnswer(passes, v))).toBe(true)
    expect(['yes', 'no', 'did_not_see'].every(v => validAnswer(shifts, v)) && !validAnswer(shifts, 'maybe')).toBe(true)
  })
  it('cleanCustom keeps recorded answers to active and retired options; drops skipped, requested, declined and unknown', () => {
    const c = cleanCustom({ passing_zone: 'neutral', passing_works: undefined, passes: 0, asked: 'yes', declined: 'x', ghost: 'yes', handles_shifts: null }, ALL)
    expect(c).toEqual({ passing_zone: 'neutral', passes: 0 })
    expect(cleanCustom({}, ALL)).toEqual({})
  })
  it('the fixture port refuses what the SQL refuses', () => {
    const db = { scouting_options: ALL }
    expect(customProblem(db, { passing_zone: 'neutral', passes: 3 })).toBe(null)
    expect(customProblem(db, { asked: 'yes' })).toMatch(/not turned on/)
    expect(customProblem(db, { passing_zone: null })).toMatch(/null is not an answer/)
    expect(customProblem(db, { passing_works: 9 })).toMatch(/does not fit/)
  })
})

describe('drafting an option', () => {
  it('choices from lines: slugged values, labels kept, duplicates merged, did_not_see never a value', () => {
    expect(choicesFromText('Alliance zone\nNeutral zone\nNeutral zone')).toEqual([['alliance_zone', 'Alliance zone'], ['neutral_zone', 'Neutral zone']])
    expect(choicesFromText('Did not see\nYes')).toEqual([['answer', 'Did not see'], ['yes', 'Yes']])
    expect(choicesFromText('Only one')).toBe(null)
  })
  it('problems before sending: name length, type, choices', () => {
    expect(optionProblem({ label: 'Passes from', type: 'choice', choices: [['a', 'A'], ['b', 'B']] })).toBe(null)
    expect(optionProblem({ label: 'P', type: 'yesno' })).toMatch(/2 to 120/)
    expect(optionProblem({ label: 'Passes', type: 'maybe' })).toMatch(/answer type/)
    expect(optionProblem({ label: 'Passes', type: 'choice', choices: [['a', 'A']] })).toMatch(/2 to 8/)
  })
})

let n = 0
const obs = (team, match, custom, member = 'm1', extra = {}) => ({ id: `r${n++}`, kind: 'observation', event_id: 'e', team_number: team, match_key: match, member_id: member, version: 1, updated_at: `2026-10-31T1${n % 10}:00:00Z`, payload: { answers: {}, source: 'live', custom, ...extra } })

describe('team summaries: one value per match', () => {
  const recs = [
    obs(4414, 'qm1', { passing_zone: 'neutral', passing_works: 4, handles_shifts: 'yes' }, 'a'),
    obs(4414, 'qm1', { passing_zone: 'neutral', passing_works: 2, handles_shifts: 'no' }, 'b'),
    obs(4414, 'qm2', { passing_zone: 'alliance', passing_works: 5, handles_shifts: 'yes' }, 'a'),
    obs(4414, 'qm3', { passing_zone: 'neutral', handles_shifts: 'did_not_see' }, 'a'),
    obs(1323, 'qm1', {}, 'a'),
  ]
  it('a choice counts matches and names the most common; a disagreement is disputed, not counted', () => {
    const s = optionSummary(recs, 4414, zone)
    expect(s).toMatchObject({ n: 3, top: 'neutral', disputed: 0 })
    expect(summaryText(zone, s)).toBe('Mostly Neutral zone (2 of 3)')
  })
  it('a rating is the median of per-match medians', () => {
    expect(optionSummary(recs, 4414, works)).toMatchObject({ median: 4, n: 2 })
  })
  it('a yes/no rate leaves out disputed and unseen matches', () => {
    const s = optionSummary(recs, 4414, shifts)
    expect(s).toMatchObject({ yes: 1, no: 0, n: 1, rate: 1, disputed: 1, unseen: 1 })
  })
  it('a team with no answers shows --, never 0 (negative control)', () => {
    expect(summaryText(works, optionSummary(recs, 1323, works))).toBe('--')
  })
})

describe('spreadsheets', () => {
  const recs = [obs(4414, 'qm1', { passing_zone: 'neutral', passes: 0 }, 'a')]
  it('observation rows carry a column per active or retired option; a skipped one is empty, a zero is 0', () => {
    expect(optionObservationColumns(ALL).map(c => c[0])).toEqual(['o_passing_zone', 'o_passing_works', 'o_handles_shifts', 'o_passes'])
    const [row] = observationRows(recs, { options: ALL })
    expect(row.o_passing_zone).toBe('Neutral zone')
    expect(row.o_passes).toBe('0')
    expect(row.o_passing_works).toBe(null)
  })
  it('team rows add a value and a match count per option', () => {
    expect(optionTeamColumns([zone]).map(c => c[0])).toEqual(['o_passing_zone', 'o_passing_zone_n'])
    const [row] = teamRows(recs, { options: ALL })
    expect(row.o_passing_zone).toBe('Neutral zone')
    expect(row.o_passing_zone_n).toBe(1)
    expect(answerCell(zone, 'did_not_see')).toBe('Did not see')
    expect(choiceAnswers(zone).at(-1)).toEqual(['did_not_see', 'Did not see'])
  })
  it('without options the sheets are unchanged (positive control for the old shape)', () => {
    const [row] = observationRows(recs)
    expect(Object.keys(row).some(k => k.startsWith('o_'))).toBe(false)
  })
})
