#!/usr/bin/env node
// Disposable harness only. Mutations run in rollback transactions; source bytes
// are never edited. Require named FAIL rows, no SQL errors, and green restoration.
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
const dir = 'supabase/migrations';
const name = readdirSync(dir).find(n => /^\d{4}_security_recheck\.sql$/.test(n));
if (!process.env.PGHOST?.startsWith('/tmp/frc-sqlh-')) throw new Error('Disposable SQL harness required');
const file = path.join(dir,name), testFile = file.replace('.sql','_rls_test.sql');
const original = readFileSync(file), tests = readFileSync(testFile);
const testText = tests.toString().replace(/^begin;$/m,'');
const tmp = mkdtempSync(path.join(tmpdir(),'security-mutations-'));
const psql = process.env.PSQL || 'psql';
function run(sql='') {
 const f=path.join(tmp,'test.sql'); writeFileSync(f,`begin;\n${sql}\n${testText}`);
 const r=spawnSync(psql,['-X','-q','-A','-F','\t','-v','ON_ERROR_STOP=1','-f',f],{encoding:'utf8'});
 const rows=r.stdout.split('\n').map(l=>l.split('\t')).filter(c=>/^\d+$/.test(c[0]) && /^(PASS|FAIL)$/.test(c[2]));
 if(r.status!==0 || rows.length!==26) throw new Error(`Mutation run incomplete: ${r.stderr.slice(-800)}`);
 return rows.filter(c=>c[2]==='FAIL').map(c=>Number(c[0]));
}
function green(){if(run().length)throw new Error('Restored database not green');}
const src=original.toString();
const mutations=[
 ['server time',src.replace('new.event_time := now();','new.event_time := new.event_time;'),3],
 ['verification stamp',src.replace('coalesce(new.verified,false)','false'),4],
 ['manual stamp',src.replace('coalesce(new.manual_entry,false)','false'),6],
 ['staff actor',src.replace('new.overridden_by is not null','false'),5],
 ['self category',src.replace("coalesce(new.category,'build') not in ('build','volunteer')",'false'),7],
 ['profile SELECT table grant','grant select on public.profiles to authenticated;',15],
 ['profile INSERT token grant','grant insert(calendar_token) on public.profiles to authenticated;',18],
 ['profile UPDATE token grant','grant update(calendar_token) on public.profiles to authenticated;',17],
 ['anon profile column','grant select(full_name) on public.profiles to anon;',26],
 ['pending token read',src.replace("where id=auth.uid() and approved and status='active';","where id=auth.uid();"),21],
 ['inactive token rotation',src.replace("where id=auth.uid() and approved and status='active'\n",'where id=auth.uid()\n'),22],
 ...['get_calendar_token','rotate_calendar_token'].flatMap(n=>['public','anon','service_role'].map(role=>[`${n} ${role} grant`,`grant execute on function public.${n}() to ${role};`,23])),
];
const internal=execFileSync(psql,['-X','-Atc',"select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.prorettype='trigger'::regtype or p.proname in ('auto_close_open_checkins','invoke_cron_notify','notify_schedule_change','invoke_discord_calendar','_apply_event_edit')) order by 1"],{encoding:'utf8'}).trim().split('\n');
for(const sig of internal) for(const role of ['anon','authenticated','service_role']) mutations.push([`${sig} ${role} grant`,`grant execute on function ${sig} to ${role};`,sig.startsWith('_apply_event_edit') ? 1 :12]);
let count=0;
try {
 green();
 for(const [label,sql,want] of mutations.filter(m=>m[2]!==null)) {
  if(sql===src)throw new Error(`Mutation anchor missing: ${label}`);
  const fails=run(sql);
  if(!fails.includes(want))throw new Error(`MISSED ${label}: expected ${want}, got ${fails}`);
  count++; console.log(`CAUGHT ${label}: check ${want}`); green();
 }
 if(!readFileSync(file).equals(original)||!readFileSync(testFile).equals(tests))throw new Error('Source bytes changed');
 console.log(`security recheck mutations: ${count}/${count} caught; rollback restored green; source byte-identical`);
} finally {rmSync(tmp,{recursive:true,force:true});}
