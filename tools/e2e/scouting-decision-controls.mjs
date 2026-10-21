#!/usr/bin/env node
// Deliberately permissive source mutations: exclusion checks must detect them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../../src/scouting/projection.js', import.meta.url), 'utf8')
const row = { id:'r', event_id:'e', member_id:'m', kind:'pick_list', version:1, payload:{rank:1} }
const result = {...row, version:2, payload:{rank:3}}
const op = {member_id:'m',event_id:'e',record_id:'r',status:'synced',result,args:{p_kind:'pick_list',p_expected_version:1,p_payload:{rank:3}}}
const cases = [
 ['downloaded event scope', 'r.event_id === eventId && ', '', fn => assert.equal(fn([{...row,event_id:'foreign'}],[],'m','e').confirmed.length,0)],
 ['queue member scope', 'op.member_id === memberId && ', '', fn => assert.equal(fn([row],[{...op,member_id:'other'}],'m','e').confirmed[0].version,1)],
 ['queue event scope', 'op.event_id === eventId)', 'true)', fn => assert.equal(fn([row],[{...op,event_id:'other'}],'m','e').confirmed[0].version,1)],
 ['receipt identity', 'row?.id === op.record_id && ', '', fn => assert.equal(fn([row],[{...op,result:{...result,id:'wrong'}}],'m','e').confirmed.length,1)],
 ['receipt event scope', 'row.event_id === eventId && ', '', fn => assert.equal(fn([row],[{...op,result:{...result,event_id:'other'}}],'m','e').confirmed[0].version,1)],
 ['confirmation required', "op.status === 'synced' && ", '', fn => assert.equal(fn([row],[{...op,status:'failed'}],'m','e').confirmed[0].version,1)],
 ['recovered proposal hold', '!op.recoveredFrom && ', '', fn => assert.deepEqual(fn([row],[{...op,status:'local',recoveredFrom:'failed'}],'m','e').visible,[row])],
 ['monotonic receipts', 'row.version > (confirmed.get(row.id)?.version ?? 0)', 'true', fn => assert.equal(fn([result],[{...op,result:row}],'m','e').confirmed[0].version,2)],
]
const load = async code => (await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).projectRecords
const original = await load(source)
for (const [name, from, to, oracle] of cases) {
  assert(source.includes(from),`missing mutation anchor ${name}`); oracle(original)
  const mutant = await load(source.replace(from,to))
  assert.throws(() => oracle(mutant),undefined,`${name} survived`)
  console.log(`PASS negative control: ${name}`)
}
console.log(`${cases.length}/${cases.length} permissive mutations detected`)
