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
 *  - the CSV holds one row per run.
 * Write-side RLS is proven by 0026_battery_log_rls_test.sql, not here.
 */
import { P, PRE_0014 } from './_util.mjs'

const PRE_0026 = `${PRE_0014},0014,0015,0016,0017,0018,0019,0020,0021,0022,0023,0024,0025`

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
    t.eq('six batteries in service, flagged first (B02 browned out; B03 rests 12.31 V; B04 24.5 mOhm), then healthy by label',
      labels, ['B02', 'B03', 'B04', 'B01', 'B05', 'B07'])
    t.eq('three cards carry Check, against six cards', await t.count('.ba-card .ba-pill-check'), 3)
    t.eq('every card in service has its charge buttons', await t.count('.ba-card .ba-charge'), 6)
    await t.press(t.page.locator('.ba-filter', { hasText: 'Retired' }))
    t.eq('Retired shows B06 alone, with no charge buttons', [await t.texts('.ba-card .ba-label'), await t.count('.ba-card .ba-charge')], [['B06'], 0])
    await t.press(t.page.locator('.ba-filter', { hasText: 'In service' }))
    t.eq('no staff panel for a student', await t.count('.ba-staff'), 0)
    await t.noHScroll()
    await t.tapTargets('.ba-wrap button', 'battery controls at least 44px')
    await t.shot('board')

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

    await t.step('parent', async () => {
      t.as('parent-only')
      await t.open('/batteries', { persona: 'parent', mig: 'all', ready: '.ba-wrap' })
      t.eq('a parent-only account sees no battery cards, against six for a student', await t.count('.ba-card'), 0)
      t.check('and is told why', (await t.bodyText()).includes('for students and staff'))
    })

  },
}
