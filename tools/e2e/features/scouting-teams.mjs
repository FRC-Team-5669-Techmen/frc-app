/**
 * The scouting Teams tab's team table (ScoutingPage.jsx `tab === 'teams'`,
 * src/scouting/TeamTable.jsx), Chromium at 375 and 1440.
 *
 * Every expected number comes from the fixture store (`__fx.rows`), computed
 * here with no app code: the team list, the per-match FUEL median, the super
 * scouts' driver mean and the TRENCH ratio. Two fixtures: the core seed's
 * teams as shipped (the height target), then 40 synthetic teams added to the
 * store (sorting, persistence, and the height a real event's roster gives).
 * This proves rendering and sorting in a real browser on fictional data, not
 * live SQL or a real phone.
 */
const EVENT = '16000000-0000-4000-8000-000000000001'
const ROUTE = `/scouting/${EVENT}`
const SORT_KEY = 'techmen.scouting.teamSort.v1'
const ALL_COLUMNS = 11 // team, name, matches, FUEL, TOWER, trouble, defense, driver, and three capabilities
const PHONE_COLUMNS = 6

// ── store oracles (no app code) ───────────────────────────────────────────
const median = values => {
  const a = [...values].sort((x, y) => x - y)
  if (!a.length) return null
  const i = Math.floor(a.length / 2)
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2
}
const eventRows = rows => rows.filter(r => r.event_id === EVENT)
const storeTeams = rows => [...new Set(eventRows(rows).map(r => r.team_number).filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
const robotObservations = (rows, team) => eventRows(rows).filter(r => r.kind === 'observation' && r.team_number === team && r.payload?.role !== 'super' && r.payload?.source_scope !== 'external')
/** One value per match (the median of its scouts' auto + teleop), then the median of the matches. */
function storeFuel(rows, team) {
  const byMatch = new Map()
  for (const r of robotObservations(rows, team)) {
    const m = r.payload?.match ?? {}
    if (m.auto_fuel === undefined && m.teleop_fuel === undefined) continue
    const k = String(r.match_key).toLowerCase()
    byMatch.set(k, [...(byMatch.get(k) ?? []), (m.auto_fuel ?? 0) + (m.teleop_fuel ?? 0)])
  }
  return median([...byMatch.values()].map(median))
}
/** Sorted by FUEL, highest first; teams with no FUEL last; ties by team number. */
function fuelOrder(rows, dir = 'desc') {
  const teams = storeTeams(rows).map(team => ({ team, v: storeFuel(rows, team) }))
  const known = teams.filter(x => x.v !== null).sort((a, b) => (dir === 'desc' ? b.v - a.v : a.v - b.v) || a.team - b.team)
  return [...known, ...teams.filter(x => x.v === null)].map(x => x.team)
}
const fmt = v => (v === null ? '--' : Number.isInteger(v) ? String(v) : v.toFixed(1))

// ── page readers ──────────────────────────────────────────────────────────
const rowTeams = t => t.page.$$eval('.sc-team-table tbody tr.sc-team-row', trs => trs.map(tr => Number(tr.dataset.team)))
const cell = (t, team, col) => t.text(`.sc-team-table tr.sc-team-row[data-team="${team}"] [data-col="${col}"]`)
const rowButton = (t, team) => t.page.locator(`.sc-team-table tr.sc-team-row[data-team="${team}"] th button`)
async function heightOf(t) {
  const m = await t.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: window.innerHeight }))
  return { ...m, screens: Math.round((m.h / m.vh) * 100) / 100 }
}
async function openTeams(t) {
  await t.press(t.page.locator('.sc-tabs').getByRole('tab', { name: 'Teams', exact: true }))
  await t.waitFor('.sc-team-table')
  await t.settle()
}

