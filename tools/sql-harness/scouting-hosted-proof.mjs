#!/usr/bin/env node
// Emit a rollback-only proof for an EMPTY, ISOLATED hosted staging branch.
// Never execute on production. This does not test GoTrue or an HTTP JWT.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
if (!process.argv.includes('--emit')) throw new Error('Use --emit to review the rollback SQL; execute only in an empty staging branch')
const root=resolve(import.meta.dirname,'../..')
const source=readFileSync(resolve(root,'supabase/migrations/0022_scouting_rls_test.sql'),'utf8')
const actors=[['a1','admin'],['b1','mentor'],['c1','student'],['c2','student'],['d1','parent']]
const values=actors.map(([s,role])=>`('00000000-0000-0000-0000-0000000000${s}','${role}.${s}@scouting.invalid','{}'::jsonb)`).join(',')
const roles=actors.map(([s,role])=>`('00000000-0000-0000-0000-0000000000${s}','${role}')`).join(',')
const tests=source.replace(/^begin;$/m,'').replace(/^rollback;$/m,'')
const query=`begin;
do $empty$ begin
 if exists(select 1 from auth.users) or exists(select 1 from public.profiles) or exists(select 1 from public.scouting_records) then
  raise exception 'This fixture proof requires an empty isolated staging branch. Production is refused.';
 end if;
end $empty$;
insert into public.connector_settings(id,enabled) values(true,false) on conflict(id) do nothing;
insert into auth.users(id,email,raw_user_meta_data) values ${values};
insert into public.profiles(id,full_name,approved,status) select id,'Scouting SQL fixture',true,'active' from auth.users on conflict(id) do update set approved=true,status='active';
insert into public.member_roles(member_id,role) values ${roles} on conflict do nothing;
${tests}
do $verify$ declare bad jsonb; checks integer; begin
 select count(*),jsonb_agg(jsonb_build_object('n',t.n,'check',t.check_name,'result',t.result,'detail',t.detail)) filter(where t.result<>'PASS') into checks,bad from t0022_results t;
 if checks<>72 or bad is not null then raise exception using message='Staging scouting proof failed: '||coalesce(bad::text,checks::text); end if;
end $verify$;
rollback;
select jsonb_build_object('asserted_passed_checks',72,'fixture_users_after_rollback',(select count(*) from auth.users),'fixture_profiles_after_rollback',(select count(*) from public.profiles),'scouting_rows_after_rollback',(select count(*) from public.scouting_records),'scope','Hosted PostgreSQL RLS, SQL-injected request claims; not hosted Auth/API acceptance') as staging_proof;`
process.stdout.write(JSON.stringify({query,scope:'Isolated empty staging only; every fixture and role change rolls back'}))
