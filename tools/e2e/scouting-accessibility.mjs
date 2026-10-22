#!/usr/bin/env node
/** Independent automated accessibility audit of actual scouting components.
 * Install the pinned audit engine OUTSIDE application dependencies:
 * npm install --prefix /tmp/scouting-a11y --no-package-lock --no-save axe-core@4.11.1
 * AXE_CORE_PATH=/tmp/scouting-a11y/node_modules/axe-core/axe.min.js node tools/e2e/scouting-accessibility.mjs
 * Fixture backend, native Chromium at two viewport sizes. Not a screen-reader,
 * physical-phone, cognitive-usability or full WCAG conformance certification.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { startFixtureServer, launchBrowser, newContext, VIEWPORTS, REPO } from './lib.mjs'
const axePath=process.env.AXE_CORE_PATH
if(!axePath)throw new Error('Set AXE_CORE_PATH to axe-core 4.11.1 axe.min.js; see this file for setup')
const source=readFileSync(axePath,'utf8'),out=resolve(REPO,'artifacts/scouting-accessibility'),results=[]
mkdirSync(out,{recursive:true})
const server=await startFixtureServer({port:Number(process.env.SCOUTING_A11Y_PORT)||5404})
let browser
try{
 browser=await launchBrowser()
 for(const width of [375,1440]){
  const {context,blocked}=await newContext(browser,VIEWPORTS[width]),page=await context.newPage()
  try{
   await page.goto(server.origin+'/scouting/16000000-0000-4000-8000-000000000001?__fx=persona:student,mig:all,reset')
   await page.getByRole('heading',{name:'Fixture Regional',exact:true}).waitFor()
   await page.addScriptTag({content:source});assert.equal(await page.evaluate(()=>window.axe.version),'4.11.1')
   async function audit(state,selector='.sc-wrap'){
    const result=await page.evaluate(async selector=>{
     const report=await window.axe.run({include:[selector]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})
     const concise=rows=>rows.map(row=>({id:row.id,impact:row.impact,description:row.description,helpUrl:row.helpUrl,nodes:row.nodes.map(node=>({target:node.target,summary:node.failureSummary}))}))
     return {violations:concise(report.violations),incomplete:concise(report.incomplete),passedRules:report.passes.map(row=>row.id)}
    },selector)
    results.push({width,state,...result})
    console.log(`${result.violations.length?'FAIL':'PASS'} scouting accessibility ${width} ${state}: ${result.violations.length} violations; ${result.incomplete.length} manual-review rules`)
    if(result.violations.length)await page.screenshot({path:resolve(out,`${width}-${state}.png`),fullPage:true})
   }
   // Permissive negative control: make a real unlabeled control and require the
   // external engine to detect it before auditing the unmodified application.
   await page.locator('.sc-wrap').evaluate(el=>{const b=document.createElement('button');b.id='axe-negative-control';el.append(b)})
   const negative=await page.evaluate(async()=>await window.axe.run({include:['#axe-negative-control']},{runOnly:{type:'rule',values:['button-name']}}))
   assert.ok(negative.violations.some(row=>row.id==='button-name'),'axe must detect the deliberately unnamed button')
   await page.locator('#axe-negative-control').evaluate(el=>el.remove())
   for(const name of ['Scout this','Teams','Pit messages','Pick lists','Practice']){
    await page.getByRole('tab',{name,exact:true}).click()
    if(name==='Practice')await page.getByText('Practice record loaded on this device.',{exact:true}).waitFor()
    await audit(name.toLowerCase().replaceAll(' ','-'))
   }
   await page.getByRole('tab',{name:'Teams',exact:true}).click()
   await page.locator('.sc-match-brief summary').click();await page.getByLabel('Brief match',{exact:true}).fill('qm42');await page.getByLabel('Our alliance teams',{exact:true}).fill('5669 101 202');await page.getByLabel('Opponent teams',{exact:true}).fill('303 404 505');await audit('match-brief');await page.locator('.sc-match-brief summary').click()
   await page.getByText('Pit map and directory',{exact:true}).click();await page.getByLabel('Nexus event key',{exact:true}).fill('2026dal')
   await page.getByRole('button',{name:'Download / refresh map',exact:true}).click();await page.getByText('Map saved on this device for offline use.',{exact:true}).waitFor()
   await audit('downloaded-map')
   await page.getByText('Recover pending saves from a backup',{exact:true}).click();await audit('recovery-input')
   await page.getByRole('button',{name:'New observation',exact:true}).click();await page.getByLabel('Notes',{exact:true}).waitFor();await audit('observation-dialog','dialog[open]')
   for(let i=0;i<24;i++){
    await page.keyboard.press('Tab')
    const focus = await page.evaluate(()=>({inside:document.querySelector('dialog[open]')?.contains(document.activeElement),documentFocused:document.hasFocus()}))
    assert.ok(focus.inside || !focus.documentFocused,'focus may reach browser chrome, but never another app control while modal')
   }
   await page.getByRole('checkbox',{name:'Request Discord delivery after sync',exact:true}).scrollIntoViewIfNeeded()
   await audit('observation-dialog-scrolled','dialog[open]')
   await page.screenshot({path:resolve(out,`${width}-dialog-scrolled.png`),fullPage:false})
   await page.keyboard.press('Escape');await page.locator('dialog[open]').waitFor({state:'detached'})
   assert.equal(await page.getByRole('button',{name:'New observation',exact:true}).evaluate(el=>el===document.activeElement),true,'Escape should restore focus to the opener')
   await page.getByRole('tab',{name:'Scout this',exact:true}).focus();await page.keyboard.press('ArrowRight')
   assert.equal(await page.getByRole('tab',{name:'Teams',exact:true}).getAttribute('aria-selected'),'true')
   assert.equal(await page.getByRole('tab',{name:'Teams',exact:true}).evaluate(el=>el===document.activeElement),true)
   assert.equal(blocked.length,0,'the audit must make no remote requests')
  } finally {await context.close()}
 }
 if(results.some(row=>row.violations.length))process.exitCode=1
}catch(e){results.push({error:e.message});console.error(e.stack);process.exitCode=1}
finally{
 writeFileSync(resolve(out,'results.json'),JSON.stringify({engine:'axe-core 4.11.1',scope:'Scouting region/dialog, WCAG 2 A/AA and 2.1 A/AA rules, fictional fixture backend, native Chromium desktop/touch emulation; manual review still required',negativeControls:'Unnamed button detected at each width; tab-arrow focus/selection, 24 dialog Tab steps and Escape focus return checked',results},null,2))
 await browser?.close();await server.stop()
 console.log(`scouting accessibility: ${results.filter(row=>row.violations?.length===0).length}/${results.length} scans without automated violations`)
}
