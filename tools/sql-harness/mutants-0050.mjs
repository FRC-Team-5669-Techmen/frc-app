#!/usr/bin/env node
// Every new RPC/table boundary, including named anon and service-role revokes.
// Only a named FAIL counts. SQL crashes and incomplete output are invalid.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const original = readFileSync('supabase/migrations/0050_roster_accounts.sql', 'utf8')
const test = 'supabase/migrations/0050_roster_accounts_rls_test.sql'
const dir = mkdtempSync(path.join(tmpdir(), 'mut0050-'))
function paste(sql) {
  const file = path.join(dir, 'mut.sql'); writeFileSync(file, sql)
  try { execFileSync(process.env.PSQL || 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch(error) { writeFileSync('work/mutation-error49.log', String(error.stderr)); throw new Error(String(error.stderr).slice(-1500)) }
}
function run() {
  const r = spawnSync(process.env.PSQL || 'psql', ['-X', '-A', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-f', test], { encoding: 'utf8' })
  const rows = (r.stdout || '').split('\n').map(l => l.split('\t')).filter(c => /^\d+$/.test(c[0]) && ['PASS', 'FAIL'].includes(c[2]))
  if (r.status !== 0 || rows.length !== 126) throw new Error(`Invalid test run: ${r.stderr}; ${rows.length} checks`)
  return new Set(rows.filter(c => c[2] === 'FAIL').map(c => Number(c[0])))
}
function inside(fn, from, to) {
  const start = original.indexOf(`create or replace function public.${fn}(`)
  const end = original.indexOf('$fn$;', start) + 5
  const body = original.slice(start, end)
  if (start < 0 || !body.includes(from)) throw new Error(`Missing mutation anchor: ${fn}: ${from}`)
  return original.slice(0, start) + body.replace(from, () => to) + original.slice(end)
}
// For wrappers with an independently admin-gated inner call, neutralize that
// call only in the outer-guard mutant so it cannot mask the read/write probe.
const mutants = []
const add = (name, sql, checks) => mutants.push({ name, sql, checks: Array.isArray(checks) ? checks : [checks] })
const adminGuard = "if auth.uid() is null or not public.is_admin() then"
for (const [fn, check] of [['admin_preview_folding',4],['admin_set_folding',2],['admin_account_review',20],['admin_reclassify_account',21],['admin_approve_member',24],['admin_decide_account_transfer',38]]) add(`${fn}: admin boundary opened`, inside(fn, adminGuard, 'if false then').replace(fn === 'admin_preview_folding' ? '    perform public._standing_evaluate_guarded();' : 'NO_PREVIEW_ANCHOR', '    perform 0;'), check)
for (const [fn, check] of [['staff_participation',5],['staff_access_classifications',44]]) add(`${fn}: staff boundary opened`, inside(fn, "if auth.uid() is null or not public.is_staff() then", 'if false then'), check)
add('mentor override opened to students', inside('mentor_set_participation', "if auth.uid() is null or not (public.has_role('mentor') or public.is_admin()) then", 'if false then'), 6)
add('restore may act on active members', inside('mentor_set_participation', "if p_restore and v_status<>'folded' then", 'if false then'), 66)
add('evaluation open to students', inside('standing_evaluate', 'if auth.uid() is not null and not public.is_admin() then', 'if false then').replace('n := public._standing_evaluate_guarded();','n := 0;'), 53)
add('transfer read scope widened', inside('account_transfers', 'where r.source_id=auth.uid() or r.target_id=auth.uid() or public.is_admin()', 'where true'), [35,36])
add('own classification read scope widened', inside('my_account_classification', 'where c.member_id=auth.uid()', 'where true'), 45)
add('school may issue source code', inside('create_account_transfer_code', "if em is null or split_part(em,'@',2)='boscotech.edu' then", 'if false then'), 27)
add('personal account may redeem', inside('request_account_transfer', "if em is null or split_part(em,'@',2)<>'boscotech.edu' then", 'if false then'), 29)
add('code expiry ignored', inside('request_account_transfer', 'or c.expires_at<=clock_timestamp()', ''), 30)
add('single-use check ignored', inside('request_account_transfer', 'or c.used_at is not null', ''), 32)
add('code regeneration keeps previous token usable', inside('create_account_transfer_code', 'update public.account_transfer_codes set used_at=now() where source_id=auth.uid() and used_at is null;', ''), 46)
add('completed source may issue more codes', inside('create_account_transfer_code', "if exists(select 1 from public.account_transfer_requests where source_id=auth.uid() and status in ('pending','approved')) then", 'if false then'), 54)
add('off setting ignored', inside('standing_evaluate', 'if (select enabled from public.participation_settings where id) then', 'if true then'), 9)
add('mentor override ignored by candidate list', inside('_fold_candidates', 'and not exists (select 1 from public.member_participation p where p.member_id=r.member_id and p.keep_active)', ''), 11)
add('other removal reasons folded without participation failure', inside('_fold_candidates', "and (r.reason like 'Short week on probation, week of %'\n      or r.reason like 'Missed a meeting on probation, week of %'\n      or r.reason like 'Under 80 percent of meetings again, on probation: %')", ''), 55)
add('held run still folds prior candidates', inside('standing_evaluate', "if current_setting('techmen.standing_held',true)='true' then return n; end if;", ''), 52)
add('folding unapproves account', inside('standing_evaluate', "set status='folded' where", "set status='folded',approved=false where"), 13)
add('approval ignores changed email identities', inside('admin_decide_account_transfer', "if coalesce((select split_part(lower(email),'@',2) from auth.users where id=r.source_id),'') in ('','boscotech.edu')\n      or (select split_part(lower(email),'@',2) from auth.users where id=r.target_id) is distinct from 'boscotech.edu' then", 'if false then'), [68,69])
add('transfer approval skips audited merge', inside('admin_decide_account_transfer', "v_result:=public.admin_merge_member(r.source_id,r.target_id,'Verified summer-account transfer '||r.id);", "v_result:='{}'::jsonb;"), [39,40])
add('claim defaults new personal email to student', inside('claim_profile', "then 'student' else 'parent' end", "then 'student' else 'student' end"), 16)
add('claim reclassifies legacy accounts', inside('claim_profile', 'if not exists(select 1 from public.account_classifications where member_id=auth.uid()) then', 'if true then delete from public.account_classifications where member_id=auth.uid(); delete from public.member_roles where member_id=auth.uid();'), 18)
add('transfer loses the mentor override', original.replace("('member_participation', 'member_id', 'move')", "('member_participation', 'member_id', 'keep')"), 67)
// Exact ACLs: five tables, every role; fifteen client RPCs and three helpers.
const tables = ['participation_settings','member_participation','account_classifications','account_transfer_codes','account_transfer_requests']
for (const [i, table] of tables.entries()) for (const role of ['anon','authenticated','service_role']) add(`${table}: ${role} direct read/write opened`, original + `\ngrant all on public.${table} to ${role};\n`, 201+i)
const functions = ['standing_evaluate()','admin_preview_folding()','admin_set_folding(boolean)','staff_participation()','mentor_set_participation(uuid,boolean,boolean)','claim_profile()','my_account_classification()','admin_account_review()','admin_reclassify_account(uuid,text)','admin_approve_member(uuid)','create_account_transfer_code()','request_account_transfer(text)','account_transfers()','admin_decide_account_transfer(uuid,boolean)','staff_access_classifications()','_battery_member_ok()','_driver_member_ok()','_hp_member_ok()','_role_board_member_ok()','set_session_paused(uuid,boolean)','tour_complete_core(text,integer)','tour_completion_overview(integer)','get_calendar_token()','rotate_calendar_token()']
for (const [i, sig] of functions.entries()) for (const role of ['anon','service_role']) add(`${sig}: ${role} execute opened`, original + `\ngrant execute on function public.${sig} to ${role};\n`, 206+i)
for (const [i, sig] of ['public._fold_candidates()','public._standing_evaluate_guarded()','public._merge_member_rules()','public._driver_target_ok(uuid)','public._hp_target_ok(uuid)','scouting_private.can_access(uuid)','public._hub_roster_student(uuid)','public.driver_docs_flag_leavers()'].entries()) for (const role of ['anon','authenticated','service_role']) add(`${sig}: internal ${role} execute opened`, original + `\ngrant execute on function ${sig} to ${role};\n`, 230+i)
// Widen each changed status gate to inactive, preserving other role guards.
const statusFunctions = [
 ['public._battery_member_ok()',102], ['public._driver_member_ok()',104], ['public._hp_member_ok()',106],
 ['public._role_board_member_ok()',108], ['scouting_private.can_access(uuid)',110],
 ['public._driver_target_ok(uuid)',112], ['public._hp_target_ok(uuid)',114], ['public._hub_roster_student(uuid)',116],
 ['public.set_session_paused(uuid,boolean)',60],
 ['public.get_calendar_token()',72], ['public.rotate_calendar_token()',73],
]
for (const [sig, check] of statusFunctions) add(`${sig}: inactive access opened`, original + `
 do $mut$ begin execute replace(pg_get_functiondef('${sig}'::regprocedure), '(''active'',''folded'')', '(''active'',''folded'',''inactive'')'); end $mut$;`, check)
add('folded driver documents treated as leavers', original + `
 do $mut$ begin execute replace(pg_get_functiondef('public.driver_docs_flag_leavers()'::regprocedure), 'not in (''active'',''folded'')', '<> ''active'''); end $mut$;`, 61)
add('training row visibility widened to inactive', original + `
 alter policy "tour completion read" on public.tour_completions using(member_id=auth.uid() or public.is_staff());`, 58)
let savedDefinitions = ''
function restore() { paste(savedDefinitions + '\n' + original) }
let caught = 0
try {
 paste(original)
 savedDefinitions = execFileSync(process.env.PSQL || 'psql', ['-X','-At','-v','ON_ERROR_STOP=1','-c', `select pg_get_functiondef(sig::regprocedure)||';' from unnest(array[${[...statusFunctions.map(([sig]) => sig),'public.driver_docs_flag_leavers()'].map(sig => "'"+sig+"'").join(',')}]) sig`], { encoding: 'utf8' })
 if (run().size) throw new Error('Baseline is not green')
 for (const m of mutants) {
  paste(m.sql)
  const failed = run()
  if (!m.checks.every(n => failed.has(n))) throw new Error(`SURVIVED ${m.name}: expected ${m.checks}, got ${[...failed]}`)
  caught++
  restore()
 }
 if (run().size) throw new Error('Restored baseline is not green')
 console.log(`0050 mutations: ${caught}/${mutants.length} caught by named assertions; restored baseline 126/126`)
} catch (error) { console.error('0050 mutation error:', error.message); process.exitCode=1 } finally { restore(); rmSync(dir,{ recursive:true,force:true }) }
