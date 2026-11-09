// Replay named Supabase grants before reapplying 0051, and prove that omitting
// either named revoke is observable. Roll back every catalog change.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const source = readFileSync('supabase/migrations/0051_frc_operations.sql', 'utf8')
const signatures = ['staff_parent_service(uuid)', 'staff_save_parent_service(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid,boolean)', 'staff_event_checkin(uuid)', 'staff_save_event_venue(uuid,double precision,double precision,boolean)', 'staff_set_event_geo_exempt(uuid,uuid,boolean)', 'my_event_checkin_venues()', 'event_venue_checkin(uuid,double precision,double precision,double precision)', 'mentor_set_rotation_member(uuid,boolean,boolean)', 'mentor_rotation_data()', '_ops_mentor()', '_merge_member_rules()']
const tables = ['parent_service_people', 'parent_service_sessions', 'event_checkin_venues', 'event_geo_exemptions', 'role_rotation_members']
function run(role, omit) {
 const grant = signatures.map(sig => `grant execute on function public.${sig} to ${role};`).concat(tables.map(t => `grant all on public.${t} to ${role};`)).join('\n')
 const sql = 'begin;\n' + grant + '\n' + (omit ? source.replaceAll(`,${role}`, '') : source) + `\nselect (select count(*) from unnest(array[${signatures.map(s => `'public.${s}'`).join(',')}]) sig where has_function_privilege('${role}',sig,'execute')) + (select count(*) from unnest(array[${tables.map(t => `'public.${t}'`).join(',')}]) tbl where has_table_privilege('${role}',tbl,'SELECT'));\nrollback;`
 const r = spawnSync(process.env.PSQL || 'psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' })
 if (r.status !== 0) throw new Error(r.stderr)
 const values = r.stdout.trim().split('\n').filter(s => /^\d+$/.test(s))
 if (values.length !== 1) throw new Error('Invalid ACL output: ' + r.stdout)
 return Number(values[0])
}
for (const role of ['anon', 'service_role']) {
 if (run(role, false) !== 0) throw new Error(`${role}: named grants remain`)
 if (run(role, true) !== 16) throw new Error(`${role}: omitted-revoke mutation survived`)
}
console.log('0051 default ACL replay: 32/32 named table/function grants closed; 2/2 omitted-revoke controls caught')
