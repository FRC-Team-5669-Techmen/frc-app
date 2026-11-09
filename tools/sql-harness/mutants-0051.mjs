// Named permissive mutations. No SQL error or partial run counts as detection.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const migration = 'supabase/migrations/0051_frc_operations.sql', test = 'supabase/migrations/0051_frc_operations_rls_test.sql'
const original = readFileSync(migration, 'utf8'), dir = mkdtempSync(path.join(tmpdir(), 'mut0051-'))
const psql = process.env.PSQL || 'psql'
function paste(sql) { const f = path.join(dir, 'mut.sql'); writeFileSync(f, sql); execFileSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', f], { stdio: ['ignore', 'pipe', 'pipe'] }) }
function run() {
 const r = spawnSync(psql, ['-X', '-A', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-f', test], { encoding: 'utf8' })
 const rows = (r.stdout || '').split('\n').map(l => l.split('\t')).filter(c => /^\d+$/.test(c[0]) && ['PASS', 'FAIL'].includes(c[2]))
 if (r.status !== 0 || rows.length !== 69) throw new Error(`Invalid mutation test run: ${rows.length} checks; ${r.stderr}`)
 return new Set(rows.filter(c => c[2] === 'FAIL').map(c => Number(c[0])))
}
function inside(fn, from, to) {
 const a = original.indexOf(`create or replace function public.${fn}(`), b = original.indexOf('$fn$;', a) + 5, body = original.slice(a, b)
 if (a < 0 || !body.includes(from)) throw new Error(`Missing mutation anchor ${fn}: ${from}`)
 return original.slice(0, a) + body.replace(from, () => to) + original.slice(b)
}
const mutants = [], add = (name, sql, checks) => mutants.push({ name, sql, checks: Array.isArray(checks) ? checks : [checks] })
for (const [fn, check] of [['staff_parent_service', 4], ['staff_save_parent_service', 1], ['staff_event_checkin', 22], ['staff_save_event_venue', 20], ['staff_set_event_geo_exempt', 24]]) add(`${fn} staff gate opened`, inside(fn, "auth.uid() is null or not public.is_staff()", 'false'), check)
for (const [fn, check] of [['mentor_rotation_data', 54], ['mentor_set_rotation_member', 50]]) add(`${fn} mentor gate opened`, inside(fn, 'not public._ops_mentor()', 'false'), check)
add('mentor gate admits student leads', inside('_ops_mentor', "public.has_role('mentor') or public.is_admin()", 'public.is_staff()'), [51, 55])
add('venue context membership opened', inside('my_event_checkin_venues', 'not public._role_board_member_ok()', 'false'), [201, 203, 205])
add('venue check-in membership opened', inside('event_venue_checkin', 'not public._role_board_member_ok()', 'false'), [202, 204, 206])
add('parent report event scope widened', inside('staff_parent_service', 'where p.event_id=p_event', 'where true'), 7)
add('parent write event scope widened', inside('staff_save_parent_service', 'id=p_parent and event_id=p_event', 'id=p_parent'), 9)
add('parent delete scope widened', inside('staff_save_parent_service', 'id=p_session and guardian_id=par returning id into sid', 'id=p_session returning id into sid'), 10)
add('overlapping service allowed', inside('staff_save_parent_service', 'if exists(select 1 from public.parent_service_sessions where guardian_id=par', 'if false and exists(select 1 from public.parent_service_sessions where guardian_id=par'), 8)
add('own exemption scope widened on read', inside('my_event_checkin_venues', 'and x.member_id=auth.uid()', ''), 27)
add('stored expiry ignored on read', inside('my_event_checkin_venues', 'and x.expires_at>now()', ''), 32)
add('event end ignored on read', inside('my_event_checkin_venues', 'and e.ends_at>now()', ''), 34)
add('event start ignored on read', inside('my_event_checkin_venues', 'and e.starts_at<=now()', ''), 36)
add('disabled venues read', inside('my_event_checkin_venues', "where v.enabled and e.kind='competition'", "where e.kind='competition'"), 42)
add('own exemption write scope widened', inside('event_venue_checkin', 'and x.member_id=auth.uid()', ''), 43)
add('stored expiry ignored on write', inside('event_venue_checkin', 'now()<least(x.expires_at,ending)', 'true'), 31)
add('event end ignored on write', inside('event_venue_checkin', 'and e.ends_at>now()', ''), 33)
add('event start ignored on write', inside('event_venue_checkin', 'and e.starts_at<=now()', ''), 35)
add('other event exemption accepted', inside('event_venue_checkin', 'x.event_id=p_event and x.member_id=auth.uid()', 'x.member_id=auth.uid()'), 40)
add('outside venue allowed', inside('event_venue_checkin', 'if distance_m>150 then', 'if false then'), 38)
add('coarse fix allowed', inside('event_venue_checkin', 'not (p_accuracy between 0 and 100)', 'false'), 39)
add('disabled venue write opened', inside('event_venue_checkin', 'where event_id=p_event and enabled', 'where event_id=p_event'), 41)
add('pending and inactive rotation candidates admitted', inside('mentor_rotation_data', "where p.approved and p.status='active'", 'where true'), 58)
add('unverified logs enter hour evidence', inside('mentor_rotation_data', "and l.status='verified'", ''), 59)
for (const [i, t] of ['parent_service_people', 'parent_service_sessions', 'event_checkin_venues', 'event_geo_exemptions', 'role_rotation_members'].entries()) {
 for (const role of ['anon', 'authenticated', 'service_role']) add(`${t} ${role} direct grants`, original + `\ngrant all on public.${t} to ${role};`, 301 + i)
 add(`${t} RLS disabled`, original + `\nalter table public.${t} disable row level security;`, 301 + i)
}
const signatures = ['staff_parent_service(uuid)', 'staff_save_parent_service(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid,boolean)', 'staff_event_checkin(uuid)', 'staff_save_event_venue(uuid,double precision,double precision,boolean)', 'staff_set_event_geo_exempt(uuid,uuid,boolean)', 'my_event_checkin_venues()', 'event_venue_checkin(uuid,double precision,double precision,double precision)', 'mentor_set_rotation_member(uuid,boolean,boolean)', 'mentor_rotation_data()']
for (const [i, sig] of signatures.entries()) for (const role of ['anon', 'service_role']) add(`${sig} ${role} execute`, original + `\ngrant execute on function public.${sig} to ${role};`, 401 + i)
for (const [i, sig] of ['_ops_mentor()', '_merge_member_rules()'].entries()) for (const role of ['anon', 'authenticated', 'service_role']) add(`${sig} internal ${role} execute`, original + `\ngrant execute on function public.${sig} to ${role};`, 501 + i)
let caught = 0
try {
 paste(original); if (run().size) throw new Error('Baseline is not green')
 for (const m of mutants) {
  paste(m.sql); const failed = run()
  if (!m.checks.every(n => failed.has(n))) throw new Error(`SURVIVED ${m.name}: expected ${m.checks}, got ${[...failed]}`)
  caught++; paste(original); if (run().size) throw new Error(`Restore failed after ${m.name}`)
 }
 if (readFileSync(migration, 'utf8') !== original) throw new Error('Migration source changed during mutation run')
 console.log(`0051 mutations: ${caught}/${mutants.length} caught by named assertions; restored baseline 69/69; source byte-identical`)
} catch (e) { console.error(e.message); process.exitCode = 1 } finally { paste(original); rmSync(dir, { recursive: true, force: true }) }
