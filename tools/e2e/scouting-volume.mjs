#!/usr/bin/env node
/** Synthetic large-event browser check. No production data, hosted API, real
 * device, network-speed benchmark or measured human completion claim.
 * Independent fixture: 120 teams, 12 observations each, two complete ballots.
 * Each team's TRENCH responses are [yes,yes,no,did_not_see,not_applicable,missing]
 * twice: 4/6 observed matches (67%), two of each excluded response. BUMP has
 * only did_not_see and floor intake is entirely missing. Reversed ballots have
 * median rank 60.5, support two, all Tier 1; ties sort by team number.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { startFixtureServer, launchBrowser, newContext, VIEWPORTS, REPO } from './lib.mjs'
const event='16000000-0000-4000-8000-000000000001',actor='00000000-0000-0000-0000-0000000000c1'
const out=resolve(REPO,'artifacts/scouting-volume'),results=[]
mkdirSync(out,{recursive:true})
const server=await startFixtureServer({port:Number(process.env.SCOUTING_VOLUME_PORT)||5406})
let browser
try{
 browser=await launchBrowser()
 for(const width of [375,1440]){
  const {context,blocked}=await newContext(browser,VIEWPORTS[width]),page=await context.newPage(),errors=[]
  page.setDefaultTimeout(15000)
  page.on('pageerror',error=>errors.push(error.message))
  try{
   await page.goto(server.origin+`/scouting/${event}?__fx=persona:student,mig:all,reset`)
   await page.getByRole('heading',{name:'Fixture Regional',exact:true}).waitFor()
   // Seed the fictional backend in one write; no app/model functions calculate
   // the expected evidence. Raw fixture setup is not a database validation test.
   await page.evaluate(({event,actor})=>{
    const rows=[],at='2026-10-21T12:00:00Z',teams=Array.from({length:120},(_,i)=>8000+i)
    let sequence=1
    function row(kind,team,payload,match=null,member=actor){return {id:`33000000-0000-4000-8000-${String(sequence++).padStart(12,'0')}`,event_id:event,member_id:member,kind,team_number:team,match_key:match,payload,version:1,created_at:at,updated_at:at}}
    for(const team of teams){
     rows.push(row('team',team,{name:`Synthetic ${team}`,source:'manual',pit_location:`V${team-7999}`}))
     rows.push(row('pit',team,{capabilities:{trench:'yes',bump:'unknown',ground_intake:'unknown'},notes:'Synthetic volume fixture'}))
     for(let i=0;i<12;i++){
      const answers={bump:'did_not_see'},trench=['yes','yes','no','did_not_see','not_applicable',undefined][i%6]
      if(trench!==undefined)answers.trench=trench
      rows.push(row('observation',team,{source:'live',answers,notes:'Synthetic volume fixture'},`qm${i+1}`))
     }
    }
    rows.push(row('pick_list',null,{entries:teams.map((team,i)=>({team,tier:1,rank:i+1}))}))
    rows.push(row('pick_list',null,{entries:[...teams].reverse().map((team,i)=>({team,tier:1,rank:i+1}))},null,'00000000-0000-0000-0000-0000000000c2'))
    window.__fx.db.scouting_records=rows
    window.__fx.db.scouting_revisions=rows.map(row=>({record_id:row.id,event_id:event,member_id:row.member_id,changed_by:row.member_id,version:1,snapshot:structuredClone(row),created_at:at}))
    window.__fx.db.scouting_operations=[];window.__fx.db.scouting_delivery=[];window.__fx.save()
   },{event,actor})
   console.log(`Seeded ${width}; opening large event`)
   const started=Date.now()
   await page.goto(server.origin+`/scouting/${event}`)
   await page.getByRole('heading',{name:'Fixture Regional',exact:true}).waitFor()
   console.log(`Loaded ${width}; rendering teams`)
   const loadMs=Date.now()-started,tabStarted=Date.now()
   await page.getByRole('tab',{name:'Teams',exact:true}).click()
   await page.waitForFunction(()=>document.querySelectorAll('.sc-team-card').length===30)
   const teamsMs=Date.now()-tabStarted
   assert.match(await page.getByRole('navigation',{name:'Team results pages'}).innerText(),/Showing 1–30 of 120 teams/)
   for(let i=0;i<3;i++)await page.getByRole('button',{name:'Next teams',exact:true}).click()
   assert.match(await page.locator('.sc-team-card').last().innerText(),/Synthetic 8119/)
   assert.equal(await page.getByRole('button',{name:'Next teams',exact:true}).isDisabled(),true)
   const searchStarted=Date.now()
   await page.getByLabel('Find a team',{exact:true}).fill('8119')
   await page.waitForFunction(()=>document.querySelectorAll('.sc-team-card').length===1)
   const searchMs=Date.now()-searchStarted,card=page.locator('.sc-team-card')
   assert.match(await card.innerText(),/Synthetic 8119/)
   const evidence=card.locator('.sc-evidence')
   assert.match(await evidence.nth(0).innerText(),/67%\s*4\/6 observed matches/)
   await evidence.nth(0).getByText('Count details',{exact:true}).click()
   assert.match(await evidence.nth(0).innerText(),/2 observed failures.*2 did not see, 2 not applicable, 2 unanswered/s)
   assert.match(await evidence.nth(1).innerText(),/No evidence\s*0\/0 observed matches/)
   assert.match(await evidence.nth(2).innerText(),/No evidence\s*0\/0 observed matches/)
   // Read the actual IndexedDB cache, independently of the application's store.
   const cached=await page.evaluate(async key=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('techmen-scouting-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    try{return await new Promise((resolve,reject)=>{const r=db.transaction('cache').objectStore('cache').get(key);r.onsuccess=()=>resolve(r.result.value);r.onerror=()=>reject(r.error)})}finally{db.close()}
   },`${actor}:${event}`)
   assert.equal(cached.records.length,1682);assert.equal(cached.revisions.length,1682)
   assert.equal(cached.records.filter(row=>row.kind==='observation').length,1440)
   assert.equal(cached.records.filter(row=>row.kind==='observation'&&!('trench' in row.payload.answers)).length,240)
   assert.equal(new Set(cached.records.map(row=>row.id)).size,1682)
   await page.getByRole('tab',{name:'Pick lists',exact:true}).click()
   await page.getByRole('button',{name:'Master list',exact:true}).click()
   const rankings=page.locator('.sc-master > li')
   assert.equal(await rankings.count(),120)
   assert.equal(await rankings.first().locator('strong').innerText(),'8000')
   assert.equal(await rankings.last().locator('strong').innerText(),'8119')
   for(const rank of await rankings.allTextContents())assert.match(rank,/Median tier 1, rank 60.5.*2 lists.*0 do not pick/s)
   const exported=page.waitForEvent('download')
   await page.getByRole('button',{name:'Export event data',exact:true}).click()
   const download=await exported,file=resolve(out,`${width}-synthetic-event.json`);await download.saveAs(file)
   const archive=JSON.parse(readFileSync(file,'utf8'))
   assert.equal(archive.records.length,1682);assert.equal(archive.revisions.length,1682)
   await page.screenshot({path:resolve(out,`${width}-evidence.png`),fullPage:false})
   assert.deepEqual(errors,[]);assert.equal(blocked.length,0)
   results.push({width,ok:true,records:1682,revisions:1682,observations:1440,teams:120,loadMs,teamsMs,searchMs,checks:'Complete cache and export beyond 1,000 rows; last team visible; four pages and last-team search; independent 4/6 denominator and excluded states; 120 tied median ranks and support counts; zero script errors or remote requests'})
   console.log(`PASS ${width}: 1,682 records/revisions, 1,440 observations, 120 teams; load ${loadMs} ms, team tab ${teamsMs} ms, search ${searchMs} ms (synthetic local fixture)`)
  }finally{await context.close()}
 }
}catch(error){results.push({ok:false,error:error.message});console.error(error.stack);process.exitCode=1}
finally{
 writeFileSync(resolve(out,'results.json'),JSON.stringify({scope:'Synthetic large event, fixture backend, native Chromium at desktop/touch-emulated widths; shared container timing only, not field performance',results},null,2))
 await browser?.close();await server.stop()
}