// 40 synthetic teams, 7001 to 7040. Team 7001+i scores (i * 7) % 61 per match
// in three matches (two scouts in the first, one counting 4 more), so the
// medians differ and some tie; every fifth team has no observation at all;
// 7003 is observed scoring 0; 7002 and 7004 carry super-scout driver ratings;
// every observed team answers TRENCH yes, yes, no.
export function seedForty({ event, mentor, student2 }) {
  const fx = window.__fx, at = '2026-10-01T22:00:00.000Z'
  let seq = 1
  const row = (kind, team, payload, match = null, member = mentor) => ({ id: `37000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`, event_id: event, member_id: member, kind, team_number: team, match_key: match, payload, version: 1, created_at: at, updated_at: at })
  const rows = []
  for (let i = 0; i < 40; i++) {
    const team = 7001 + i
    rows.push(row('team', team, { name: `Synthetic Robotics ${team}`, source: 'manual', source_url: '', pit_location: `S${i + 1}` }))
    if (i % 5 === 4) continue
    const fuel = team === 7003 ? 0 : (i * 7) % 61
    const answers = ['yes', 'yes', 'no']
    for (let k = 0; k < 3; k++) {
      const match = { auto_fuel: Math.min(fuel, 3), teleop_fuel: fuel - Math.min(fuel, 3), tower: k === 2 ? 'level2' : 'level1', stuck: 'no', defense: 'none' }
      rows.push(row('observation', team, { answers: { trench: answers[k] }, notes: '', source: 'live', video_url: '', match }, `qm${10 + k}`))
      if (k === 0) rows.push(row('observation', team, { answers: { trench: 'yes' }, notes: '', source: 'live', video_url: '', match: { ...match, teleop_fuel: match.teleop_fuel + 4 } }, `qm${10 + k}`, student2))
    }
  }
  for (const [team, ratings] of [[7002, [4, 5]], [7004, [2]]]) {
    ratings.forEach((driver_skill, k) => rows.push(row('observation', team, { role: 'super', alliance: 'red', answers: {}, notes: '', source: 'live', video_url: '', super: { driver_skill } }, `qm${20 + k}`, k ? student2 : mentor)))
  }
  fx.db.scouting_records.push(...rows)
  fx.db.scouting_revisions.push(...rows.map(r => ({ record_id: r.id, event_id: event, member_id: r.member_id, changed_by: r.member_id, version: 1, snapshot: structuredClone(r), created_at: at })))
  fx.save()
  return rows.length
}

