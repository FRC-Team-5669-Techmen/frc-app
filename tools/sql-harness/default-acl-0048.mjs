#!/usr/bin/env node
// Reproduce the live public-schema default grants, inside disposable rollback
// transactions. CREATE OR REPLACE preserves those grants until explicit revoke.
import { readFileSync } from 'node:fs'
import pg from 'pg'
if (!(process.env.PGHOST || '').startsWith('/tmp/')) throw new Error('Requires the disposable SQL harness')
const source = readFileSync('supabase/migrations/0048_frc_feedback.sql', 'utf8')
const functions = [...source.matchAll(/^revoke execute on function (public\.[^\n]+?) from /gm)].map(m => m[1])
if (functions.length !== 14) throw new Error(`Expected 14 managed functions, got ${functions.length}`)
const rpcSet = ['public.set_session_paused(uuid,boolean)', 'public.staff_standing_evidence(uuid)', 'public.readiness_summary()']
const db = new pg.Client()
await db.connect()
async function audit(sql) {
  await db.query('begin')
  try {
    await db.query('grant all on public.standing_record_evidence to anon, authenticated, service_role')
    await db.query(`grant execute on function ${functions.join(',')} to anon, authenticated, service_role`)
    const before = (await db.query(`select bool_and(has_function_privilege('service_role',sig,'execute')) as funcs,
      has_table_privilege('service_role','public.standing_record_evidence','select') as tbl
      from unnest($1::text[]) sig`, [functions])).rows[0]
    await db.query(sql)
    const rows = (await db.query(`select
      (select bool_and(not has_function_privilege('service_role',sig,'execute')) from unnest($1::text[]) sig) as service_closed,
      not exists(select 1 from pg_class c, lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        where c.oid='public.standing_record_evidence'::regclass and (a.grantee=0 or a.grantee in
          (select oid from pg_roles where rolname in('anon','authenticated','service_role')))) as table_closed,
      (select bool_and(not has_function_privilege('anon',sig,'execute')) from unnest($1::text[]) sig) as anon_closed,
      (select bool_and(has_function_privilege('authenticated',sig,'execute')=(sig=any($2::text[]))) from unnest($1::text[]) sig) as auth_exact`, [functions, rpcSet])).rows[0]
    return [
      [1, 'live default grant replay has positive controls', before.funcs && before.tbl],
      [2, 'service_role cannot execute any managed function', rows.service_closed],
      [3, 'snapshot table has no client privilege, including future privilege types', rows.table_closed],
      [4, 'anon cannot execute any managed function', rows.anon_closed],
      [5, 'authenticated has exactly the three public RPCs', rows.auth_exact],
    ]
  } finally { await db.query('rollback') }
}
try {
  const rows = await audit(source)
  for (const [n,name,ok] of rows) process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${n} ${name}\n`)
  if (rows.some(([, ,ok]) => !ok)) process.exitCode=1
  else {
    const bad = await audit(source.replace(/, service_role/g, ''))
    const fail = bad.filter(([, ,ok]) => !ok).map(([n]) => n)
    const caught = fail.includes(2) && fail.includes(3) && bad[0][2]
    process.stdout.write(`${caught ? 'PASS' : 'FAIL'} missing-service-revoke mutant: named failures ${fail.join(',')}\n`)
    process.stdout.write(`default ACL 0048: ${caught ? '6/6' : '5/6'} passed; ${caught ? '1/1' : '0/1'} mutation caught\n`)
    if (!caught) process.exitCode=1
  }
} finally { await db.end() }
