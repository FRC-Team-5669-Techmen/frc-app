/**
 * The battery log (/batteries, migration 0026, ledger 0017), Chromium at 375
 * and 1440 on fixture mode. The expected order and flags are computed here
 * from the seeded rows (the oracle), not read from src/batteries.js.
 *
 *  - before 0026: the page says not set up, and makes no write;
 *  - a student sees seven cards worst first: three flagged (brownout, low
 *    resting voltage, resistance) before the healthy ones, the retired last;
 *  - Match-ready shows exactly B01; one tap sets a charge state;
 *  - Log a run: battery and kind remembered, numeric keypad, one run row,
 *    attributed, and a charged battery becomes needs charge;
 *  - staff add a numbered set; a student has no staff panel;
 *  - a parent-only account reads nothing;
 *  - the CSV holds one row per run;
 *  - robot telemetry (0041, ledger 0031): robot mOhm per card with its level,
 *    the trend, verdict tags, the fleet line naming B07 (high while the others
 *    read normal), B07 flagged; before 0041 none of it and B07 not flagged;
 *    a writer imports pit load tests from the robot repo (stubbed) once, and a
 *    second check finds them already in the log.
 * Write-side RLS is proven by 0026_battery_log_rls_test.sql, not here.
 */
import { P, PRE_0014 } from './_util.mjs'

const PRE_0026 = `${PRE_0014},0014,0015,0016,0017,0018,0019,0020,0021,0022,0023,0024,0025`
const PRE_0041 = `${PRE_0026},${Array.from({ length: 13 }, (_, i) => String(26 + i).padStart(4, '0')).join(',')},0040`
const latestR = (runs, id) => runs.filter((r) => r.battery_id === id && r.robot_resistance_mohm !== null && r.robot_resistance_mohm !== undefined)
  .sort((a, b) => b.ran_at.localeCompare(a.ran_at))[0]?.robot_resistance_mohm ?? null
const median = (xs) => { const v = [...xs].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2 }
const laWall = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' }).replace(' ', 'T')

