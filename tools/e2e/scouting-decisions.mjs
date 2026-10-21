#!/usr/bin/env node
// Real Chromium/IndexedDB; fictional backend and phone viewport emulation.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { startFixtureServer, launchBrowser, newContext, VIEWPORTS, REPO } from './lib.mjs'
const event = '16000000-0000-4000-8000-000000000001', actor = '00000000-0000-0000-0000-0000000000c1'
const out = resolve(REPO, 'artifacts/scouting-decisions'), results = []
mkdirSync(out, { recursive: true })
const server = await startFixtureServer({ port: 5412 }); let browser
try {
  browser = await launchBrowser()
  for (const width of [375, 1440]) {
    const { context } = await newContext(browser, VIEWPORTS[width]), page = await context.newPage(), errors = []
    page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(15000)
    try {
      await page.goto(`${server.origin}/scouting/${event}?__fx=persona:student,mig:all,reset`)
      await page.getByRole('heading', { name: 'Fixture Regional', exact: true }).waitFor()
      await page.evaluate(({event,actor}) => {
        const at = '2026-10-21T12:00:00Z'
        const rows = Array.from({ length: 65 }, (_, i) => ({ id: `33000000-0000-4000-8000-${String(i).padStart(12,'0')}`, event_id: event, member_id: actor, kind: 'observation', team_number: 5669, match_key: `qm${i+1}`, version: 1, updated_at: at, created_at: at, payload: { source: 'live', answers: { trench: i === 0 ? 'yes' : 'did_not_see' }, notes: i === 64 ? 'Oldest searchable evidence' : 'Synthetic evidence' } }))
        rows.push({ ...rows[0], id: '33000000-0000-4000-8000-000000000099', member_id: '00000000-0000-0000-0000-0000000000c2', match_key: '2026test_qm1', payload: { source: 'live', answers: { trench: 'no' }, notes: 'Contradiction' } })
        window.__fx.db.scouting_records = rows; window.__fx.db.scouting_revisions = []; window.__fx.save()
      }, {event,actor})
      await page.reload(); await page.getByRole('heading', { name: 'Fixture Regional', exact: true }).waitFor()
      await page.getByLabel('Search observations', {exact:true}).fill('qm65')
      assert.equal(await page.locator('.sc-evidence-record').count(), 1)
      assert.match(await page.locator('.sc-evidence-record').innerText(), /Oldest searchable evidence/)
      await page.getByRole('button', {name:'Correct observation',exact:true}).click()
      await page.locator('dialog').waitFor(); assert.equal(await page.locator('dialog textarea').inputValue(), 'Oldest searchable evidence')
      await page.keyboard.press('Escape')
      await page.getByRole('button', {name:'Reset observation filters',exact:true}).click()
      await page.getByLabel('Evidence source',{exact:true}).selectOption('disputed')
      assert.equal(await page.locator('.sc-evidence-record').count(), 2)
      await page.getByRole('tab', {name:'Teams',exact:true}).click()
      await page.locator('.sc-match-brief summary').click()
      await page.getByLabel('Brief match',{exact:true}).fill('qm42')
      await page.getByLabel('Our alliance teams',{exact:true}).fill('5669 101 202')
      await page.getByLabel('Opponent teams',{exact:true}).fill('303 404 505')
      await page.getByLabel('Opening and autonomous coordination',{exact:true}).fill('<script>throw "unsafe"</script> Coordinate routes with partners.')
      await page.getByText('Brief saved on this device',{exact:true}).waitFor()
      await page.getByRole('button',{name:'Confirm lineup and review brief',exact:true}).click()
      let download = page.waitForEvent('download')
      await page.getByRole('button',{name:'Export reviewed brief JSON',exact:true}).click()
      const jsonFile = await (await download).path(), brief = JSON.parse(readFileSync(jsonFile,'utf8'))
      assert.equal(brief.teams[0].capabilities[0].disputed,1)
      assert.equal(brief.teams[0].capabilities[0].denominator,0)
      assert.equal(brief.teams[1].capabilities[0].percent,null)
      assert.equal(brief.records.length,66)
      assert.equal(brief.context.memberId,actor)
      download = page.waitForEvent('download')
      await page.getByRole('button',{name:'Export printable brief',exact:true}).click()
      const html = readFileSync(await (await download).path(),'utf8')
      const print = await context.newPage(); await print.setContent(html)
      assert.equal(await print.locator('script,img,iframe,link,[src]').count(),0)
      assert.match(await print.locator('body').innerText(), /<script>throw "unsafe"<\/script>/)
      await print.emulateMedia({media:'print'}); await print.pdf({path:resolve(out,`brief-${width}.pdf`),format:'A4'}); await print.close()
      await page.getByLabel('Robot roles and priorities',{exact:true}).fill('Changed plan requires fresh review')
      assert.equal(await page.getByRole('button',{name:'Export printable brief',exact:true}).isDisabled(),true)
      await page.getByText('Brief saved on this device',{exact:true}).waitFor()
      await page.reload(); await page.getByRole('tab',{name:'Teams',exact:true}).click(); await page.locator('.sc-match-brief summary').click()
      assert.equal(await page.getByLabel('Robot roles and priorities',{exact:true}).inputValue(),'Changed plan requires fresh review')
      assert.equal(await page.getByRole('button',{name:'Export printable brief',exact:true}).isDisabled(),true)
      await context.setOffline(true)
      await page.getByLabel('Fallbacks and questions to resolve',{exact:true}).fill('Offline: ask partners about endgame clearance')
      await page.getByText('Brief saved on this device',{exact:true}).waitFor()
      await page.getByRole('button',{name:'Confirm lineup and review brief',exact:true}).click()
      assert.equal(await page.getByRole('button',{name:'Export printable brief',exact:true}).isDisabled(),false)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false)
      await page.screenshot({path:resolve(out,`brief-${width}.png`),fullPage:true})
      assert.deepEqual(errors,[])
      results.push({width,passed:true,checks:17,backend:'fictional fixture',storage:'native IndexedDB',offline:'editing/export readiness; built-PWA reload checked separately',realDevice:false})
      console.log(`PASS decision support ${width}: 17 assertions`)
    } finally { await context.close() }
  }
} finally {
  await browser?.close(); await server.stop()
  writeFileSync(resolve(out,'results.json'),JSON.stringify({at:new Date().toISOString(),results},null,2))
}
