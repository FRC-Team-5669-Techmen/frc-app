/**
 * The robot match log (/robot/matches and /robot/matches/:id, migration 0038,
 * ledger 0028), Chromium at 375 and 1440 on fixture mode. Expected lists and
 * numbers are computed here from the store (the oracle), not read from
 * src/robotMatches.js.
 *
 *  - before 0038: not set up, and no robot_match function is called;
 *  - a student sees every match newest first, filters by driver, compares two
 *    (best marked), reads trends per driver and battery, and has no import
 *    panel and no edit form (0, against 1 each for a mentor);
 *  - the detail: scorecard, battery by phase, not-ready reasons, timeline,
 *    the robot file kept whole (an unknown field included);
 *  - a mentor pulls from GitHub (stubbed): one file already imported, one not
 *    readable, one that joins the Match Sim record, one whose typed driver
 *    must be chosen first; Import writes one new row and merges one, logs a
 *    battery run and drive time per file, and a second pull imports nothing;
 *  - a dropped file imports; a mentor's pit note saves;
 *  - a parent-only account reads nothing.
 * Write-side RLS is proven by 0038_robot_match_log_rls_test.sql and
 * tools/sql-harness/mutants-0038.mjs, not here.
 */
import { P, PRE_0014 } from './_util.mjs'
import { robotFile } from '../../../src/dev/fixture/features/robotmatches.js'

const PRE_0038 = `${PRE_0014},${Array.from({ length: 24 }, (_, i) => String(14 + i).padStart(4, '0')).join(',')}`
const laWall = (iso, plusMs = 0) => new Date(Date.parse(iso) + plusMs).toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' }).replace(' ', 'T')
const fileName = (wall, kind, n) => `${wall.slice(0, 10).replace(/-/g, '')}-${wall.slice(11, 19).replace(/:/g, '')}_${kind}_${n}.json`
const ballsIn = (m) => m.scorer_balls_in ?? ((m.auto_balls ?? 0) + (m.open_balls ?? 0))