export default {
  async run(t) {
    const phone = t.isPhone
    await t.step('the core seed as shipped', async () => {
      t.as('core seed')
      await t.open(ROUTE, { persona: 'student', mig: 'all', reset: true, ready: '.sc-wrap' })
      await t.waitText('Fixture Regional')
      await openTeams(t)
      const store = await t.rows('scouting_records')
      const teams = storeTeams(store)
      const shown = await rowTeams(t)
      t.check('the store holds teams to show', teams.length >= 4, `${teams.length} teams in the store`)
      t.eq('one row per store team, in team-number order by default', shown, teams)
      t.check('a team the store has is a row, with its name', (await cell(t, 1538, 'name')) === 'The Holy Cows', await cell(t, 1538, 'name'))
      t.eq('no evidence card is open by default (0 cards, against 1 after a tap below)', await t.count('.sc-team-card'), 0)
      t.eq(`columns shown: ${phone ? PHONE_COLUMNS : ALL_COLUMNS} of ${ALL_COLUMNS}`, await t.visibleCount('.sc-team-table thead th'), phone ? PHONE_COLUMNS : ALL_COLUMNS)
      t.eq('1538 FUEL is the store median of its matches', await cell(t, 1538, 'fuel'), fmt(storeFuel(store, 1538)))
      t.check('a team with no match fields reads --, never 0', storeFuel(store, 4414) === null && (await cell(t, 4414, 'fuel')) === '--', `4414 FUEL ${await cell(t, 4414, 'fuel')}`)
      t.check('a row has no 0 standing in for a missing value', !(await t.texts('.sc-team-table tr.sc-team-row[data-team="4414"] td')).includes('0'))

      // Expand and collapse one card.
      await t.press(rowButton(t, 1538))
      await t.waitFor('.sc-team-card')
      t.eq('a tap opens exactly that team\'s card (1, against 0 before)', await t.count('.sc-team-card'), 1)
      t.eq('the open card is team 1538', await t.text('.sc-team-card .sc-team-number'), '1538')
      t.eq('the row says it is expanded', await rowButton(t, 1538).getAttribute('aria-expanded'), 'true')
      const cardFuel = await t.page.locator('.sc-team-card .sc-match-cell', { hasText: 'Median FUEL' }).locator('.sc-match-value').textContent()
      t.eq('the card and the row agree on FUEL', cardFuel, await cell(t, 1538, 'fuel'))
      t.check('the open card keeps its actions (Observe, Pit report)', (await t.page.locator('.sc-team-card').getByRole('button', { name: 'Observe', exact: true }).count()) === 1 && (await t.page.locator('.sc-team-card').getByRole('button', { name: 'Pit report', exact: true }).count()) === 1)
      await t.noHScroll('no horizontal page scroll with a card open')
      await t.shot('teams-table-open')
      await t.press(rowButton(t, 1538))
      await t.waitFor('.sc-team-card', { state: 'detached' })
      t.eq('a second tap closes it (0 cards)', await t.count('.sc-team-card'), 0)
      t.eq('the row says it is collapsed', await rowButton(t, 1538).getAttribute('aria-expanded'), 'false')

      // Search narrows rows both ways.
      await t.page.locator('.sc-search input').fill('1538'); await t.settle()
      t.eq('search 1538: one row', await rowTeams(t), [1538])
      await t.page.locator('.sc-search input').fill('no such team'); await t.settle()
      t.check('a search with no match: 0 rows and says so', (await rowTeams(t)).length === 0 && (await t.bodyText()).includes('No teams match this search.'))
      await t.page.locator('.sc-search input').fill(''); await t.settle()
      t.eq('clearing the search brings every row back', (await rowTeams(t)).length, teams.length)

      await t.noHScroll()
      const inner = await t.evaluate(() => { const w = document.querySelector('.sc-team-table-wrap'); return { sw: w.scrollWidth, cw: w.clientWidth } })
      t.check(`the ${phone ? PHONE_COLUMNS : ALL_COLUMNS} shown columns fit without scrolling the table sideways`, inner.sw <= inner.cw, `table ${inner.sw}px in ${inner.cw}px`)
      await t.tapTargets('.sc-team-table tr.sc-team-row', 'rows at least 44px on the phone')
      await t.tapTargets('.sc-team-table button', 'table buttons at least 44px on the phone')
      const h = await heightOf(t)
      const limit = phone ? 3 : 1.5
      t.check(`Teams tab under ${limit} screens with the core seed's ${teams.length} teams`, h.screens < limit, `${h.h}px tall, ${h.screens} screens of ${h.vh}px`)
      await t.shot('teams-table')

      // The light theme (ledger 0019): an open row's gold bar is the fill token, never ink.
      await t.evaluate(() => localStorage.setItem('techmen:theme', 'light'))
      await t.page.reload(); await t.waitText('Fixture Regional')
      await openTeams(t)
      await t.press(rowButton(t, 1538))
      await t.waitFor('.sc-team-card')
      const bar = await t.evaluate(() => ({ shadow: getComputedStyle(document.querySelector('.sc-team-row-open')).boxShadow, fill: getComputedStyle(document.documentElement).getPropertyValue('--gold-fill').trim(), theme: document.documentElement.dataset.theme }))
      t.check('light theme: the open row\'s bar is painted with --gold-fill', bar.theme === 'light' && /rgb\(255, 230, 41\)/.test(bar.shadow) && bar.fill.toUpperCase() === '#FFE629', `${bar.theme}: ${bar.shadow}`)
      await t.shot('teams-table-light')
      await t.evaluate(() => localStorage.removeItem('techmen:theme'))
    })

    await t.step('forty more teams', async () => {
      t.as('40 synthetic teams')
      await t.open(ROUTE, { persona: 'student', mig: 'all', reset: true, ready: '.sc-wrap' })
      await t.waitText('Fixture Regional')
      const added = await t.evaluate(seedForty, { event: EVENT, mentor: '00000000-0000-0000-0000-0000000000b1', student2: '00000000-0000-0000-0000-0000000000c2' })
      t.check('precondition: synthetic rows added to the store', added > 40, `${added} rows`)
      await t.open(ROUTE, { persona: 'student', ready: '.sc-wrap' })
      await t.waitText('Fixture Regional')
      await openTeams(t)
      const store = await t.rows('scouting_records')
      const teams = storeTeams(store)
      t.check('precondition: the store now has 40 more teams', teams.filter(n => n > 7000 && n <= 7040).length === 40, `${teams.length} teams`)
      t.eq('one row per store team (count)', (await rowTeams(t)).length, teams.length)
      t.eq('every store team is a row', await rowTeams(t), teams)

      // Sort by FUEL.
      const desc = fuelOrder(store, 'desc')
      t.check('positive control: the FUEL order is not the team-number order', JSON.stringify(desc) !== JSON.stringify(teams))
      await t.press(t.page.locator('.sc-team-table thead th[data-col="fuel"] button'))
      t.eq('FUEL header: highest store median first, ties by team, empty last', await rowTeams(t), desc)
      t.eq('the FUEL header says descending', await t.page.locator('.sc-team-table thead th[data-col="fuel"]').getAttribute('aria-sort'), 'descending')
      t.eq('only the sorted header carries aria-sort', await t.count('.sc-team-table thead th[aria-sort]'), 1)
      await t.press(t.page.locator('.sc-team-table thead th[data-col="fuel"] button'))
      t.eq('a second click: lowest first, empty still last', await rowTeams(t), fuelOrder(store, 'asc'))
      await t.press(t.page.locator('.sc-team-table thead th[data-col="fuel"] button'))
      t.eq('remembered on this device', await t.evaluate(k => localStorage.getItem(k), SORT_KEY), JSON.stringify({ key: 'fuel', dir: 'desc' }))
      await t.page.reload(); await t.waitText('Fixture Regional')
      await openTeams(t)
      t.eq('after a reload the FUEL sort is still applied', await rowTeams(t), desc)

      // Observed zero against not observed, driver mean and a capability ratio, from the store.
      t.check('an observed 0 FUEL reads 0, a team never observed reads -- (both on one fixture)', storeFuel(store, 7003) === 0 && (await cell(t, 7003, 'fuel')) === '0' && storeFuel(store, 7005) === null && (await cell(t, 7005, 'fuel')) === '--', `7003 ${await cell(t, 7003, 'fuel')}, 7005 ${await cell(t, 7005, 'fuel')}`)
      const supers = team => eventRows(store).filter(r => r.team_number === team && r.payload?.role === 'super').map(r => r.payload.super.driver_skill)
      const mean = a => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '--')
      t.eq('super-scout driver mean for 7002 from the store', await cell(t, 7002, 'driver'), mean(supers(7002)))
      t.eq('no super-scout rating reads --', await cell(t, 7001, 'driver'), mean(supers(7001)))
      const trench = robotObservations(store, 7001).reduce((m, r) => m.set(r.match_key, [...(m.get(r.match_key) ?? []), r.payload.answers.trench]), new Map())
      const decided = [...trench.values()].filter(v => new Set(v).size === 1)
      t.eq('TRENCH yes/decisive matches for 7001 from the store', await cell(t, 7001, 'cap_trench'), `${decided.filter(v => v[0] === 'yes').length}/${decided.length}`)

      await t.noHScroll()
      await t.tapTargets('.sc-team-table tr.sc-team-row', 'rows at least 44px on the phone')
      const rowH = await t.page.$$eval('.sc-team-table tr.sc-team-row', trs => Math.max(...trs.map(tr => tr.getBoundingClientRect().height)))
      t.check('every row is compact (at most 48px)', rowH <= 48, `tallest row ${rowH}px`)
      const h = await heightOf(t)
      t.check(`Teams tab with ${teams.length} teams: about one row per team, not one card per team`, h.h < teams.length * 48 + 1800, `${h.h}px tall, ${h.screens} screens of ${h.vh}px`)
      await t.shot('teams-table-40')
    })
  },
}
