/**
 * The pick board (/scouting/:eventId/board, ledger 0032, migration 0042).
 * Chromium at 375 and 1440 on fixture mode; oracles come from the store and
 * from the fixture's TBA stand-in, never from the board's own arithmetic.
 *
 *  - a lead saves the event key and pulls results: 60 played qualification
 *    matches land in the shared board, and the board's #1 is among the five
 *    teams with the best average alliance score (a naive measure computed
 *    here, independent of pickRank.js);
 *  - Must pick puts a team on top and Avoid at the bottom, with the automatic
 *    rank still shown; Reset puts it back. A student sees the marks and none
 *    of the controls (0 against the lead's count on the same board);
 *  - alliance selection: seeds from the results, our team placed as captain
 *    3, a pick fills alliance 1 and moves the clock, a captain picked by a
 *    higher captain dissolves that alliance and promotes the next seed, a
 *    decline keeps the clock, undo removes it, and when alliance 3 is up the
 *    board says we are on the clock; a student's page follows the same log;
 *  - before 0042 the board still ranks and says the shared part is not set up;
 *  - laptop: the board fits the screen (no page scroll past it); phone: three
 *    tabs, rows at least 44 px, no horizontal scroll.
 */
const EVENT = '16000000-0000-4000-8000-000000000001'
const URL = `/scouting/${EVENT}/board`

const toList = async (t) => { if (t.isPhone) await t.press(t.page.locator('.pk-tabs button').first()) }

