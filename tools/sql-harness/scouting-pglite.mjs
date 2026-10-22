/** Optional userland PostgreSQL WASM runner for environments without PostgreSQL binaries.
 * Install @electric-sql/pglite separately; set PGLITE_MODULE to its dist/index.js.
 * Uses the SAME SQL files, Supabase stand-ins and rollback-only RLS test.
 * This is PostgreSQL in WASM, not PostgreSQL 16 server, PostgREST or real Supabase.
 * No multiconnection race proof is possible here. No production credentials.
 */
import {readFileSync,readdirSync} from 'node:fs'
import {resolve,dirname,join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const modulePath=process.env.PGLITE_MODULE
if(!modulePath) throw new Error('Set PGLITE_MODULE to a separately installed @electric-sql/pglite/dist/index.js')
const {PGlite}=await import(pathToFileURL(modulePath))
const {pgcrypto}=await import(pathToFileURL(join(dirname(modulePath),'contrib/pgcrypto.js')))
const db=new PGlite({extensions:{pgcrypto}})
console.log((await db.query('select version()')).rows[0].version)
const read=p=>readFileSync(join(root,p),'utf8').replace(/^\s*create\s+extension\s+if\s+not\s+exists\s+(?:pg_cron|pg_net)\b[^;]*;/gmi,'-- network/cron extension stubbed by harness')
await db.exec(read('tools/sql-harness/stubs.sql'))
let pending=['platform_migration.sql',...readdirSync(join(root,'supabase')).filter(p=>p.endsWith('.sql')&&!p.endsWith('_rls_test.sql')).sort().map(p=>'supabase/'+p),'sql/forgotten_checkout.sql']
while(pending.length){const next=[];const errors=[];for(const p of pending){try{await db.exec('begin;'+read(p)+';commit;')}catch(e){await db.exec('rollback');next.push(p);errors.push(p+': '+e.message)}}if(next.length===pending.length)throw new Error(errors.join('\n'));pending=next}
await db.exec(read('tools/sql-harness/seed.sql'))
for(const p of readdirSync(join(root,'supabase/migrations')).filter(p=>/^\d{4}_.*\.sql$/.test(p)&&!p.endsWith('_rls_test.sql')).sort()){
 for(let i=0;i<2;i++) try{await db.exec(read('supabase/migrations/'+p))}catch(e){console.error('FAIL migration',p,e.message,e.position);throw new Error(e.message+' '+(e.where??''))}
 console.log('Applied twice:',p)
}
const test=read('supabase/migrations/0022_scouting_rls_test.sql')
let results;try{results=await db.exec(test)}catch(e){console.error(e.message,e.where,e.internalQuery);await db.close();process.exit(1)}
const rows=results.flatMap(r=>r.rows??[]).filter(r=>r.result)
const fail=rows.filter(r=>r.result!=='PASS')
console.log(JSON.stringify(fail,null,2))
console.log(`scouting PostgreSQL WASM: ${rows.length-fail.length}/${rows.length} checks passed`)
if(fail.length||!rows.length)process.exitCode=1
else if(process.argv.includes('--mutants')){const {runScoutingMutants}=await import('./scouting-mutants.mjs');await runScoutingMutants(db,q=>db.exec(q))}

if(process.argv.includes('--all-tests')) {
 const files=[...readdirSync(join(root,'supabase')).filter(p=>p.endsWith('_rls_test.sql')).sort().map(p=>'supabase/'+p),...readdirSync(join(root,'supabase/migrations')).filter(p=>p.endsWith('_rls_test.sql')).sort().map(p=>'supabase/migrations/'+p)]
 let count=0,passed=0
 for(const path of files){
  try {
   const result=await db.exec(read(path))
   const checks=result.flatMap(r=>r.rows??[]).filter(r=>r.result&&String(r.check??r.check_name??'').toLowerCase()!=='summary')
   const total=checks.length||1;const ok=checks.length?checks.filter(r=>r.result==='PASS').length:1
   count+=total;passed+=ok;console.log(`${path}: ${ok}/${total}`)
   if(ok!==total){process.exitCode=1;console.log(JSON.stringify(checks.filter(r=>r.result!=='PASS')))}
  }catch(e){count++;process.exitCode=1;console.log(`${path}: ERROR ${e.message}`);await db.exec('rollback;reset role')}
 }
 console.log(`all PostgreSQL WASM RLS: ${passed}/${count} across ${files.length} files`)
}
await db.close()