export default {
  async run(t) {
    await t.step('before 0038', async () => {
      t.as('mig without 0038')
      await t.open('/robot/matches', { persona: 'student', mig: PRE_0038, reset: true, ready: '.ba-wrap' })
      await t.waitText('Not set up yet')
      t.eq('the page says not set up, with no match list', await t.count('.rm-item'), 0)
      t.eq('no robot_match function was called', (await t.calls()).filter((c) => c.kind === 'rpc' && /^robot_match/.test(c.name ?? '')).length, 0)
    })

    t.as('student log')
    await t.open('/robot/matches', { persona: 'student', mig: 'all', reset: true, ready: '.rm-item' })
    const store = await t.rows('robot_matches')
    const newest = [...store].sort((a, b) => b.started_at.localeCompare(a.started_at))
    t.check('the fixture seeded robot files and a Match Sim row for the oracle', store.length >= 5 && store.some((m) => m.source === 'sim_page'), `${store.length} rows`)
    t.eq('every match is listed, newest first', await t.texts('.rm-item .rm-label'), newest.map((m) => m.match_label))
    const p2 = store.find((m) => m.match_label === 'practice 2')
    t.eq('practice 2 shows the scorer count as balls in (24), not the robot count', await t.page.locator('.rm-item[data-match="practice 2"] .rm-nums b').first().textContent(), String(ballsIn(p2)))
    t.eq('a student has no import panel (0, against 1 for a mentor below)', await t.count('.rm-import'), 0)
    await t.noHScroll()
    await t.tapTargets('.rm-wrap .rm-tab, .rm-wrap .rm-pick, .rm-wrap .rm-open', 'log controls at least 44px')
    await t.shot('log')

    await t.step('filter by driver', async () => {
      t.as('filter')
      await t.page.getByLabel('Driver', { exact: true }).selectOption({ label: 'Riley' })
      await t.settle()
      const want = newest.filter((m) => m.driver_id === P.student2.id).map((m) => m.match_label)
      t.eq(`Driver Riley shows exactly Riley's ${want.length} matches (of ${store.length})`, await t.texts('.rm-item .rm-label'), want)
      await t.press(t.page.locator('.rm-filter-clear'))
      await t.settle()
      t.eq('Clear filters shows every match again', await t.count('.rm-item'), store.length)
    })

    await t.step('compare', async () => {
      t.as('compare')
      for (const l of ['practice 1', 'practice 2']) {
        await t.press(t.page.locator(`.rm-item[data-match="${l}"] .rm-pick`))
        await t.page.waitForFunction((sel) => document.querySelector(sel)?.checked === true, `.rm-item[data-match="${l}"] .rm-pick input`)
      }
      t.eq('two ticked: the bar reads Compare 2', await t.text('[data-compare]'), 'Compare 2')
      await t.press(t.page.locator('[data-compare]'))
      await t.waitFor('[data-compare-table]')
      const p1 = store.find((m) => m.match_label === 'practice 1')
      const cells = await t.texts('tr[data-row="ballsIn"] td')
      t.eq('Balls in row reads practice 1 then practice 2, from the store', cells, [String(ballsIn(p1)), String(ballsIn(p2))])
      t.eq('the higher one is marked best (1 cell)', await t.texts('tr[data-row="ballsIn"] td.rm-best'), [String(Math.max(ballsIn(p1), ballsIn(p2)))])
      t.eq('Brownouts: the lower is best', await t.texts('tr[data-row="brownouts"] td.rm-best'), [String(Math.min(p1.brownouts, p2.brownouts))])
      await t.noHScroll('the compare table scrolls in its own box, not the page')
      await t.shot('compare')
    })

    await t.step('trends', async () => {
      t.as('trends')
      await t.press(t.page.locator('.rm-tab', { hasText: 'Trends' }))
      await t.waitFor('[data-trends="drivers"]')
      const drivers = [...new Set(store.map((m) => m.driver_id).filter(Boolean))].length
      t.eq(`one card per driver with a match (${drivers})`, await t.count('[data-trends="drivers"] .rm-trend'), drivers)
      const riley = store.filter((m) => m.driver_id === P.student2.id).length
      t.check(`Riley's card counts ${riley} matches`, (await t.text('[data-driver="Riley"] .rm-when')).startsWith(`${riley} match`), await t.text('[data-driver="Riley"] .rm-when'))
      const packs = [...new Set(store.map((m) => m.battery_id).filter(Boolean))].length
      t.eq(`one card per battery used (${packs})`, await t.count('[data-trends="batteries"] .rm-trend'), packs)
      const b02min = Math.min(...store.filter((m) => m.battery_id === '26000000-0000-4000-8000-000000000002' && m.battery_min !== null).map((m) => Number(m.battery_min)))
      t.eq('B02 lowest voltage is its lowest run minimum', await t.page.locator('[data-battery="B02"] .rm-nums b').first().textContent(), b02min.toFixed(2))
      t.eq('a sparkline per driver card with 2+ matches', await t.count('[data-driver="Riley"] svg.rm-spark'), 2)
      await t.shot('trends')
    })

    await t.step('detail', async () => {
      t.as('student detail')
      const p1 = store.find((m) => m.match_label === 'practice 1')
      await t.open(`/robot/matches/${p1.id}`, { persona: 'student', mig: 'all', ready: '[data-scorecard]' })
      t.eq('the title is the match label', await t.text('h1[data-label]'), 'practice 1')
      t.eq('battery by phase: one bar per phase in the file', await t.count('[data-battery-phases] .rm-bar'), p1.raw.phases.length)
      const reasons = Object.entries(p1.raw.scoring.notReadySecondsByReason).filter(([k, v]) => k !== '-' && v > 0)
      t.eq('not-ready reasons: one bar per reason over 0 s, the "-" placeholder left out', await t.count('[data-not-ready] .rm-bar'), reasons.length)
      t.eq('the timeline lists every event in the file', await t.count('[data-timeline] li'), p1.raw.events.length)
      await t.press(t.page.locator('[data-raw] summary'))
      t.check('the robot file is kept whole, the unknown futureField included', (await t.text('[data-raw] pre')).includes('futureField'))
      t.eq('a student has no edit form (0, against 1 for a mentor below)', await t.count('[data-edit]'), 0)
      await t.noHScroll()
      await t.shot('detail')
    })

    await t.step('mentor pulls from GitHub', async () => {
      t.as('mentor import')
      const sim = store.find((m) => m.source === 'sim_page')
      const done = store.find((m) => m.match_label === 'practice 1')
      const simWall = laWall(sim.started_at, 60_000)
      const mergeName = fileName(simWall, 'practice', 7)
      const pickWall = laWall(sim.started_at, -4 * 3600e3)
      const pickName = fileName(pickWall, 'practice', 8)
      const files = {
        [done.file_name]: done.raw,
        [mergeName]: robotFile({ startedAt: simWall, robotMatch: 7, alliance: 'blue', driver: 'Riley', battery: 'B05', open: 14, auto: 1 }),
        [pickName]: robotFile({ startedAt: pickWall, robotMatch: 8, driver: 'Sam S', battery: 'B01', autoName: 'Mystery auto', open: 9 }),
        'broken_9.json': { hello: 'world' },
      }
      await t.page.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.keys(files).map((name) => ({ type: 'file', name, download_url: `https://raw.githubusercontent.com/x/y/main/match-data/matches/${name}` }))) }))
      await t.page.route('https://raw.githubusercontent.com/**', (r) => { const n = decodeURIComponent(r.request().url().split('/').pop()); return files[n] ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(files[n]) }) : r.fulfill({ status: 404, body: '' }) })
      await t.open('/robot/matches', { persona: 'mentor', mig: 'all', ready: '.rm-item' })
      t.eq('a mentor has the import panel (1, against 0 for a student)', await t.count('.rm-import'), 1)
      if (!(await t.page.locator('.rm-import').evaluate((d) => d.open))) await t.press(t.page.locator('.rm-import summary'))
      const before = { rows: (await t.rows('robot_matches')).length, runs: (await t.rows('battery_runs')).length, drive: (await t.rows('drive_sessions')).length }
      await t.press(t.page.locator('[data-pull]'))
      await t.waitFor('[data-plan="new"]')
      t.eq('the already-imported file is not offered (GitHub list 4, new 2, unreadable 1)', [await t.count('[data-plan="new"]'), await t.count('[data-plan="error"]')], [2, 1])
      t.check('the file near the Match Sim record says it joins it', (await t.text(`[data-file="${mergeName}"]`)).includes('Joins the Match Sim record'))
      t.check('the unknown auto is offered as a new routine', (await t.count(`[data-file="${pickName}"] [data-add-routine]`)) === 1)
      t.eq('Import waits for the typed driver "Sam S" to be chosen', await t.page.locator('[data-import]').isDisabled(), true)
      await t.page.locator(`[data-file="${pickName}"] select[data-role="driver"]`).selectOption({ label: 'Sam' })
      await t.page.locator(`[data-file="${pickName}"] [data-add-routine]`).check()
      t.eq('after choosing, Import is enabled', await t.page.locator('[data-import]').isDisabled(), false)
      await t.tapTargets('.rm-import button, .rm-import select', 'import controls at least 44px')
      await t.shot('import-preview')
      await t.press(t.page.locator('[data-import]'))
      await t.waitText('2 of 2 saved')
      await t.settle()
      const rows = await t.rows('robot_matches')
      t.eq('one new row and one merge: rows grow by exactly 1', rows.length - before.rows, 1)
      const merged = rows.find((m) => m.id === sim.id)
      t.check('the Match Sim row kept its id and now carries the file (source both)', merged?.source === 'both' && merged?.file_name === mergeName && merged?.scorer_balls_in === sim.scorer_balls_in, JSON.stringify({ s: merged?.source, f: merged?.file_name }))
      const picked = rows.find((m) => m.file_name === pickName)
      t.check('the chosen driver is Sam, and the new routine is linked', picked?.driver_id === P.student.id && (await t.rows('auto_routines')).some((r) => r.id === picked?.routine_id && r.name === 'Mystery auto'), JSON.stringify({ d: picked?.driver_id, r: picked?.routine_id }))
      t.eq('one battery run per file (2)', (await t.rows('battery_runs')).length - before.runs, 2)
      t.eq('one drive session per file (2)', (await t.rows('drive_sessions')).length - before.drive, 2)
      await t.press(t.page.locator('[data-pull]'))
      await t.settle()
      t.eq('a second pull offers nothing new (0 new plans)', await t.count('[data-plan="new"]'), 0)
      t.eq('and writes nothing', (await t.rows('robot_matches')).length, rows.length)
    })

    await t.step('drop a file', async () => {
      t.as('mentor drop')
      const wall = laWall(store.find((m) => m.source === 'sim_page').started_at, -9 * 3600e3)
      const name = fileName(wall, 'auto_test', 11)
      const before = (await t.rows('robot_matches')).length
      await t.page.locator('input[data-drop]').setInputFiles([{ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(robotFile({ kind: 'auto_test', startedAt: wall, robotMatch: 11, autoName: 'Two-piece left', duration: 20 }))) }])
      await t.waitFor(`[data-file="${name}"]`)
      await t.press(t.page.locator('[data-import]'))
      await t.waitText('1 of 1 saved')
      await t.settle()
      t.eq('the dropped auto test is one new row', (await t.rows('robot_matches')).length - before, 1)
    })

    await t.step('mentor note', async () => {
      t.as('mentor edit')
      const p2now = (await t.rows('robot_matches')).find((m) => m.match_label === 'practice 2')
      await t.open(`/robot/matches/${p2now.id}`, { persona: 'mentor', mig: 'all', ready: '[data-scorecard]' })
      t.eq('a mentor has the edit form (1)', await t.count('[data-edit]'), 1)
      await t.press(t.page.locator('[data-edit] summary'))
      await t.page.locator('textarea[data-note="notes_pit"]').fill('Swap the main breaker lead before qm1.')
      await t.press(t.page.locator('[data-save]'))
      await t.waitText('Saved.')
      t.eq('the pit note is in the store', (await t.rows('robot_matches')).find((m) => m.id === p2now.id)?.notes_pit, 'Swap the main breaker lead before qm1.')
    })

    await t.step('parent', async () => {
      t.as('parent-only')
      await t.open('/robot/matches', { persona: 'parent', mig: 'all', ready: '.ba-wrap' })
      t.eq('a parent-only account sees no matches, against several for a student', await t.count('.rm-item'), 0)
      t.check('and is told why', (await t.bodyText()).includes('for students and staff'))
    })
  },
}
