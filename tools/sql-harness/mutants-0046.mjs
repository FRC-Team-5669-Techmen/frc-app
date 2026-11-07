#!/usr/bin/env node
// Permissive mutations of each changed write/execute boundary. Only a named
// FAIL counts as caught, never a SQL error or an empty result set. Original
// text is kept in memory; the working tree is never rewritten.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const original = readFileSync('supabase/migrations/0046_signout_session_boundary.sql', 'utf8')
const test = 'supabase/migrations/0046_signout_session_boundary_rls_test.sql'
const dir = mkdtempSync(path.join(tmpdir(), 'mut0046-'))
function paste(sql) {
  const file = path.join(dir, 'mutation.sql'); writeFileSync(file, sql)
  execFileSync(process.env.PSQL || 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: ['ignore', 'pipe', 'pipe'] })
}
function run() {
  const r = spawnSync(process.env.PSQL || 'psql', ['-X', '-A', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-f', test], { encoding: 'utf8' })
  const rows = (r.stdout || '').split('\n').map(l => l.split('\t')).filter(c => /^\d+$/.test(c[0]) && c[0] !== '999' && ['PASS', 'FAIL'].includes(c[2]))
  if (r.status !== 0 || rows.length !== 24) throw new Error(`Invalid test run: ${r.stderr}; ${rows.length} checks`)
  return new Set(rows.filter(c => c[2] === 'FAIL').map(c => Number(c[0])))
}
const mutants = [
  ['anon internal editor execute', 'revoke all on function public._apply_event_edit(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;', 'revoke all on function public._apply_event_edit(uuid,timestamptz,text,uuid,text) from public, anon, authenticated; grant execute on function public._apply_event_edit(uuid,timestamptz,text,uuid,text) to anon;', 23],
  ['member internal editor execute', 'revoke all on function public._apply_event_edit(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;', 'revoke all on function public._apply_event_edit(uuid,timestamptz,text,uuid,text) from public, anon, authenticated; grant execute on function public._apply_event_edit(uuid,timestamptz,text,uuid,text) to authenticated;', 23],
  ['student claims staff correction exemption', 'if public.is_staff() and coalesce(new.manual_entry,false) then', 'if coalesce(new.manual_entry,false) then', 22],
  ['duplicate IN allowed', "if not public.is_staff() and v_last.type='in' then", 'if false then', 3],
  ['direct build OUT allowed', "if v_last.type='in' and coalesce(v_last.category,'build')='volunteer' then", "if v_last.type='in' then", 2],
  ['self OUT note omitted', "if new.note is null or length(btrim(new.note)) not between 3 and 1000 then", 'if false then', 5],
  ['staff skip their own note', "if new.type <> 'out' then return new; end if;", "if new.type <> 'out' or public.is_staff() then return new; end if;", 7],
  ['any member switches', 'if v_uid is null or not public.is_staff() then', 'if v_uid is null then', 17],
  ['any member approves', 'if not public.can_approve_signouts() then', 'if false then', 10],
  ['any member bulk approves', "if not public.can_approve_signouts() then\n    raise exception 'Only a mentor or a permitted student can approve sign-outs' using errcode='42501';\n  end if;\n  for r", "if false then raise exception 'unused'; end if;\n  for r", 18],
  ['self approval allowed', 'if v_req.member_id=auth.uid() then', 'if false then', 14],
  ['request closes a newer IN', "if v_last.id is distinct from v_req.in_event_id or v_last.type is distinct from 'in' then", "if v_last.type is distinct from 'in' then", 13],
  ['anon switch grant', 'grant execute on function public.switch_to_fll(text,boolean,text) to authenticated;', 'grant execute on function public.switch_to_fll(text,boolean,text) to authenticated, anon;', 15],
  ['client trigger execute', 'revoke all on function public.attendance_events_self_out_guard() from public, anon, authenticated;', 'revoke all on function public.attendance_events_self_out_guard() from public, anon; grant execute on function public.attendance_events_self_out_guard() to authenticated;', 16],
  ['bulk count includes obsolete requests', "if v_req.status='approved' then n := n+1; end if;", 'n := n+1;', 19],
  ['anon bulk grant', 'grant execute on function public.approve_all_signouts() to authenticated;', 'grant execute on function public.approve_all_signouts() to authenticated, anon;', 20],
  ['anon approval grant', 'grant execute on function public.approve_signout(uuid) to authenticated;', 'grant execute on function public.approve_signout(uuid) to authenticated, anon;', 16],
]
let caught = 0
try {
  if (run().size) throw new Error('Baseline is not green')
  for (const [name, find, replacement, check] of mutants) {
    if (!original.includes(find)) throw new Error(`Missing mutation anchor: ${name}`)
    paste(original.replace(find, () => replacement))
    const fails = run(); const hit = fails.has(check)
    console.log(`${hit ? 'CAUGHT' : 'MISSED'} ${name}: failed ${[...fails].join(',')} (need ${check})`)
    if (hit) caught++
    paste(original)
    if (run().size) throw new Error(`Restore failed: ${name}`)
  }
} finally { paste(original); rmSync(dir, { recursive: true, force: true }) }
console.log(`mutants 0046: ${caught}/${mutants.length} caught`)
process.exitCode = caught === mutants.length ? 0 : 1
