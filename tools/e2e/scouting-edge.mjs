#!/usr/bin/env node
// Execute the actual Deno entrypoints locally. Auth is a rejecting local HTTP
// stand-in; no hosted identity/provider/Discord success is established here.
// First cache/check the pinned imports with Deno, then set DENO_BIN/DENO_DIR.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
if (!process.env.DENO_BIN) throw new Error('Set DENO_BIN to an installed Deno executable')
const root = resolve(import.meta.dirname,'../..'), out = resolve(root,'artifacts/scouting-edge')
const dir = await mkdtemp(resolve(tmpdir(),'frc-scout-edge-')), results = []
const authPort = Number(process.env.SCOUTING_EDGE_PORT) || 54345, port = authPort+1
let authCalls = 0, worker, workerLog = ''
const wait = ms => new Promise(r=>setTimeout(r,ms))
function check(label, value) { assert.ok(value,label); results.push({label,ok:true}); console.log('PASS Deno entry: '+label) }
const auth = createServer((req,res)=>{
  assert.ok(req.url.startsWith('/auth/v1/'),'Only local Auth calls are expected')
  authCalls++;res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({msg:'Invalid local test JWT',code:'bad_jwt'}))
})
async function stop() {
  if (!worker) return
  if (worker.exitCode === null && worker.signalCode === null) { worker.kill('SIGTERM'); await new Promise(r=>worker.once('exit',r)) }
  worker = null
}
try {
  await mkdir(out,{recursive:true})
  await new Promise(r=>auth.listen(authPort,'127.0.0.1',r))
  for (const name of ['scouting-import','scouting-dispatch']) {
    const entry = pathToFileURL(resolve(root,'supabase/functions',name,'index.ts')).href
    const bootstrap = resolve(dir,name+'.mjs')
    await writeFile(bootstrap,`const serve = Deno.serve.bind(Deno); Deno.serve = handler => serve({hostname:'127.0.0.1',port:${port}},handler); await import(${JSON.stringify(entry)});`)
    workerLog = ''
    worker = spawn(process.env.DENO_BIN,['run','--no-config','--no-lock','--node-modules-dir=none','--cached-only','--no-prompt',`--allow-read=${root}/supabase/functions`,`--allow-net=127.0.0.1:${authPort},127.0.0.1:${port}`,'--allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,TBA_AUTH_KEY,NEXUS_API_KEY,DISCORD_BOT_TOKEN,DISCORD_GUILD_ID',bootstrap],{
      cwd:root,env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${authPort}`,SUPABASE_ANON_KEY:'local-test-placeholder',SUPABASE_SERVICE_ROLE_KEY:'local-test-placeholder',TBA_AUTH_KEY:'',NEXUS_API_KEY:'',DISCORD_BOT_TOKEN:'',DISCORD_GUILD_ID:''},stdio:['ignore','pipe','pipe'],
    })
    worker.stdout.on('data',v=>workerLog+=v);worker.stderr.on('data',v=>workerLog+=v)
    let ready = false
    for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}`,{method:'OPTIONS'})).ok){ready=true;break}}catch{}if(worker.exitCode!==null)break;await wait(50)}
    assert.ok(ready,`${name} startup: ${workerLog}`)
    const request = options => fetch(`http://127.0.0.1:${port}`,options)
    const cors = await request({method:'OPTIONS'})
    check(name+' serves CORS preflight',cors.status===200&&cors.headers.get('access-control-allow-methods')==='POST, OPTIONS')
    check(name+' refuses non-POST methods',(await request({method:'GET'})).status===405)
    const before = authCalls
    check(name+' refuses missing bearer before Auth',(await request({method:'POST',body:'{}'})).status===401&&authCalls===before)
    const headers = {authorization:'Bearer local-invalid-jwt','content-type':'application/json'}
    check(name+' rejects oversized request before Auth',(await request({method:'POST',headers,body:'x'.repeat(2001)})).status===413&&authCalls===before)
    check(name+' reports malformed JSON without touching Auth',(await request({method:'POST',headers,body:'{'})).status===503&&authCalls===before)
    const body = name==='scouting-import' ? {event_id:'20000000-0000-4000-8000-000000000002',event_key:'2026dal',mode:'pit_map'} : {record_id:'20000000-0000-4000-8000-000000000002',version:1}
    const refused = await request({method:'POST',headers,body:JSON.stringify(body)})
    check(name+' propagates an actual SDK Auth refusal',refused.status===401&&authCalls===before+1&&(await refused.json()).error==='Sign in'+(name==='scouting-import'?' first.':' to send this note.'))
    await stop()
  }
} catch(e) { results.push({label:e.message,ok:false}); console.error(e.stack); process.exitCode=1 }
finally {
  await stop();await new Promise(r=>auth.close(r));await rm(dir,{recursive:true,force:true})
  await writeFile(resolve(out,'results.json'),JSON.stringify({scope:'Actual local Deno entrypoints and pinned Supabase SDK; rejecting HTTP Auth stand-in; no hosted/provider/Discord sends',results},null,2))
  console.log(`Deno entrypoints: ${results.filter(r=>r.ok).length}/${results.length} passed`)
}
