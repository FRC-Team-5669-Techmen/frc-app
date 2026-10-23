/**
 * The human player leaderboard (/human-player, migration 0033, ledger 0025),
 * Chromium at 375 and 1440 on fixture mode. The expected order and the
 * "needs" line are worked out here from the seeded rows (the oracle), not
 * read from src/humanPlayerScore.js.
 *
 *  - before 0033: the page says not set up, and makes no write;
 *  - a student sees Riley over Sam (both with three of each drill; Riley has
 *    double the match FUEL), Casey below as not ranked yet with what Casey
 *    needs; Sam voided match run (70 FUEL) does not lift him; All time ranks
 *    Casey from last season;
 *  - the live match run: the random HUB order is shown before the start; the
 *    clock calls AUTO then SHIFT 1 and SHIFT 2; a make is filed active or
 *    inactive by the HUB state at the tap, so of one make in SHIFT 1 and one in
 *    SHIFT 2 exactly one is active; count by five adds five; the counts land in
 *    the form and save as one row, attributed;
 *  - the live accuracy count stops at the set size and saves made of shots;
 *  - a student has no Edit buttons and no player picker, against both for a
 *    mentor; the student voids their own fresh attempt (1 Void button, against
 *    0 on seeded attempts older than 24 hours);
 *  - a parent-only account reads nothing.
 * Write-side RLS is proven by 0033_human_player_leaderboard_rls_test.sql, not here.
 */
import { P, PRE_0014 } from './_util.mjs'

const PRE_0033 = `${PRE_0014},0014,0015,0016,0017,0018,0019,0020,0021,0022,0023,0024,0025,0026,0027,0028,0029,0030,0031`
const WRITES = /^hp_(log|edit|void)_attempt$/
const inSeason = (d) => d >= '2026-05-01'
const matchMean = (rows, id) => { const v = rows.filter((r) => r.member_id === id && r.drill === 'match' && !r.voided_at && inSeason(r.attempt_date)).map((r) => r.made).sort((a, b) => b - a).slice(0, 3); return v.reduce((a, b) => a + b, 0) / v.length }