export default {
  async run(t) {
    let lead = {}
    await t.step('lead pulls results', async () => {
      t.as('results')
      await t.open(URL, { persona: 'mentor', mig: 'all', reset: true, ready: '[data-pick-board]' })
      const keyBox = t.page.locator('.pk-keybar input')
      t.eq('a lead with no event key sees the key box', await keyBox.count(), 1)
      await keyBox.fill('2026cabl')
      await t.press(t.page.getByRole('button', { name: 'Save key' }))
      await t.settle()
      await t.press(t.page.getByRole('button', { name: 'Pull results' }))
      await t.waitText('Results pulled')
      await t.settle()
      const board = (await t.rows('scouting_pick_board'))[0]
      const played = (board?.state?.matches?.matches ?? []).filter(m => m.level === 'qm' && m.red.score !== null)
      t.eq('60 played qualification matches are in the shared board, saved by the lead', [played.length, board?.state?.settings?.event_key], [60, '2026cabl'])
      t.check('every played alliance carries HUB points and three TOWER values', played.every(m => typeof m.red.fuel === 'number' && m.red.tower?.length === 3 && typeof m.blue.fuel === 'number'), '')
      // Independent oracle: average alliance score per team.
      const sums = new Map()
      for (const m of played) for (const a of [m.red, m.blue]) for (const team of a.teams) { const s = sums.get(team) ?? [0, 0]; s[0] += a.score; s[1]++; sums.set(team, s) }
      const naive = [...sums].map(([team, [s, n]]) => [team, s / n]).sort((a, b) => b[1] - a[1]).map(x => x[0])
      const order = (await t.texts('.pk-row .pk-team b')).map(Number)
      t.check(`the board's #1 (${order[0]}) is in the top 5 by average alliance score`, naive.slice(0, 5).includes(order[0]), `naive top 5 ${naive.slice(0, 5).join(', ')}`)
      t.check('42 or more teams are ranked', order.length >= 42, `${order.length} rows`)
      t.check('the data line says where the numbers come from', /TBA results: 60 matches/.test(await t.text('[data-data-line]')), await t.text('[data-data-line]'))
      lead = { order, naive }
      await t.noHScroll()
      await t.shot('ranked')
    })

    await t.step('marks', async () => {
      t.as('marks')
      const second = lead.order[1], first = lead.order[0]
      await t.press(`.pk-row[data-team="${second}"] .pk-row-main`)
      await t.press(t.page.getByRole('button', { name: '★ Must pick' }))
      await t.settle()
      let order = (await t.texts('.pk-row .pk-team b')).map(Number)
      t.eq('Must pick puts the second team on top', order[0], second)
      t.check('and the automatic rank stays visible beside it (↓1 for the old #1)', (await t.text(`.pk-row[data-team="${first}"] .pk-auto`))?.includes('↓1'), await t.text(`.pk-row[data-team="${first}"] .pk-auto`))
      await toList(t)
      await t.press(`.pk-row[data-team="${first}"] .pk-row-main`)
      await t.press(t.page.getByRole('button', { name: '✕ Avoid' }))
      await t.settle()
      await toList(t)
      order = (await t.texts('.pk-row .pk-team b')).map(Number)
      t.eq('Avoid sends the old #1 to the bottom', order.at(-1), first)
      const board = (await t.rows('scouting_pick_board'))[0]
      t.eq('the store holds both marks', [board.state.overrides[String(second)]?.flag, board.state.overrides[String(first)]?.flag], ['must', 'avoid'])
      await t.shot('marked')
      const controls = await t.count('.pk-marks button')
      await t.open(URL, { persona: 'student', mig: 'all', ready: '.pk-row' })
      t.eq('a student sees the Must pick mark on top', Number(await t.text('.pk-row .pk-team b')), second)
      await t.press(`.pk-row[data-team="${second}"] .pk-row-main`)
      t.check(`a student has no mark controls (0) where the lead had ${controls}`, controls >= 4 && (await t.count('.pk-marks button')) === 0 && (await t.count('.pk-pick')) === 0, `lead ${controls}, student ${await t.count('.pk-marks button')}`)
      await t.open(URL, { persona: 'mentor', mig: 'all', ready: '.pk-row' })
      for (const team of [first, second]) {
        await toList(t)
        await t.press(`.pk-row[data-team="${team}"] .pk-row-main`)
        await t.press(t.page.getByRole('button', { name: 'Reset to automatic' }))
        await t.settle()
      }
      await toList(t)
      t.eq('Reset to automatic puts the data order back', (await t.texts('.pk-row .pk-team b')).map(Number).slice(0, 3), lead.order.slice(0, 3))
    })

    await t.step('alliance selection', async () => {
      t.as('selection')
      await t.press(t.page.getByRole('button', { name: 'Start alliance selection' }))
      await t.waitFor('.pk-seeds select')
      const seedVals = await t.evaluate(() => [...document.querySelectorAll('.pk-seeds select')].map(s => Number(s.value)))
      // Put us at captain 3.
      await t.page.locator('.pk-seeds select').nth(2).selectOption('5669')
      await t.press(t.page.getByRole('button', { name: 'Start selection' }))
      await t.waitFor('[data-clock]')
      await t.settle()
      await toList(t)
      let sel = (await t.rows('scouting_pick_board'))[0].state.selection
      t.eq('the seeds start from the results ranking, with us placed at captain 3', [sel.seeds.slice(0, 2), sel.seeds[2], sel.log.length, sel.version], [seedVals.slice(0, 2), 5669, 0, 1])
      t.check('the clock says Alliance 1 is picking', /Alliance 1 is picking/.test(await t.text('[data-clock]')), await t.text('[data-clock]'))
      t.check('and our next pick is 2 away', /Our next pick in 2/.test(await t.text('[data-clock]')), await t.text('[data-clock]'))
      t.check('the odds column shows (There)', (await t.text('.pk-legend'))?.includes('There'), await t.text('.pk-legend'))
      const firstPick = Number(await t.text('.pk-row:not(.pk-taken) .pk-team b'))
      await t.press('.pk-row:not(.pk-taken) .pk-pick')
      await t.settle()
      sel = (await t.rows('scouting_pick_board'))[0].state.selection
      t.eq('one tap records Alliance 1 picking the top team', sel.log, [{ type: 'pick', team: firstPick }])
      t.check('the clock moves to Alliance 2', /Alliance 2 is picking/.test(await t.text('[data-clock]')), await t.text('[data-clock]'))
      t.check('the picked team leaves the list', !(await t.texts('.pk-row .pk-team b')).map(Number).includes(firstPick), '')
      // Alliance 2 picks the captain of alliance 4: the alliances below move up and the next seed becomes captain 8.
      const cap4 = sel.seeds[3]
      // Captains are the first 8 seeds that were not picked away (a pick of a lower captain dissolves that alliance).
      const seed9 = sel.seeds.filter(x => x !== firstPick && x !== cap4)[7]
      await toList(t)
      await t.press(`.pk-row[data-team="${cap4}"] .pk-pick`)
      await t.settle()
      const ally = await t.evaluate(() => [...document.querySelectorAll('.pk-ally li')].map(li => [...li.querySelectorAll('.pk-slot')].map(b => b.textContent.trim()).filter(Boolean)))
      t.eq('a captain picked by a higher captain: alliance 2 has them, and the next seed not on an alliance is the new captain 8', [ally[1], ally[7][0]], [[String(sel.seeds[1]), String(cap4)], String(seed9)])
      t.check('now we are on the clock', /WE ARE ON THE CLOCK/.test(await t.text('[data-clock]')), await t.text('[data-clock]'))
      // A decline keeps the clock; undo takes it back.
      await toList(t)
      const decliner = Number(await t.text('.pk-row:not(.pk-taken) .pk-team b'))
      await t.press(`.pk-row[data-team="${decliner}"] .pk-row-main`)
      await t.press(t.page.getByRole('button', { name: `${decliner} declined` }))
      await t.settle()
      sel = (await t.rows('scouting_pick_board'))[0].state.selection
      t.eq('a decline is logged and the clock stays on us', [sel.log.at(-1), /WE ARE ON THE CLOCK/.test(await t.text('[data-clock]'))], [{ type: 'decline', team: decliner }, true])
      await toList(t)
      t.check('a declined team cannot be picked: its pick button is gone', (await t.count(`.pk-row[data-team="${decliner}"] .pk-pick`)) === 0, '')
      await t.press(t.page.getByRole('button', { name: 'Undo last' }))
      await t.settle()
      sel = (await t.rows('scouting_pick_board'))[0].state.selection
      t.eq('Undo removes the decline', [sel.log.length, sel.log.at(-1)?.type], [2, 'pick'])
      t.check('the best team for us is named on the clock', /Best for us: \d+/.test(await t.text('[data-clock]')), await t.text('[data-clock]'))
      await t.shot('live')
      // A student's device follows the same log.
      await t.open(URL, { persona: 'student', mig: 'all', ready: '[data-clock]' })
      const studentAlly = await t.evaluate(() => [...document.querySelectorAll('.pk-ally li')].map(li => [...li.querySelectorAll('.pk-slot')].map(b => b.textContent.trim()).filter(Boolean)))
      t.eq('a student sees the same alliances', [studentAlly[0], studentAlly[1]], [[String(sel.seeds[0]), String(firstPick)], [String(sel.seeds[1]), String(cap4)]])
      t.eq('and cannot record picks (0 pick buttons, no Undo)', [await t.count('.pk-pick'), await t.count('.pk-clock-actions button')], [0, 0])
    })

    await t.step('layout', async () => {
      t.as('layout')
      await t.open(URL, { persona: 'mentor', mig: 'all', ready: '.pk-row' })
      if (t.isPhone) {
        t.eq('three tabs on the phone', await t.visibleCount('.pk-tabs button'), 3)
        t.eq('one column shown at a time', await t.visibleCount('.pk-col'), 1)
        await t.tapTargets('.pk-row-main', 'team rows are at least 44 px tall')
        await t.tapTargets('.pk-pick', 'pick buttons are at least 44 px tall')
        await t.press(t.page.getByRole('button', { name: 'Alliances' }))
        t.eq('the Alliances tab shows the alliances', await t.visibleCount('.pk-ally li'), 8)
      } else {
        const m = await t.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, cols: [...document.querySelectorAll('.pk-col')].filter(c => getComputedStyle(c).display !== 'none').length }))
        t.check('on a laptop all three columns show and the board fits the screen (no page scroll past it)', m.cols === 3 && m.sh <= m.ih + 120, `${m.cols} columns, page ${m.sh}px for a ${m.ih}px window`)
      }
      await t.noHScroll()
      await t.shot('layout')
    })

    await t.step('rate teams on a phone', async () => {
      t.as('rate')
      await t.open(`/scouting/${EVENT}`, { persona: 'exempt', mig: 'all', ready: '.sc-wrap' })
      await t.press(t.page.getByRole('tab', { name: 'Pick lists' }))
      await t.waitFor('[data-rate]')
      t.check('a scout with unrated teams opens on Rate teams, with a link to the pick board', (await t.count('[data-board-link]')) === 1, '')
      const first = Number(await t.text('.sc-rate-team b'))
      const before = await t.text('[data-rate-progress]')
      await t.press(t.page.locator('.sc-rate-buttons button').first())
      await t.settle()
      const next = Number(await t.text('.sc-rate-team b'))
      t.check('one tap rates a team Tier 1 and shows the next team', next !== first && (await t.text('[data-rate-progress]')) !== before, `${first} -> ${next}; ${before} -> ${await t.text('[data-rate-progress]')}`)
      await t.tapTargets('.sc-rate-buttons button', 'the four rating buttons are at least 44 px tall')
      await t.press(t.page.getByRole('button', { name: 'Save my ratings' }))
      await t.settle()
      const lists = (await t.rows('scouting_records')).filter(r => r.kind === 'pick_list')
      t.check(`the rating is saved in this scout's list: ${first} in Tier 1`, lists.some(l => (l.payload?.entries ?? []).some(e => e.team === first && e.tier === 1)), '')
    })

    await t.step('before 0042', async () => {
      t.as('before 0042')
      await t.open(URL, { persona: 'mentor', mig: '0041', ready: '[data-pick-board]' })
      t.check('the board says the shared part is not set up', (await t.bodyText()).includes('not set up on the server yet'), '')
      t.check('and still ranks the teams it has', (await t.count('.pk-row')) >= 1, `${await t.count('.pk-row')} rows`)
      await t.open(URL, { persona: 'mentor', mig: 'all', ready: '[data-pick-board]' })
      t.check('with 0042 applied the note is gone (positive control)', !(await t.bodyText()).includes('not set up on the server yet'), '')
    })
  },
}