export default {
  async run(t) {
    await t.step('before 0026', async () => {
      t.as('mig without 0026')
      await t.open('/batteries', { persona: 'student', mig: PRE_0026, reset: true, ready: '.ba-wrap' })
      await t.waitText('Not set up yet')
      t.eq('the page says not set up, with no board', await t.count('.ba-card'), 0)
      const writes = (await t.calls()).filter((c) => c.kind === 'rpc' && /^battery_/.test(c.name ?? ''))
      t.eq('no battery function was called', writes.length, 0)
    })

    t.as('student board')
    await t.open('/batteries', { persona: 'student', mig: 'all', reset: true, ready: '.ba-card' })
    const seeded = await t.rows('battery_runs')
    t.check('the fixture seeded runs for the oracle', seeded.length >= 8, `${seeded.length} runs`)
    const labels = await t.texts('.ba-card .ba-label')
    t.eq('six batteries in service, flagged first (B02 browned out; B03 rests 12.31 V; B04 Beak 24.5 mOhm; B07 robot 31.5 mOhm), then healthy by label',
      labels, ['B02', 'B03', 'B04', 'B07', 'B01', 'B05'])
    t.eq('four cards carry Check, against six cards', await t.count('.ba-card .ba-pill-check'), 4)
    t.eq('a student has no load-test import (0, against 1 for a mentor below)', await t.count('[data-loadtests]'), 0)
    t.eq('every card in service has its charge buttons', await t.count('.ba-card .ba-charge'), 6)
    await t.press(t.page.locator('.ba-filter', { hasText: 'Retired' }))
    t.eq('Retired shows B06 alone, with no charge buttons', [await t.texts('.ba-card .ba-label'), await t.count('.ba-card .ba-charge')], [['B06'], 0])
    await t.press(t.page.locator('.ba-filter', { hasText: 'In service' }))
    t.eq('no staff panel for a student', await t.count('.ba-staff'), 0)
    await t.noHScroll()
    await t.tapTargets('.ba-wrap button', 'battery controls at least 44px')
    await t.shot('board')

    await t.step('robot telemetry', async () => {
      t.as('telemetry')
      const bats = await t.rows('batteries')
      const live = bats.filter((b) => b.status !== 'retired').map((b) => ({ label: b.label, r: latestR(seeded, b.id) })).filter((x) => x.r !== null)
      const med = Math.round(median(live.map((x) => x.r)) * 10) / 10
      const out = live.filter((x) => x.r >= med * 1.3 || x.r > med + 5).map((x) => x.label)
      t.check('the oracle: four batteries with robot readings, B07 alone standing out', live.length === 4 && out.join() === 'B07', JSON.stringify({ live, med, out }))
      t.eq('the fleet line names that battery, with the median', [await t.page.locator('[data-fleet]').getAttribute('data-fleet'), await t.text('.ba-fleet-num b')], ['battery', med.toFixed(1)])
      t.check('and says B07 in plain words', (await t.text('.ba-fleet-say')).includes('B07 (31.5)'))
      const card = (l) => `.ba-card[data-battery="${l}"]`
      t.eq('B07: robot 31.5 mOhm, Pull level, Stands out; B01: 16.8, OK, no tag',
        [await t.text(`${card('B07')} [data-stat="robot-r"] b`), await t.page.locator(`${card('B07')} [data-stat="robot-r"]`).getAttribute('class'), await t.count(`${card('B07')} .ba-vtag-standout`),
          await t.text(`${card('B01')} [data-stat="robot-r"] b`), await t.page.locator(`${card('B01')} [data-stat="robot-r"]`).getAttribute('class'), await t.count(`${card('B01')} .ba-vtag-standout`)],
        ['31.5', 'ba-lvl-pull', 1, '16.8', 'ba-lvl-ok', 0])
      t.eq('a trend line where a battery has 2+ robot readings (B07, B01), none where it has none (B04, B05)',
        [await t.count(`${card('B07')} .ba-trend`), await t.count(`${card('B01')} .ba-trend`), await t.count(`${card('B04')} .ba-trend`), await t.count(`${card('B05')} .ba-trend`)], [1, 1, 0, 0])
      t.eq('latest verdict tags: B02 OK (its newest match; the brownout was the one before), B03 Charge, B07 High R', [await t.text(`${card('B02')} .ba-verdict`), await t.text(`${card('B03')} .ba-verdict`), await t.text(`${card('B07')} .ba-verdict`)], ['OK', 'Charge', 'High R'])
      t.check('B07 is flagged by its robot reading', (await t.text(`${card('B07')} .ba-reason`)).startsWith('Robot read 31.5'))
      await t.press(t.page.locator(`${card('B07')} .ba-card-open`))
      await t.waitFor('dialog.ba-sheet[open]')
      t.check('the sheet keeps robot and Beak apart: robot 31.5 Pull, Beak 17.9', (await t.text('[data-fact="robot-r"]')).startsWith('31.5 mΩ · Pull') && (await t.bodyText()).includes('17.9 mΩ'))
      t.eq('the robot verdict is listed with its tag', await t.count('[data-verdict] li'), 3)
      await t.shot('sheet-telemetry')
      await t.press(t.page.locator('dialog.ba-sheet .ba-btn', { hasText: 'Close' }))
    })

    await t.step('before 0041', async () => {
      t.as('mig without 0041')
      await t.open('/batteries', { persona: 'student', mig: PRE_0041, reset: true, ready: '.ba-card' })
      t.eq('no robot readings: the fleet says none, every robot cell blank, B07 not flagged (3 Check, against 4 above)',
        [await t.page.locator('[data-fleet]').getAttribute('data-fleet'), (await t.texts('[data-stat="robot-r"] b')).every((x) => x === '--'), await t.count('.ba-card .ba-pill-check')], ['none', true, 3])
      await t.open('/batteries', { persona: 'student', mig: 'all', reset: true, ready: '.ba-card' })
    })

    await t.step('match-ready', async () => {
      t.as('filter')
      await t.press(t.page.locator('.ba-filter', { hasText: 'Match-ready' }))
      t.eq('Match-ready shows only B01 (competition, charged, unflagged)', await t.texts('.ba-card .ba-label'), ['B01'])
      await t.press(t.page.locator('.ba-filter', { hasText: 'In service' }))
    })

    await t.step('one-tap charge state', async () => {
      t.as('charge')
      const card = t.page.locator('.ba-card[data-battery="B04"]')
      await t.press(card.locator('.ba-charge-btn', { hasText: 'Charged' }))
      await t.settle()
      const b4 = (await t.rows('batteries')).find((b) => b.label === 'B04')
      t.eq('B04 is charged in the store after one tap', b4?.charge_state, 'charged')
      t.eq('and its Charged button reads pressed', await card.locator('.ba-charge-btn[aria-pressed="true"]').textContent(), 'Charged')
    })

    await t.step('log a run', async () => {
      t.as('log')
      const before = (await t.rows('battery_runs')).length
      await t.press(t.page.locator('.ba-card[data-battery="B01"] .ba-card-open'))
      await t.waitFor('dialog.ba-sheet[open]')
      t.check('the sheet shows B01 history', (await t.text('dialog.ba-sheet h2')) === 'B01')
      await t.press(t.page.locator('dialog.ba-sheet .ba-primary', { hasText: 'Log a run' }))
      await t.waitFor('form.ba-form')
      t.eq('Resting before opens a decimal keypad', await t.page.getByLabel('Resting before', { exact: true }).getAttribute('inputmode'), 'decimal')
      await t.page.getByLabel('Resting before', { exact: true }).fill('12.88')
      await t.page.getByLabel('After', { exact: true }).fill('11.7')
      await t.page.getByPlaceholder('qm12').fill('qm21')
      await t.tapTargets('form.ba-form button, form.ba-form input', 'run form targets at least 44px')
      await t.shot('log-form')
      await t.press(t.page.locator('button.ba-save'))
      await t.waitFor('form.ba-form', { state: 'detached' })
      await t.settle()
      const runs = await t.rows('battery_runs')
      const mine = runs.filter((r) => r.member_id === P.student.id && r.match_label === 'qm21')
      t.eq('exactly one new run', runs.length - before, 1)
      t.check('attributed to Sam, match kind, the two voltages, brownout No, resistance not measured (null)',
        mine.length === 1 && mine[0].kind === 'match' && Number(mine[0].voltage_before) === 12.88 && Number(mine[0].voltage_after) === 11.7 && mine[0].brownout === 'no' && mine[0].resistance_mohm === null,
        JSON.stringify(mine[0] ?? null).slice(0, 160))
      t.eq('B01 was charged and now needs a charge', (await t.rows('batteries')).find((b) => b.label === 'B01')?.charge_state, 'needs_charge')
      await t.waitText('B01 logged')
      // The second run remembers the battery and the kind.
      await t.press(t.page.locator('.ba-head .ba-primary', { hasText: 'Log a run' }))
      await t.waitFor('form.ba-form')
      const pressed = await t.texts('form.ba-form button[aria-pressed="true"]')
      t.check('the next Log a run remembers B01 and Match', pressed.includes('B01') && pressed.includes('Match'), pressed.join(', '))
      await t.press(t.page.locator('dialog.ba-sheet .ba-btn', { hasText: 'Close' }))
    })

    await t.step('staff', async () => {
      t.as('mentor adds a set')
      await t.open('/batteries', { persona: 'mentor', mig: 'all', ready: '.ba-card' })
      t.eq('a mentor has the Add batteries panel (1, against 0 for a student)', await t.count('.ba-staff'), 1)
      await t.press(t.page.locator('.ba-staff summary'))
      await t.page.getByLabel('From', { exact: true }).fill('8')
      await t.page.getByLabel('To', { exact: true }).fill('10')
      await t.press(t.page.locator('.ba-staff button[type="submit"]'))
      await t.waitText('3 added')
      const labels2 = (await t.rows('batteries')).map((b) => b.label)
      t.check('B08, B09 and B10 now exist, one each', ['B08', 'B09', 'B10'].every((l) => labels2.filter((x) => x === l).length === 1), labels2.join(','))
    })

    await t.step('pit load tests', async () => {
      t.as('mentor imports load tests')
      const now = await t.evaluate(() => Date.now())
      const csv = ['time,kind,battery,rest_v,resistance_mohm,min_v,amps_at_min,brownouts,verdict',
        `${laWall(now - 30 * 60e3)}.250000,load_test,b5,13.01,18.4,11.70,119,0,"B5 R = 18.4 mOhm (battery + wiring) | 13.01 V idle -> 11.70 V at 119 A | normal"`,
        `${laWall(now - 20 * 60e3)},load_test,B 01,13.04,16.3,11.90,118,0,normal`,
        `${laWall(now - 10 * 60e3)},load_test,B99,13.0,18.0,11.0,110,0,normal`,
        `${laWall(now - 40 * 60e3)},practice,B01,12.9,17.0,10.9,233,0,OK`].join('\n')
      await t.page.route('https://raw.githubusercontent.com/**', (r) => (r.request().url().endsWith('/match-data/battery-history.csv') ? r.fulfill({ status: 200, contentType: 'text/csv', body: csv }) : r.fulfill({ status: 404, body: '' })))
      await t.open('/batteries', { persona: 'mentor', mig: 'all', ready: '.ba-card' })
      t.eq('a mentor has the load-test import (1)', await t.count('[data-loadtests]'), 1)
      const before = (await t.rows('battery_runs')).length
      await t.press(t.page.locator('[data-loadtests] summary'))
      await t.press(t.page.locator('[data-loadtests] button', { hasText: 'Check GitHub' }))
      await t.waitFor('[data-loadtest-summary]')
      t.eq('two new, one skipped (B99 is not a battery), the match row not offered', await t.text('[data-loadtest-summary]'), '2 new · 0 already in the log · 1 skipped')
      await t.tapTargets('[data-loadtests] button', 'load-test controls at least 44px')
      await t.press(t.page.locator('[data-loadtests] .ba-primary'))
      await t.waitText('2 load tests imported')
      await t.settle()
      const runs = await t.rows('battery_runs')
      const added = runs.slice(before)
      const b5 = (await t.rows('batteries')).find((b) => b.label === 'B05')
      t.check('two bench tests: B05 robot 18.4 with idle 13.01 V, the Beak column blank, by the mentor',
        added.length === 2 && added.some((r) => r.battery_id === b5.id && r.kind === 'bench_test' && Number(r.robot_resistance_mohm) === 18.4 && Number(r.voltage_before) === 13.01 && r.resistance_mohm === null && r.member_id === P.mentor.id),
        JSON.stringify(added.map((r) => [r.battery_id.slice(-2), r.kind, r.robot_resistance_mohm, r.voltage_before, r.resistance_mohm])))
      t.eq('B05 now shows its robot reading', await t.text('.ba-card[data-battery="B05"] [data-stat="robot-r"] b'), '18.4')
      await t.press(t.page.locator('[data-loadtests] button', { hasText: 'Check GitHub' }))
      await t.waitFor('[data-loadtest-summary]')
      t.eq('a second check finds both already in the log and offers no import', [await t.text('[data-loadtest-summary]'), await t.count('[data-loadtests] .ba-primary')], ['0 new · 2 already in the log · 1 skipped', 0])
      t.eq('and nothing more was written', (await t.rows('battery_runs')).length, runs.length)
    })

    await t.step('parent', async () => {
      t.as('parent-only')
      await t.open('/batteries', { persona: 'parent', mig: 'all', ready: '.ba-wrap' })
      t.eq('a parent-only account sees no battery cards, against six for a student', await t.count('.ba-card'), 0)
      t.check('and is told why', (await t.bodyText()).includes('for students and staff'))
    })

  },
}
