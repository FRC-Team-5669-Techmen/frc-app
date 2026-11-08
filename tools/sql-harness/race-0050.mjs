#!/usr/bin/env node
// Real concurrent sessions. Disposable harness only; fictional identities.
import pg from 'pg'
if (!(process.env.PGHOST || '').startsWith('/tmp/')) throw new Error('Requires the disposable SQL harness')
const db = new pg.Client(); await db.connect()
const q = async (sql, args = []) => (await db.query(sql, args)).rows
async function actor(school) {
  const [{ id }] = await q('select gen_random_uuid()::text as id')
  await q('insert into auth.users(id,email) values($1,$2)', [id, `${id}@${school ? 'boscotech.edu' : 'example.invalid'}`])
  await q("insert into public.profiles(id,approved,full_name) values($1,true,'Fictional Transfer Member') on conflict(id) do update set approved=true,full_name='Fictional Transfer Member'", [id])
  await q("insert into public.member_roles(member_id,role) values($1,'student') on conflict do nothing", [id])
  return id
}
async function call(id, sql, args = []) {
  const c = new pg.Client(); await c.connect()
  try {
    await c.query('begin'); await c.query("set local statement_timeout='5s'")
    await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })])
    await c.query('set local role authenticated')
    const r = await c.query(sql,args)
    await c.query('commit'); return { ok:true, value:r.rows[0]?.value }
  } catch(error) { await c.query('rollback'); return { ok:false, code:error.code } }
  finally { await c.end() }
}
const [{ definition: redeemDefinition }] = await q("select pg_get_functiondef('public.request_account_transfer(text)'::regprocedure) as definition")
async function expiryWhileWaiting() {
 const source=await actor(false), target=await actor(true)
 const generated=await call(source,'select public.create_account_transfer_code() as value')
 const c=new pg.Client(); await c.connect()
 try {
  await c.query('begin')
  await c.query("set local statement_timeout='5s'")
  await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[target,JSON.stringify({sub:target,role:'authenticated'})])
  await c.query('set local role authenticated')
  const [{pid}]=(await c.query('select pg_backend_pid() as pid')).rows
  await q('begin')
  await q("update public.account_transfer_codes set expires_at=clock_timestamp()+interval '0.5 seconds' where source_id=$1",[source])
  // Commit the short expiry, then hold the profile ahead of redemption.
  await q('commit'); await q('begin')
  await q('select id from public.profiles where id=$1 for update',[source])
  const redeem=c.query('select public.request_account_transfer($1)',[generated.value.code])
    .then(async()=>{await c.query('commit');return 'accepted'})
    .catch(async e=>{await c.query('rollback');return e.code})
  for(let i=0;i<100;i++) {
   const [{waiting}]=await q("select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1",[pid])
   if(waiting) break
   if(i===99) throw new Error('Redemption did not reach profile lock barrier')
   await new Promise(resolve=>setTimeout(resolve,10))
  }
  await q('select pg_sleep(0.6)'); await q('commit')
  return await redeem
 } finally {await q('rollback');await c.end()}
}
let passed = 0
const check = (label, ok, evidence) => {
  if (!ok) throw new Error(`${label}: ${JSON.stringify(evidence)}`)
  passed++; console.log(`PASS ${label}: ${JSON.stringify(evidence)}`)
}
try {
 for (let i=0;i<8;i++) {
  const source = await actor(false), t = await actor(true), u = await actor(true)
  const generated = await call(source,'select public.create_account_transfer_code() as value')
  if (!generated.ok) throw new Error(JSON.stringify(generated))
  const code = generated.value.code
  const results = await Promise.all([call(t,'select public.request_account_transfer($1) as value',[code]),call(u,'select public.request_account_transfer($1) as value',[code])])
  const [{ n }] = await q('select count(*)::int as n from public.account_transfer_requests where source_id=$1',[source])
  check(`single redemption race ${i+1}`, results.filter(r=>r.ok).length===1 && results.filter(r=>r.code==='22023').length===1 && n===1, { results,n })
 }
 const source = await actor(false), t = await actor(true)
 let generated = await call(source,'select public.create_account_transfer_code() as value')
 const results = await Promise.all([call(source,'select public.create_account_transfer_code() as value'),call(t,'select public.request_account_transfer($1) as value',[generated.value.code])])
 check('regeneration and redemption share profile-before-code lock order', results.filter(r=>r.ok).length===1 && results.filter(r=>r.code==='22023').length===1, results.map(r=>({ok:r.ok,code:r.code})))
 const existing = await q('select id from public.account_transfer_requests where source_id=$1',[source])
 let requestId = existing[0]?.id
 if (!requestId) {
  generated=results.find(r=>r.ok)
  const redeemed=await call(t,'select public.request_account_transfer($1) as value',[generated.value.code])
  requestId=redeemed.value
 }
 await q("insert into public.logged_hours(member_id,type,date,hours,description,status) values($1,'build',current_date,2,'Fictional concurrent transfer','verified')",[source])
 const approvals=await Promise.all([call('00000000-0000-0000-0000-0000000000a1','select public.admin_decide_account_transfer($1,true) as value',[requestId]),call('00000000-0000-0000-0000-0000000000a1','select public.admin_decide_account_transfer($1,true) as value',[requestId])])
 const [{n:audits}]=await q("select count(*)::int as n from public.member_admin_log where member_id=$1 and action='merge_from'",[source])
 check('two admin approvals merge once', approvals.filter(r=>r.ok).length===1 && approvals.filter(r=>r.code==='22023').length===1 && audits===1,{ok:approvals.map(r=>r.ok),codes:approvals.map(r=>r.code),audits})
 const expired=await expiryWhileWaiting()
 check('expiry is rechecked against wall time after a lock wait',expired==='22023',expired)
 if(!redeemDefinition.includes('c.expires_at<=clock_timestamp()')) throw new Error('Missing expiry mutation anchor')
 await q(redeemDefinition.replace('c.expires_at<=clock_timestamp()','c.expires_at<=now()'))
 const staleClock=await expiryWhileWaiting()
 check('transaction-start expiry mutation detected',staleClock==='accepted',staleClock)
 await q(redeemDefinition)
 console.log(`0050 concurrency: ${passed}/12 passed; no deadlocks or duplicate merges`)
} finally { await q(redeemDefinition); await db.end() }
