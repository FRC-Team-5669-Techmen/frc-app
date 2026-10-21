// Replays the independent hand examples in acceptance-oracles.md.
// No expected value is obtained by invoking another implementation helper.
import assert from 'node:assert/strict'
import { reliability, aggregatePickLists, previewComparison } from '../../src/scouting/model.js'
const observations = []
for (const [match, answers] of [
  ['qm1', ['yes', 'yes']], ['qm2', ['no', 'did_not_see']],
  ['qm3', ['yes', 'no']], ['qm4', ['not_applicable', undefined]],
  ['qm5', ['yes', undefined]],
]) answers.forEach((answer, i) => observations.push({
  kind: 'observation', event_id: 'fixture', member_id: String(i),
  team_number: 101, match_key: match, version: 1,
  payload: { answers: answer ? { trench: answer } : {} },
}))
assert.deepEqual(reliability(observations, 101, 'trench'), {
  yes: 2, no: 1, denominator: 3, percent: 100 * 2 / 3, sufficient: true,
  disputed: 1, didNotSee: 1, notApplicable: 1, missing: 2,
})
const correction = { ...observations[2], version: 2, payload: { answers: { trench: 'yes' } } }
assert.equal(reliability([...observations, correction, correction], 101, 'trench').percent, 100)
assert.equal(reliability([...observations, correction, correction], 101, 'trench').denominator, 3)
assert.equal(reliability(observations.filter(r => r.match_key === 'qm4'), 101, 'trench').percent, null)
assert.equal(reliability(observations.filter(r => r.match_key === 'qm2'), 101, 'trench').percent, 0)
const votes = {
  101: [[1, 1], [2, 2], [3, 4]], 202: [[1, 2], [1, 4], ['dnp', 1]],
  303: [[1, 1], [2, 5]], 404: [['dnp', 1], ['dnp', 1]], 505: [[2, 2], [2, 2]],
}
const lists = [0, 1, 2].map(i => ({
  kind: 'pick_list', event_id: 'fixture', member_id: String(i), payload: {
    entries: Object.entries(votes).filter(([, values]) => values[i])
      .map(([team, values]) => ({ team: +team, tier: values[i][0], rank: values[i][1] })),
  },
}))
const ranked = aggregatePickLists(lists)
assert.deepEqual(ranked.map(r => r.team), [202, 303, 101, 505, 404])
assert.deepEqual(ranked.map(r => r.tier), [1, 1.5, 2, 2, 'dnp'])
assert.deepEqual(ranked.map(r => r.rank), [3, 3, 2, 2, null])
assert.deepEqual(ranked.map(r => r.support), [3, 2, 3, 2, 2])
assert.equal(ranked[0].dnpFraction, 1 / 3)
assert.equal(ranked[4].dnpFraction, 1)
const entries = [101, 202, 303, 404, 505].map((team, i) => ({ team, tier: 1, rank: i + 1 }))
const compare = votes => previewComparison(entries, [202, 404, 505], votes)
assert.deepEqual(compare([
  { winner: 404, loser: 202 }, { winner: 505, loser: 202 }, { winner: 404, loser: 505 },
]).entries.map(r => r.team), [101, 404, 303, 505, 202])
assert.deepEqual(compare([
  { winner: 202, loser: 404 }, { winner: 404, loser: 505 }, { winner: 505, loser: 202 },
]).entries, entries)
console.log('Independent scouting hand oracles: 13 assertions passed; synthetic data only.')
