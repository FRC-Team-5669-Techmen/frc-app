#!/usr/bin/env node
/** Built app -> real Supabase JS -> local PostgREST -> native PostgreSQL.
 * The parent SQL harness supplies a DISPOSABLE database. Auth identities/tokens
 * are synthetic; this is not hosted Supabase Auth, a phone, or an external API.
 * No real Discord messages can be sent: functions return not-configured here.
 * POSTGREST_BIN=/path/postgrest node tools/sql-harness/run.mjs --tests none --node tools/e2e/scouting-pwa.mjs
 */
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { randomUUID, createHmac } from 'node:crypto'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import { launch } from '../browser-verify/browser.mjs'
if (!process.env.PGHOST?.startsWith('/tmp/frc-sqlh-')) throw new Error('Use the disposable SQL harness only')
if (!process.env.POSTGREST_BIN) throw new Error('Set POSTGREST_BIN to an installed PostgREST executable')
const root=resolve(import.meta.dirname,'../..'), out=resolve(root,'artifacts/scouting-pwa')
mkdirSync(out,{recursive:true})
const db=new Client();await db.connect()
const port=Number(process.env.SCOUTING_PWA_PORT)||54335, apiPort=port+1, origin=`http://127.0.0.1:${port}`
// Random per-run local signing key. Never sent to any remote service or output.
const key=randomUUID()+randomUUID(), event=randomUUID(), results=[]
let pgrest, server, browser, page, dropNextSave = false
const wait=ms=>new Promise(r=>setTimeout(r,ms))
function check(label,actual){assert.ok(actual,label);results.push({label,ok:true});console.log('PASS scouting PWA: '+label)}
const sign=claims=>{const body=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');return body+'.'+createHmac('sha256',key).update(body).digest('base64url')}
try {
 const actor=(await db.query("select p.id,u.email from public.profiles p join auth.users u on u.id=p.id where p.approved and p.status='active' and exists(select 1 from public.member_roles r where r.member_id=p.id and r.role='mentor') order by p.id limit 1")).rows[0]
 await db.query("insert into public.events(id,title,kind,starts_at,ends_at) values($1,'PWA Offline Acceptance','competition',now(),now()+interval '1 day')",[event])
 const uri=`postgresql://postgres@/frc?host=${encodeURIComponent(process.env.PGHOST)}&port=${process.env.PGPORT}`
 pgrest=spawn(process.env.POSTGREST_BIN,[],{env:{...process.env,PGRST_DB_URI:uri,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:key,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(apiPort)},stdio:['ignore','pipe','pipe']})
 let pgLog='';pgrest.stdout.on('data',v=>pgLog+=v);pgrest.stderr.on('data',v=>pgLog+=v)
 let ready=false
 for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${apiPort}/`);if(r.ok){ready=true;break}}catch{}await wait(100)}
 assert.ok(ready,'PostgREST startup: '+pgLog)
 execFileSync(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'build','--outDir',resolve(out,'app')],{cwd:root,env:{...process.env,VITE_SUPABASE_URL:origin,VITE_SUPABASE_ANON_KEY:'local-test-placeholder'},stdio:['ignore','pipe','pipe']})
 const expires=Math.floor(Date.now()/1000)+3600, token=sign({role:'authenticated',sub:actor.id,email:actor.email,exp:expires,aud:'authenticated'})
 const user={id:actor.id,email:actor.email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}
 server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,origin)
   if(url.pathname.startsWith('/rest/v1/')){
    const chunks=[];for await(const c of req)chunks.push(c)
    const headers={...req.headers};delete headers.host;delete headers['content-length']
    const upstream=await fetch(`http://127.0.0.1:${apiPort}`+url.pathname.slice('/rest/v1'.length)+url.search,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)})
    if (url.pathname === '/rest/v1/rpc/scouting_save' && upstream.ok && dropNextSave) { dropNextSave=false; const bytes=Buffer.from(await upstream.arrayBuffer()); res.writeHead(200,{'content-type':'application/json','content-length':bytes.length}); res.flushHeaders(); res.write(bytes.subarray(0,10)); setTimeout(()=>res.destroy(),30); return }
    res.writeHead(upstream.status,Object.fromEntries([...upstream.headers].filter(([k])=>!['transfer-encoding','content-encoding','content-length'].includes(k))))
    res.end(Buffer.from(await upstream.arrayBuffer()));return
   }
   if(url.pathname==='/auth/v1/token'){res.setHeader('content-type','application/json');res.end(JSON.stringify({access_token:token,refresh_token:'local-only-test',expires_at:expires,expires_in:3600,token_type:'bearer',user}));return}
   if(url.pathname==='/auth/v1/user'){res.setHeader('content-type','application/json');res.end(JSON.stringify(user));return}
   if(url.pathname.startsWith('/functions/v1/')){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({status:'not_configured',error:'No external integration configured in this local test'}));return}
   const asset=resolve(out,'app','.'+decodeURIComponent(url.pathname));const file=asset.startsWith(resolve(out,'app')+'/')&&existsSync(asset)&&extname(asset)?asset:resolve(out,'app/index.html')
   const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'}
   res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(readFileSync(file))
  }catch(e){res.writeHead(500);res.end(e.message)}
 })
 await new Promise(r=>server.listen(port,'127.0.0.1',r))
 ;({browser}=await launch())
 const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,serviceWorkers:'allow'})
 page=await context.newPage()
 await page.goto(origin)
 await page.evaluate(({user,token,expires})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'local-only-test',expires_at:expires,expires_in:3600,token_type:'bearer',user})),{user,token,expires})
 await page.goto(origin+`/scouting/${event}`)
 await page.getByRole('heading',{name:'PWA Offline Acceptance',exact:true}).waitFor({timeout:15000})
 check('built app loads event through real PostgREST',true)
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}))})
 check('production service worker controls the page',await page.evaluate(()=>!!navigator.serviceWorker.controller))
 // Force the stored session beyond its local refresh deadline, then remove
 // the network. The offline surface must not depend on refreshing Auth.
 await page.evaluate(()=>{const key='sb-127-auth-token', s=JSON.parse(localStorage.getItem(key));s.expires_at=Math.floor(Date.now()/1000)-60;localStorage.setItem(key,JSON.stringify(s))})
 await context.setOffline(true)
 // New browsing context page in the SAME browser profile, no developer-server or HTTP mocks.
 await page.close();page=await context.newPage()
 await page.goto(origin+`/scouting/${event}`,{waitUntil:'domcontentloaded',timeout:15000})
 await page.getByRole('heading',{name:'PWA Offline Acceptance',exact:true}).waitFor({timeout:15000})
 check('cold navigation works offline even after the stored Auth session expires',true)
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:15000})
 await page.getByRole('heading',{name:'PWA Offline Acceptance',exact:true}).waitFor({timeout:15000})
 check('installed PWA start URL reopens the prepared event offline',true)
 await page.getByRole('button',{name:'New observation',exact:true}).click()
 await page.getByLabel('Team number',{exact:true}).fill('5669');await page.getByLabel('Match',{exact:true}).fill('qm99')
 await page.getByRole('group',{name:'Passes under the TRENCH',exact:true}).getByRole('button',{name:'Did not see',exact:true}).click()
 await page.getByLabel('Notes',{exact:true}).fill('Built PWA offline recovery proof')
 await page.getByRole('button',{name:'Save observation',exact:true}).click()
 await page.getByText('1 waiting to sync',{exact:true}).waitFor()
 check('offline observation has no server record',Number((await db.query('select count(*) as n from public.scouting_records where event_id=$1',[event])).rows[0].n)===0)
 await page.reload();await page.getByText('1 waiting to sync',{exact:true}).waitFor()
 check('native IndexedDB queue survives built-PWA reload',true)
 dropNextSave=true
 await context.setOffline(false)
 await page.getByRole('button',{name:'Retry save',exact:true}).waitFor({timeout:30000})
 check('lost HTTP response preserves the queued proposal after server commit',Number((await db.query('select count(*) as n from public.scouting_records where event_id=$1',[event])).rows[0].n)===1)
 await page.getByRole('button',{name:'Retry save',exact:true}).click()
 await page.getByText('All saved work synced',{exact:true}).waitFor({timeout:30000})
 const rows=(await db.query('select * from public.scouting_records where event_id=$1',[event])).rows
 check('reconnect creates exactly one attributed observation',rows.length===1&&rows[0].member_id===actor.id&&rows[0].payload.answers.trench==='did_not_see')
 await page.reload();await page.getByRole('heading',{name:'PWA Offline Acceptance',exact:true}).waitFor()
 check('repeated launch creates no duplicate logical records',Number((await db.query('select count(*) as n from public.scouting_records where event_id=$1',[event])).rows[0].n)===1)
 await page.screenshot({path:resolve(out,'recovered.png'),fullPage:true})
 await context.setOffline(true);await page.reload()
 await page.getByRole('button',{name:'Exit offline scouting',exact:true}).click()
 check('exiting prepared mode removes capture access',await page.getByRole('button',{name:'New observation',exact:true}).count()===0)
 await page.reload();await page.getByRole('heading',{name:'Prepare scouting while connected',exact:true}).waitFor()
 check('offline identity stays cleared across reload',await page.getByRole('button',{name:'New observation',exact:true}).count()===0)
 // Actual HTTP/RLS denial controls, using synthetic signed claims, not fixture RPCs.
 const parent=(await db.query("select member_id as id from public.member_roles where role='parent' order by member_id limit 1")).rows[0]
 const parentToken=sign({role:'authenticated',sub:parent.id,exp:expires})
 const parentRead=await fetch(origin+'/rest/v1/scouting_records?select=*&event_id=eq.'+event,{headers:{authorization:'Bearer '+parentToken}})
 check('parent JWT sees no scouting rows through PostgREST',parentRead.ok&&(await parentRead.json()).length===0)
 const attempt={p_id:randomUUID(),p_event:event,p_kind:'message',p_team:5669,p_match:null,p_payload:{text:'Unauthorized',status:'open'},p_expected_version:0,p_operation:randomUUID(),p_actor:parent.id}
 const denied=await fetch(origin+'/rest/v1/rpc/scouting_save',{method:'POST',headers:{authorization:'Bearer '+parentToken,'content-type':'application/json'},body:JSON.stringify(attempt)})
 check('parent JWT cannot save through PostgREST',denied.status===403&&(await denied.json()).code==='42501')
 const direct=await fetch(origin+'/rest/v1/scouting_records',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({id:randomUUID(),event_id:event,member_id:actor.id,kind:'message',team_number:5669,payload:{text:'Bypass'}})})
 check('authenticated client cannot bypass validated write RPC',direct.status===403&&(await direct.json()).code==='42501')
 const admin=(await db.query("select member_id as id from public.member_roles where role='admin' order by member_id limit 1")).rows[0]
 const adminToken=sign({role:'authenticated',sub:admin.id,exp:expires})
 await db.query('update public.connector_settings set allowed_member=$1 where id',[admin.id])
 const args={...attempt,p_id:randomUUID(),p_operation:randomUUID(),p_actor:admin.id,p_payload:{text:'Local connector transport proof',status:'open'}}
 async function connector(jwt,mode,request){const response=await fetch(origin+'/rest/v1/rpc/connector_call',{method:'POST',headers:{authorization:'Bearer '+jwt,'content-type':'application/json'},body:JSON.stringify({p_tool:'call_app',p_function:'scouting_save',p_args:args,p_request_key:request,p_mode:mode,p_meta:{}})});return {status:response.status,ok:response.ok,body:await response.json()}}
 const preview=await connector(adminToken,'preview','pwa-preview-'+randomUUID())
 check('connector HTTP preview rolls back without creating evidence',!preview.ok&&String(preview.body.message).includes('CONNECTOR_PREVIEW:')&&Number((await db.query('select count(*) as n from public.scouting_records where id=$1',[args.p_id])).rows[0].n)===0)
 const committed=await connector(adminToken,'commit','pwa-commit-'+randomUUID())
 check('connector HTTP commit preserves identity and audit',committed.ok&&(await db.query('select member_id from public.scouting_records where id=$1',[args.p_id])).rows[0]?.member_id===admin.id&&Number((await db.query("select count(*) as n from public.connector_audit where user_id=$1 and function_name='scouting_save'",[admin.id])).rows[0].n)===1)
 const forbidden=await connector(parentToken,'commit','pwa-denied-'+randomUUID())
 check('connector HTTP refuses an unauthorized account',!forbidden.ok&&Number((await db.query('select count(*) as n from public.scouting_records where id=$1',[args.p_id])).rows[0].n)===1)
} catch(e) { if(page) { writeFileSync(resolve(out,'failure.html'),await page.content().catch(()=>'')); await page.screenshot({path:resolve(out,'failure.png'),fullPage:true}).catch(()=>{}) }; results.push({label:e.message,ok:false});console.error('FAIL scouting PWA: '+e.stack);process.exitCode=1}
finally {
 writeFileSync(resolve(out,'results.json'),JSON.stringify({scope:'Built app, native Chromium, real local PostgREST/PostgreSQL; synthetic auth; no live services or real phones',results},null,2))
 await browser?.close();await new Promise(r=>server?server.close(r):r());pgrest?.kill('SIGTERM');await db.end()
 console.log(`scouting PWA: ${results.filter(r=>r.ok).length}/${results.length} passed`)
}