export default {
  async run(t) {
    await t.step('before 0033', async () => {
      t.as('mig without 0033')
      await t.open('/human-player', { persona: 'student', mig: PRE_0033, reset: true, ready: '.ba-wrap' })
      await t.waitText('Not set up yet')
      t.eq('the page says not set up, with no leaderboard rows', await t.count('.hp-open'), 0)
      t.eq('no human player write function was called', (await t.calls()).filter((c) => c.kind === 'rpc' && WRITES.test(c.name ?? '')).length, 0)
    })

    t.as('student board')
    await t.open('/human-player', { persona: 'student', mig: 'all', reset: true, ready: '.hp-open' })
    const seeded = await t.rows('hp_attempts')
    t.check('the fixture seeded attempts for the oracle', seeded.length >= 30, `${seeded.length} attempts`)
    const riley = matchMean(seeded, P.student2.id), sam = matchMean(seeded, P.student.id)
    t.check('the oracle: Riley has more match FUEL than Sam, voided run left out', riley > sam, `Riley ${riley}, Sam ${sam}`)
    t.eq('the leaderboard reads Riley, then Sam (with his you tag)', await t.texts('.hp-open .hp-name'), ['Riley', 'Samyou'])
    t.eq('Sam match value on the board leaves out his voided 70', (await t.text('.hp-row[data-player="Sam"] .hp-match')).replace(/^Match\s*/, ''), String(sam))
    t.check('Riley scores 100 or less and more than Sam', Number(await t.text('.hp-row[data-player="Riley"] .hp-score')) > Number(await t.text('.hp-row[data-player="Sam"] .hp-score')))
    t.eq('Casey is listed as not ranked yet (1 of 1), not on the board (0)', [await t.count('[data-unranked="Casey"]'), await t.count('.hp-row[data-player="Casey"]')], [1, 0])
    t.eq('and is told what Casey needs', await t.text('[data-unranked="Casey"] .hp-needs'), 'needs 1 more match run, 3 more rate, 3 more accuracy')
    t.eq('no player picker for a student', await t.count('select[aria-label="Human player"]'), 0)
    await t.noHScroll()
    await t.tapTargets('.hp-wrap button, .hp-wrap select, .hp-wrap input', 'human player controls at least 44px')
    await t.shot('board')

    await t.step('All time', async () => {
      t.as('season switch')
      await t.page.selectOption('select[aria-label="Season"]', 'all')
      await t.settle()
      t.eq('All time ranks Casey (last season sets) and Casey leaves the not-ranked list', [await t.count('.hp-row[data-player="Casey"]'), await t.count('[data-unranked="Casey"]')], [1, 0])
      await t.page.selectOption('select[aria-label="Season"]', { label: 'Offseason 2026' })
      await t.settle()
    })

    await t.step('formula disclosure', async () => {
      t.as('formula')
      await t.press(t.page.locator('.hp-formula summary'))
      const f = await t.text('.hp-formula')
      t.check('the disclosure states the weights and the best 3 of the last 5', f.includes('0.5 × match') && f.includes('best 3'), f.slice(0, 120))
    })

    await t.step('live match run', async () => {
      t.as('match run')
      const before = (await t.rows('hp_attempts')).length
      await t.press(t.page.locator('.hp-form .ba-seg-opts button', { hasText: 'Match run' }))
      await t.press(t.page.locator('.hp-go', { hasText: 'Start a match run' }))
      await t.waitFor('[data-testid="hp-order"]')
      const order = await t.text('[data-testid="hp-order"]')
      t.check('the random HUB order is shown before the start', /(RED|BLUE) HUB INACTIVE FIRST/.test(order), order.slice(0, 60))
      await t.shot('match-ready', { full: false })
      await t.press(t.page.locator('[data-testid="hp-ready"] .hp-go'))
      await t.waitFor('[data-testid="hp-live"]')
      t.eq('the clock starts in AUTO', await t.text('[data-testid="hp-phase"]'), 'AUTO')
      t.eq('both HUBS are active in AUTO: our HUB reads ACTIVE', (await t.text('[data-testid="hp-hub"] b')), 'ACTIVE')
      await t.press(t.page.getByRole('button', { name: 'Count by 5' }))
      await t.press(t.page.getByRole('button', { name: 'Plus 5 made' }))
      await t.press(t.page.getByRole('button', { name: 'Count by 1' }))
      await t.advanceTime(40_000)
      await t.page.waitForFunction(() => document.querySelector('[data-testid="hp-phase"]')?.textContent === 'SHIFT 1')
      const hub1 = await t.text('[data-testid="hp-hub"] b')
      await t.press(t.page.getByRole('button', { name: 'Plus 1 made' }))
      await t.press(t.page.getByRole('button', { name: 'Plus 1 miss' }))
      await t.shot('match-live', { full: false })
      await t.advanceTime(25_000)
      await t.page.waitForFunction(() => document.querySelector('[data-testid="hp-phase"]')?.textContent === 'SHIFT 2')
      const hub2 = await t.text('[data-testid="hp-hub"] b')
      t.check('the HUB alternates between SHIFT 1 and SHIFT 2', hub1 !== hub2 && [hub1, hub2].includes('ACTIVE'), `${hub1} then ${hub2}`)
      await t.press(t.page.getByRole('button', { name: 'Plus 1 made' }))
      t.eq('the tally reads 6 made active, 1 inactive, 1 missed', (await t.text('[data-testid="hp-tally"]')).replace(/\s+/g, ''), '6madeactive1inactive1missed')
      await t.press(t.page.getByRole('button', { name: 'End now' }))
      await t.waitText('Check the counts and save')
      t.eq('the counts land in the form', [await t.page.getByLabel('Made, HUB active').inputValue(), await t.page.getByLabel('Made, HUB inactive').inputValue(), await t.page.getByLabel('Missed').inputValue()], ['6', '1', '1'])
      await t.press(t.page.locator('.hp-save'))
      await t.waitText('Match run logged')
      await t.settle()
      const all = await t.rows('hp_attempts')
      const fresh = all.filter((r) => r.member_id === P.student.id && r.drill === 'match' && r.made === 6)
      t.eq('exactly one new attempt', all.length - before, 1)
      t.check('a match run for Sam, by Sam: 6 active, 1 inactive, 8 shots, HUB order kept, a partial run', fresh.length === 1 && fresh[0].logged_by === P.student.id && fresh[0].made_inactive === 1 && fresh[0].attempted === 8
        && ['red', 'blue'].includes(fresh[0].inactive_first) && fresh[0].seconds < 150, JSON.stringify(fresh[0] ?? null).slice(0, 160))
      t.eq('the fresh attempt has the one Void button', await t.count('.hp-panel .hp-void-btn'), 1)
      await t.press(t.page.locator('.hp-panel .hp-void-btn'))
      await t.waitText('Attempt voided')
      await t.settle()
      const v = (await t.rows('hp_attempts')).find((r) => r.id === fresh[0]?.id)
      t.check('the attempt is void, by Sam, and still in the table', !!v?.voided_at && v.voided_by === P.student.id)
    })

    await t.step('live accuracy', async () => {
      t.as('accuracy count')
      await t.press(t.page.locator('.hp-form .ba-seg-opts button', { hasText: 'Accuracy' }))
      await t.page.getByLabel('Shots in the set').fill('3')
      await t.press(t.page.locator('.hp-go', { hasText: 'Start counting' }))
      await t.waitFor('[data-testid="hp-live"]')
      t.eq('the accuracy count reads 0/3', await t.text('[data-testid="hp-clock"]'), '0/3')
      await t.press(t.page.getByRole('button', { name: 'Plus 1 made' }))
      await t.press(t.page.getByRole('button', { name: 'Plus 1 miss' }))
      await t.press(t.page.getByRole('button', { name: 'Plus 1 made' }))
      await t.waitText('Check the counts and save')
      await t.press(t.page.locator('.hp-save'))
      await t.waitText('Accuracy logged')
      const acc = (await t.rows('hp_attempts')).filter((r) => r.member_id === P.student.id && r.drill === 'accuracy' && r.attempted === 3)
      t.check('the set stopped at 3 shots and saved 2 of 3', acc.length === 1 && acc[0].made === 2 && acc[0].seconds == null, JSON.stringify(acc[0] ?? null).slice(0, 120))
    })

    await t.step('staff', async () => {
      t.as('mentor')
      await t.open('/human-player', { persona: 'mentor', mig: 'all', ready: '.hp-open' })
      t.eq('a mentor has the player picker (1, against 0 for a student)', await t.count('select[aria-label="Human player"]'), 1)
      await t.press(t.page.locator('.hp-row[data-player="Riley"] .hp-open'))
      await t.waitFor('dialog.hp-sheet[open]')
      t.check('and Edit buttons on Riley attempts', (await t.count('dialog.hp-sheet button:text-is("Edit")')) > 0)
      await t.press(t.page.locator('dialog.hp-sheet .ba-btn', { hasText: 'Close' }))
      await t.shot('mentor')
    })

    await t.step('student has no edit', async () => {
      t.as('student sheet')
      await t.open('/human-player', { persona: 'student', mig: 'all', ready: '.hp-open' })
      await t.press(t.page.locator('.hp-row[data-player="Riley"] .hp-open'))
      await t.waitFor('dialog.hp-sheet[open]')
      t.eq('a student has no Edit buttons in the sheet (against more than 0 for a mentor)', await t.count('dialog.hp-sheet button:text-is("Edit")'), 0)
      await t.press(t.page.locator('dialog.hp-sheet .ba-btn', { hasText: 'Close' }))
    })

    await t.step('parent', async () => {
      t.as('parent-only')
      await t.open('/human-player', { persona: 'parent', mig: 'all', ready: '.ba-wrap' })
      t.eq('a parent-only account sees no leaderboard rows, against two for a student', await t.count('.hp-open'), 0)
      t.check('and is told why', (await t.bodyText()).includes('for students and staff'))
    })
  },
}
