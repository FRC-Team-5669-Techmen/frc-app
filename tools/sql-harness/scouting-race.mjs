#!/usr/bin/env node
// Native, separate connections to the throwaway harness database. No live target.
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
if (!process.env.PGHOST?.startsWith('/tmp/frc-sqlh-')) throw new Error('Run only through tools/sql-harness/run.mjs --node')
const clients = []
async function connect() { const c = new Client(); await c.connect(); clients.push(c); return c }
const db = await connect(), first = await connect(), second = await connect()
let passed = 0
function check(label, ok) { assert.ok(ok, label); passed++; console.log(`PASS scouting race: ${label}`) }
async function as(client, member, role = 'authenticated') {
  await client.query('begin')
  await client.query("select set_config('statement_timeout','10000',true)")
  await client.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [member ?? '', JSON.stringify({ sub: member, role })])
  await client.query(`set local role ${role}`)
}
const event = randomUUID()
async function save(client, { id = randomUUID(), op = randomUUID(), version = 0, kind = 'message', match = null, team = 5669, payload = { text:'Race proof', status:'open' } } = {}) {
  return (await client.query('select public.scouting_save($1,$2,$3,$4,$5,$6,$7,$8,$9) as record', [id,event,kind,team,match,payload,version,op,actor])).rows[0].record
}
// Prove overlap from pg_stat_activity, rather than relying on scheduling or sleep.
async function waitBlocked(pid) {
  const end = Date.now() + 5000
  do {
    const r = (await db.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0]
    if (r?.wait_event_type === 'Lock') return
    await new Promise(r => setTimeout(r, 10))
  } while (Date.now() < end)
  throw new Error('Second connection never waited on the first transaction')
}
let actor
try {
  actor = (await db.query("select p.id from public.profiles p join public.member_roles r on r.member_id=p.id where r.role='student' and p.approved and p.status='active' and not exists(select 1 from public.member_roles x where x.member_id=p.id and x.role='parent') order by p.id limit 1")).rows[0].id
  await db.query("insert into public.events(id,title,kind,starts_at,ends_at) values($1,'Disposable scouting race','competition',now(),now()+interval '1 day')", [event])
  const pid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid

  // Identical operation held before COMMIT: retry must wait and return the same receipt.
  const id = randomUUID(), op = randomUUID()
  await as(first,actor); const initial = await save(first,{id,op})
  await as(second,actor)
  const duplicate = save(second,{id,op}).then(value=>({value}),error=>({error}))
  await waitBlocked(pid); await first.query('commit')
  const replay = await duplicate; await second.query('commit')
  check('overlapping identical retry returns the exact committed receipt', !replay.error && JSON.stringify(replay.value)===JSON.stringify(initial))
  check('identical retry creates one record, one revision and one receipt', (await db.query('select (select count(*) from public.scouting_records where id=$1)=1 and (select count(*) from public.scouting_revisions where record_id=$1)=1 and (select count(*) from public.scouting_operations where operation_id=$2)=1 as ok',[id,op])).rows[0].ok)

  // Same base version, different bodies: one update wins, one conflict preserves it.
  await as(first,actor); await save(first,{id,version:1,payload:{text:'First correction',status:'open'}})
  await as(second,actor)
  const stale = save(second,{id,version:1,payload:{text:'Stale correction',status:'open'}}).then(value=>({value}),error=>({error}))
  await waitBlocked(pid); await first.query('commit')
  const refused = await stale; await second.query('rollback')
  check('overlapping stale correction is refused with 40001', refused.error?.code==='40001')
  const current = (await db.query('select version,payload from public.scouting_records where id=$1',[id])).rows[0]
  check('winning correction and exactly two revisions survive', current.version===2 && current.payload.text==='First correction' && Number((await db.query('select count(*) as n from public.scouting_revisions where record_id=$1',[id])).rows[0].n)===2)

  // Different IDs for one logical observation: unique index must serialize the inserts.
  const observation = {kind:'observation',match:'qm77',payload:{source:'live',answers:{trench:'did_not_see'}}}
  await as(first,actor); await save(first,observation)
  await as(second,actor)
  const logical = save(second,observation).then(value=>({value}),error=>({error}))
  await waitBlocked(pid); await first.query('commit')
  const logicalResult = await logical; await second.query('rollback')
  check('simultaneous fresh IDs cannot duplicate a logical observation', logicalResult.error?.code==='40001' && Number((await db.query("select count(*) as n from public.scouting_records where event_id=$1 and kind='observation'",[event])).rows[0].n)===1)

  // Competing dispatchers reserve only one immutable message version, without sending.
  await as(first,actor); const notification=await save(first,{payload:{text:'Reservation only; never sent',status:'open',request_delivery:true}}); await first.query('commit')
  await as(first,null,'service_role')
  const claim = (await first.query('select public.scouting_claim_delivery($1,1) as result',[notification.id])).rows[0].result
  await as(second,null,'service_role')
  const reserve=second.query('select public.scouting_claim_delivery($1,1) as result',[notification.id])
  await waitBlocked(pid); await first.query('commit')
  const lost=(await reserve).rows[0].result; await second.query('commit')
  check('two live connections cannot both reserve notification delivery', claim.claimed===true && lost.claimed===false && claim.delivery.id===lost.delivery.id)
  check('dispatcher reserves the immutable revision with the observation untouched', lost.record.payload.text===notification.payload.text && Number((await db.query('select count(*) as n from public.scouting_revisions where record_id=$1',[notification.id])).rows[0].n)===1)
  console.log(`scouting race: ${passed}/7 passed (native PostgreSQL, separate connections; no HTTP or external sends)`)
} finally {
  // Database is disposable and removed by the parent runner. Do not delete audit evidence.
  await Promise.allSettled(clients.map(c=>c.end()))
}
