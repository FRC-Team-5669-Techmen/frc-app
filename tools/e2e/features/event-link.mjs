/**
 * Zero-setup event link (ledger 0035): /api/tba answered by the fixture's
 * Blue Alliance stand-in (2026cabl, 60 quals, 40 played). Chromium at 375 and
 * 1440. Oracles come from the stand-in and the store.
 *
 *  - the scouting page links Fixture Regional to 2026cabl by date, with no
 *    key typed, and says 40 of 60 quals are played and how many robots in
 *    qualification 41 still need a scout (6 of 6, against 5 of 6 after one
 *    observation);
 *  - New observation opens on qualification 41 with its six robots, red and
 *    blue in schedule order; tapping one fills team and match; the saved
 *    record is that team in qm41; reopening shows that robot "has a scout";
 *  - "Not on the schedule" gives the typed fields back, and a team that is
 *    not on the event list is flagged (0 flags for a team that is, 1 for one
 *    that is not);
 *  - My schedule: a scout's station card opens scouting for this event;
 *  - robot buttons are at least 44 px; no sideways scroll on the phone.
 */
import { P } from './_util.mjs'

const EV = '16000000-0000-4000-8000-000000000001'
const ROUTE = `/scouting/${EV}`
const SID = (n) => `28000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export default {
  async run(t) {
    // The stand-in's schedule, read the way the app reads it.
    const sched = async () => t.evaluate(async () => {
      const f = await fetch('/api/tba?event=2026cabl').then(r => r.json())
      return f.matches.filter(m => /_qm\d+$/.test(m.key)).map(m => ({ n: Number(/_qm(\d+)$/.exec(m.key)[1]), red: m.alliances.red.teams, blue: m.alliances.blue.teams, played: m.alliances.red.score >= 0 }))
    })

    let q41
    await t.step('linked by date', async () => {
      t.as('linked')
      await t.open(ROUTE, { persona: 'student', mig: 'all', reset: true, ready: '[data-scout-page="event"]' })
      await t.waitFor('[data-event-link="2026cabl"]')
      const s = await sched()
      q41 = s.find(m => m.n === 41)
      const line = await t.text('[data-event-link]')
      t.check(`the strip names the event, found by date, with ${s.filter(m => m.played).length} of ${s.length} quals played`, /Beach Blitz/.test(line) && /found by date/.test(line) && line.includes(`${s.filter(m => m.played).length} of ${s.length} quals played`), line)
      t.check('and says all 6 robots in qualification 41 still need a scout', /Qualification 41, 6 of 6 robots need a scout/.test(line), line)
      await t.noHScroll()
    })

    await t.step('pick the robot', async () => {
      t.as('picker')
      await t.press(t.page.getByRole('button', { name: 'New observation' }))
      await t.waitFor('[data-match-picker]')
      const robots = await t.evaluate(() => [...document.querySelectorAll('[data-match-picker] [data-robot]')].map(b => Number(b.dataset.robot)))
      t.eq('the picker opens on qualification 41 with its six robots in order', robots, [...q41.red, ...q41.blue])
      t.eq('no Team number box while the schedule picks', await t.count('dialog input[type="number"]'), 0)
      await t.tapTargets('[data-match-picker] [data-robot]', 'robot buttons are at least 44 px')
      const pick = q41.blue[1]
      await t.press(`[data-match-picker] [data-robot="${pick}"]`)
      t.eq('the tapped robot is selected', await t.evaluate((n) => document.querySelector(`[data-robot="${n}"]`)?.getAttribute('aria-pressed'), pick), 'true')
      await t.page.getByLabel('Notes', { exact: true }).fill('Fast cycles, clean intake.')
      await t.press(t.page.getByRole('button', { name: 'Save observation' }))
      await t.waitFor('dialog[open]', { state: 'detached' })
      await t.press(t.page.getByRole('button', { name: 'Sync now' })).catch(() => {})
      await t.settle()
      const saved = (await t.rows('scouting_records')).filter(r => r.kind === 'observation' && r.member_id === P.student.id && r.event_id === EV && r.payload?.notes === 'Fast cycles, clean intake.')
      t.eq('the saved record is that team in qm41', saved.map(r => [r.team_number, r.match_key]), [[pick, 'qm41']])
      await t.waitText('5 of 6 robots need a scout')
      t.check('the strip now says 5 of 6 (against 6 of 6 before)', /5 of 6 robots need a scout/.test(await t.text('[data-event-link]')), await t.text('[data-event-link]'))
      await t.press(t.page.getByRole('button', { name: 'New observation' }))
      await t.waitFor('[data-match-picker]')
      const cov = await t.evaluate(() => [...document.querySelectorAll('[data-robot]')].map(b => [Number(b.dataset.robot), b.dataset.covered]))
      t.eq(`reopened, only ${pick} has a scout (1 of 6)`, cov.filter(([, c]) => c === 'yes').map(([n]) => n), [pick])
      await t.shot('picker')
    })

    await t.step('not on the schedule', async () => {
      t.as('typed')
      await t.press(t.page.getByRole('button', { name: 'Not on the schedule' }))
      const box = t.page.getByLabel('Team number', { exact: true })
      await box.fill(String(q41.red[0]))
      t.eq('a team on the event list is not flagged', await t.count('[data-off-list]'), 0)
      await box.fill('9999')
      t.eq('a team that is not at the event is flagged', await t.count('[data-off-list]'), 1)
      await t.press(t.page.getByRole('button', { name: 'Pick from the schedule' }))
      t.eq('and the picker comes back', await t.count('[data-match-picker]'), 1)
      await t.press(t.page.getByRole('button', { name: 'Close form' }))
    })

    await t.step('my station opens scouting', async () => {
      t.as('my schedule')
      await t.evaluate(({ me, sid }) => window.__fx.insert('role_requests', { slot_id: sid, member_id: me, role: 'scout', status: 'assigned', created_at: new Date().toISOString() }), { me: P.student.id, sid: SID(1) })
      await t.open(`/my-schedule?event=${EV}`, { persona: 'student', mig: 'all', ready: '.ms-item' })
      const hrefs = await t.evaluate(() => [...document.querySelectorAll('.ms-item[data-kind="station"] [data-tool]')].map(a => a.getAttribute('href')))
      t.check('the scout station card links to this event\'s scouting', hrefs.includes(`/scouting/${EV}`), hrefs.join(', '))
      t.eq('team blocks carry no tool link', await t.count('.ms-item[data-kind="team"] [data-tool]'), 0)
    })
  },
}
