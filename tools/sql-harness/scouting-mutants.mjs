/** Run in the existing native SQL harness with --node, or imported by the PGlite runner.
 * Widens boundaries, runs the SAME rollback-only tests, restores captured definitions.
 * This never edits migration files and never connects unless explicit harness env exists.
 */
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve,dirname} from 'node:path'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
export async function runScoutingMutants(db, exec) {
 const test=readFileSync(resolve(root,'supabase/migrations/0022_scouting_rls_test.sql'),'utf8')
 const rows=async()=> (await exec(test)).flatMap(r=>r.rows??[]).filter(r=>r.result)
 const baseline=await rows()
 if(!baseline.length||baseline.some(r=>r.result!=='PASS'))throw new Error('Mutation baseline not green')
 const one=async(q)=>(await db.query(q)).rows[0]
 const save=(await one("select pg_get_functiondef('scouting_private.save(uuid,uuid,text,integer,text,jsonb,integer,uuid,uuid)'::regprocedure) as definition")).definition
 const access=(await one("select pg_get_functiondef('scouting_private.can_access(uuid)'::regprocedure) as definition")).definition
 const index=(await one("select pg_get_indexdef('public.scouting_one_observation'::regclass) as definition")).definition
 const validation=(await one("select pg_get_functiondef('scouting_private.validate(text,integer,text,jsonb,uuid)'::regprocedure) as definition")).definition
 const roster=(await one("select pg_get_functiondef('scouting_private.roster(uuid)'::regprocedure) as definition")).definition
 const mutants=[
  ['reply event boundary widened',validation.replace("r.kind='message' and r.event_id=p_event and r.team_number=p_team", "r.kind='message' and r.team_number=p_team"),validation,[54]],
  ['reply team boundary widened',validation.replace("r.kind='message' and r.event_id=p_event and r.team_number=p_team", "r.kind='message' and r.event_id=p_event"),validation,[55]],
  ['assignment roster manager gate removed',roster.replace('if not scouting_private.can_manage(p_event) then','if false then'),roster,[60,62]],
  ['assignment roster eligibility widened',roster.replace('where scouting_private.can_access(p.id)','where true'),roster,[59]],
  ['record read widened','alter policy scouting_records_read on public.scouting_records using (true)','alter policy scouting_records_read on public.scouting_records using ((select public.scouting_can_access()))',[3]],
  ['revision read widened','alter policy scouting_revisions_read on public.scouting_revisions using (true)','alter policy scouting_revisions_read on public.scouting_revisions using ((select public.scouting_can_access()))',[47]],
  ['delivery read widened','alter policy scouting_delivery_read on public.scouting_delivery using (true)','alter policy scouting_delivery_read on public.scouting_delivery using ((select public.scouting_can_access()))',[49]],
  ['parent gate removed',access.replace("and (not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')", "and (true or not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')"),access,[45]],
  ['approval gate removed',access.replace('and p.approved',''),access,[27]],
  ['active gate removed',access.replace("and p.status = 'active'",''),access,[46]],
  ['version check removed',save.replace('if oldrow.version<>p_expected_version then','if false then'),save,[12]],
  ['actor binding removed',save.replace('p_actor is distinct from uid or ',''),save,[44]],
  ['ownership guard removed',save.replace("if oldrow.member_id<>uid and (not manager or p_kind in ('observation','pick_list')) then",'if false then'),save,[13,16,29]],
  ['duplicate operation body accepted',save.replace('if op.request<>req then','if false then'),save,[10]],
  ['duplicate logical observations accepted','drop index public.scouting_one_observation',index,[18]],
 ]
 let caught=0
 for(const [name,change,restore,expected] of mutants){
  if(change===restore)throw new Error('Mutant did not change definition: '+name)
  let result
  try{await exec(change);result=await rows()}finally{await exec(restore)}
  const failed=new Set(result.filter(r=>r.result==='FAIL').map(r=>r.n))
  const ok=expected.every(n=>failed.has(n));if(ok)caught++
  console.log(`scouting mutant ${ok?'CAUGHT':'MISSED'}: ${name}; failed ${[...failed].join(',')}`)
 }
 console.log(`scouting mutants: ${caught}/${mutants.length} caught`)
 if(caught!==mutants.length)throw new Error('A widened boundary escaped its tests')
 return caught
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.env.PGHOST?.startsWith('/tmp/frc-sqlh-'))throw new Error('Use through the disposable SQL harness only')
 const {Client}=await import('pg');const db=new Client();await db.connect()
 try{await runScoutingMutants(db,async q=>{const r=await db.query(q);return Array.isArray(r)?r:[r]})}finally{await db.end()}
}
