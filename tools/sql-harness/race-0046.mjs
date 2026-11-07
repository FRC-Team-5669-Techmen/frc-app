#!/usr/bin/env node
// Disposable harness only. Real concurrent PostgreSQL sessions, then the same
// trials with the self-attendance lock removed as a permissive control.
import pg from 'pg'
const db = new pg.Client()
await db.connect()
if (!(process.env.PGHOST || '').startsWith('/tmp/')) throw new Error('Requires the disposable SQL harness')
const q = async (sql, args = []) => (await db.query(sql, args)).rows
const [{ id }] = await q('select gen_random_uuid()::text as id')
await q('insert into auth.users(id,email) values($1,$2)', [id, `${id}@example.invalid`])
await q('insert into public.profiles(id,approved) values($1,true) on conflict(id) do update set approved=true', [id])
await q("insert into public.member_roles(member_id,role) values($1,'student') on conflict do nothing", [id])
const [{ source }] = await q("select pg_get_functiondef('public.attendance_events_self_out_guard()'::regprocedure) as source")
async function attempt() {
  const c = new pg.Client(); await c.connect()
  try {
    await c.query('begin')
    await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })])
    await c.query('set local role authenticated')
    await c.query("insert into public.attendance_events(user_id,type,method,category) values($1,'in','nfc','build')", [id])
    await c.query('select pg_sleep(0.08)')
    await c.query('commit')
    return 'accepted'
  } catch (error) {
    await c.query('rollback')
    if (error.code !== '22023') throw error
    return 'refused'
  } finally { await c.end() }
}
async function trial() {
  await q('delete from public.attendance_events where user_id=$1', [id])
  const results = await Promise.all([attempt(), attempt()])
  const [{ n }] = await q('select count(*)::int as n from public.attendance_events where user_id=$1', [id])
  return { results, n }
}
// Approval and the staff FLL transition must take locks in the same order.
const [{ id: staff }] = await q('select gen_random_uuid()::text as id')
await q('insert into auth.users(id,email) values($1,$2)', [staff, `${staff}@example.invalid`])
await q('insert into public.profiles(id,approved) values($1,true) on conflict(id) do update set approved=true', [staff])
await q("insert into public.member_roles(member_id,role) values($1,'mentor') on conflict do nothing", [staff])
const [{ source: approvalSource }] = await q("select pg_get_functiondef('public.approve_signout(uuid)'::regprocedure) as source")
async function lockOrderTrial() {
  await q('delete from public.signout_requests where member_id=$1', [staff])
  await q('delete from public.attendance_events where user_id=$1', [staff])
  const [{ id: opened }] = await q("insert into public.attendance_events(user_id,type,method,category,event_time) values($1,'in','nfc','build',now()-interval '1 hour') returning id", [staff])
  const [{ id: request }] = await q("insert into public.signout_requests(member_id,in_event_id,note) values($1,$2,'Coached the gearbox test') returning id", [staff, opened])
  const a = new pg.Client(), b = new pg.Client(); await Promise.all([a.connect(), b.connect()])
  async function actor(c, actorId) {
    await c.query('begin')
    await c.query("set local statement_timeout='5s'")
    await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [actorId, JSON.stringify({ sub: actorId, role: 'authenticated' })])
    await c.query('set local role authenticated')
  }
  try {
    await Promise.all([actor(a, staff), actor(b, '00000000-0000-0000-0000-0000000000b1')])
    await a.query('select pg_advisory_xact_lock(hashtextextended($1,4614))', [staff])
    const [{ pid }] = (await b.query('select pg_backend_pid() as pid')).rows
    const approving = b.query('select (public.approve_signout($1)).status', [request])
      .then(async r => { await b.query('commit'); return r.rows[0].status })
      .catch(async e => { await b.query('rollback'); return e.code })
    // Ensure the approval is blocked on the held member lock, with a bounded
    // database barrier instead of relying on a scheduling delay.
    for (let i = 0; i < 100; i++) {
      const [{ blocked }] = await q("select wait_event_type='Lock' as blocked from pg_stat_activity where pid=$1", [pid])
      if (blocked) break
      if (i === 99) throw new Error('Approval did not reach the lock barrier')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    await a.query("select public.switch_to_fll('fll-room',true,'Coached the gearbox test')")
    await a.query('commit')
    const result = await approving
    return { result, count: Number((await q('select count(*) as n from public.attendance_events where user_id=$1', [staff]))[0].n) }
  } catch (error) { await a.query('rollback'); return { result: error.code, count: -1 } }
  finally { await Promise.all([a.end(), b.end()]) }
}
let passed = 0
try {
  for (let i = 0; i < 8; i++) {
    const r = await trial(); const ok = r.n === 1 && r.results.filter(x => x === 'accepted').length === 1
    console.log(`${ok ? 'PASS' : 'FAIL'} simultaneous check-in ${i + 1}: ${JSON.stringify(r)}`)
    if (ok) passed++
  }
  const ordered = await lockOrderTrial(); const orderOk = ordered.result === 'withdrawn' && ordered.count === 3
  console.log(`${orderOk ? 'PASS' : 'FAIL'} approval and staff switch lock order: ${JSON.stringify(ordered)}`)
  if (orderOk) passed++
  const rowFirst = 'select * into v_req from public.signout_requests where id=p_request;'
  if (!approvalSource.includes(rowFirst)) throw new Error('Approval lock-order mutation anchor missing')
  await q(approvalSource.replace(rowFirst, 'select * into v_req from public.signout_requests where id=p_request for update;'))
  const reversed = await lockOrderTrial(); const reversedCaught = reversed.result === '40P01'
  console.log(`${reversedCaught ? 'PASS' : 'FAIL'} reversed-lock-order mutant detected: ${JSON.stringify(reversed)}`)
  if (reversedCaught) passed++
  await q(approvalSource)
  const anchor = 'perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 4614));'
  if (!source.includes(anchor)) throw new Error('Lock mutation anchor missing')
  await q(source.replace(anchor, '-- permissive lock mutation'))
  const mutant = await trial(); const caught = mutant.n === 2 && mutant.results.every(x => x === 'accepted')
  console.log(`${caught ? 'PASS' : 'FAIL'} missing-lock mutant detected: ${JSON.stringify(mutant)}`)
  if (caught) passed++
} finally {
  await q(source)
  await q(approvalSource)
  await q('delete from public.attendance_events where user_id=$1', [id])
  await db.end()
}
console.log(`race 0046: ${passed}/11 passed`)
process.exitCode = passed === 11 ? 0 : 1
