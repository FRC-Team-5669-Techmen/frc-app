#!/usr/bin/env node
// Independently prove the fixture harness preserves native UI timers/animation
// while controlling only business Date. No application or model imports.
import assert from 'node:assert/strict'
import { launchBrowser } from './lib.mjs'
const browser = await launchBrowser(), context = await browser.newContext()
try {
  const at = Date.parse('2026-10-01T23:00:00Z')
  await context.clock.setFixedTime(at)
  const page = await context.newPage(); await page.setContent('<button>Native actionability</button>')
  const before = await page.evaluate(() => ({ date:Date.now(), performance:performance.now() }))
  const sample = await page.evaluate(async () => {
    let frames=0
    const frame=()=>{frames++;if(frames<3)requestAnimationFrame(frame)}
    requestAnimationFrame(frame)
    await new Promise(r=>setTimeout(r,150))
    return {date:Date.now(),performance:performance.now(),frames}
  })
  assert.equal(sample.date,before.date); assert(sample.performance-before.performance>=100); assert(sample.frames>=2)
  await page.evaluate(()=>{window.__timerFinished=false;setTimeout(()=>{window.__timerFinished=true},300)})
  await context.clock.setFixedTime(new Date(at+120000))
  assert.equal(await page.evaluate(()=>Date.now()),at+120000)
  assert.equal(await page.evaluate(()=>window.__timerFinished),false)
  await page.waitForFunction(()=>window.__timerFinished,{},{timeout:1000})
  await page.getByRole('button',{name:'Native actionability'}).click()
  // A permissive/incorrect probe that ignored frames would miss this break.
  const broken = await page.evaluate(async()=>{
    const original=window.requestAnimationFrame;window.requestAnimationFrame=()=>0
    let frames=0;requestAnimationFrame(()=>frames++)
    await new Promise(r=>setTimeout(r,80));window.requestAnimationFrame=original
    return frames
  })
  assert.throws(()=>assert(broken>=2))
  console.log(JSON.stringify({dateFrozen:true,businessTimeAdvancedMs:120000,nativePerformanceElapsedMs:sample.performance-before.performance,nativeAnimationFrames:sample.frames,nativeTimerNotFastForwarded:true,nativeButtonAction:true,frozenAnimationNegativeControl:'detected'},null,2))
} finally { await context.close(); await browser.close() }
