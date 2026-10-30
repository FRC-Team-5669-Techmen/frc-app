/**
 * My schedule (/my-schedule, ledger 0033, migration 0043). Chromium at 375
 * and 1440 on fixture mode; expected values come from the store.
 *
 *  - with nothing assigned, Sam's page says so (no station cards), against
 *    the cards that appear once a mentor's assignments are in the store;
 *  - two roles in one slot are ONE card (Scout + Pit crew, Stands and Pit), a
 *    backup slot is marked Backup, and Sam's ride shows with its driver, car
 *    and meeting place; Next names the earliest of them;
 *  - Riley sees none of Sam's stations and not Sam's ride (0 of 3), against
 *    Sam's 3 on the same store;
 *  - one day tab per competition day; the reminder card offers Turn on;
 *  - before 0043 the stations still show and rides say they are not set up;
 *  - the role board links here; 44px day tabs on the phone, no sideways scroll.
 */
import { P } from './_util.mjs'

const EV = '16000000-0000-4000-8000-000000000001'
// Every migration before 0043 (fixture mig is a list of applied ones).
const BEFORE = Array.from({ length: 42 }, (_, i) => String(i + 1).padStart(4, '0')).join(',')
const SID = (n) => `28000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const HE = '43000000-0000-4000-8000-000000000001', HD = '43000000-0000-4000-8000-000000000002', HI = '43000000-0000-4000-8000-000000000003', HC = '43000000-0000-4000-8000-000000000004'

async function seedSam(t) {
  const slots = (await t.rows('role_slots')).filter((s) => s.event_id === EV).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const s1 = slots.find((s) => s.id === SID(1)), s3 = slots.find((s) => s.id === SID(3))
  const leave = new Date(Date.parse(s1.starts_at) - 90 * 60e3).toISOString()
  await t.evaluate(({ me, s1, s3, day, leave, HE, HD, HI, HC }) => {
    const fx = window.__fx
    fx.insert('role_requests', { slot_id: s1, member_id: me, role: 'scout', status: 'assigned', created_at: new Date().toISOString() })
    fx.insert('role_requests', { slot_id: s1, member_id: me, role: 'pit_crew', status: 'assigned', created_at: new Date().toISOString() })
    fx.insert('role_requests', { slot_id: s3, member_id: me, role: 'team_captain', status: 'backup', created_at: new Date().toISOString() })
    fx.insert('hub_events', { id: HE, title: '0043 trip', timezone: 'America/Los_Angeles', links: {}, info: {}, alert_emails: [], one_minor_rule: true, driver_paperwork_required: false })
    fx.insert('hub_days', { id: HD, event_id: HE, day_date: day, position: 0, title: 'Quals', meet_at: leave, meet_place: 'Bosco Tech front parking lot', venue_closes_at: new Date(Date.parse(leave) + 12 * 3600e3).toISOString(), home_options: [], ask_pit_setup: false, ask_school_ride: true })
    fx.insert('hub_invites', { id: HI, event_id: HE, student_id: me, emails: [] })
    fx.insert('hub_cars', { id: HC, event_id: HE, day_id: HD, run: 'to', driver_label: 'Coach Kim', seats: 4, description: 'White van', leave_by: leave, takes_pickups: false })
    fx.insert('hub_seats', { car_id: HC, day_id: HD, run: 'to', invite_id: HI, via_pickup: false })
  }, { me: P.student.id, s1: SID(1), s3: SID(3), day: s1.day, leave, HE, HD, HI, HC })
  return { s1, s3 }
}

export default {
  async run(t) {
    let seeded
    await t.step('nothing assigned yet', async () => {
      t.as('empty')
      await t.open(`/my-schedule?event=${EV}`, { persona: 'student', mig: 'all', reset: true, ready: '[data-my-schedule]' })
      t.check('the competition is Fixture Regional', (await t.text('.ms-head h1')) === 'Fixture Regional', await t.text('.ms-head h1'))
      t.eq('no station or ride cards for Sam yet', await t.count('.ms-item[data-kind="station"], .ms-item[data-kind="ride"]'), 0)
      t.check('Next says there are no stations yet', /No stations yet/.test(await t.text('[data-now-next]')), await t.text('[data-now-next]'))
    })

    await t.step('stations, backup and ride', async () => {
      t.as('assigned')
      seeded = await seedSam(t)
      await t.open(`/my-schedule?event=${EV}`, { persona: 'student', mig: 'all', ready: '.ms-item' })
      const cards = await t.evaluate(() => [...document.querySelectorAll('.ms-item')].map((li) => ({ kind: li.dataset.kind, tag: li.querySelector('.ms-tag')?.textContent, title: li.querySelector('strong')?.textContent, detail: li.querySelector('.ms-detail')?.textContent ?? '' })))
      const stations = cards.filter((c) => c.kind === 'station'), rides = cards.filter((c) => c.kind === 'ride')
      const evSlots = new Set((await t.rows('role_slots')).filter((s) => s.event_id === EV).map((s) => s.id))
      const mine = (await t.rows('role_requests')).filter((r) => r.member_id === P.student.id && ['assigned', 'backup'].includes(r.status) && evSlots.has(r.slot_id))
      t.eq(`one card per slot: ${new Set(mine.map((r) => r.slot_id)).size} slots from ${mine.length} assignments in the store`, stations.length, new Set(mine.map((r) => r.slot_id)).size)
      t.check('two roles in one slot read as one card, with both places', stations.some((c) => ['Scout + Pit crew', 'Pit crew + Scout'].includes(c.title) && /Qualifications 1/.test(c.detail) && /Stands and Pit|Pit and Stands/.test(c.detail)), JSON.stringify(stations))
      t.check('the backup slot is marked Backup', stations.some((c) => c.tag === 'Backup' && /Alliance selection/.test(c.detail)), JSON.stringify(stations))
      t.check('the ride shows driver, car and where to meet', rides.length === 1 && /Coach Kim · White van/.test(rides[0].detail) && /front parking lot/.test(rides[0].detail), JSON.stringify(rides))
      t.check('Next is the ride (the earliest of Sam\'s items)', /Ride to the venue/.test(await t.text('[data-now-next]')), await t.text('[data-now-next]'))
      const comp = (await t.rows('events')).find((e) => e.id === EV)
      const days = new Set([comp.starts_at, new Date(Date.parse(comp.ends_at) - 1).toISOString()].map((iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })))
      t.eq('one day tab per competition day', await t.count('.ms-days button'), days.size)
      await t.waitFor('[data-remind-cta], [data-remind-on]', { timeout: 8000 }).catch(() => {})
      t.check('the reminder card offers to turn reminders on (or says they are on)', (await t.count('[data-remind-cta]')) + (await t.count('[data-remind-on]')) === 1, '')
      await t.tapTargets('.ms-days button', 'day tabs are at least 44 px tall')
      await t.noHScroll()
      await t.shot('assigned')
    })

    await t.step('only my own', async () => {
      t.as('another student')
      await t.open(`/my-schedule?event=${EV}`, { persona: 'student2', mig: 'all', ready: '[data-my-schedule]' })
      const text = await t.bodyText()
      const leaks = ['Pit crew + Scout', 'Coach Kim', 'White van'].filter((x) => text.includes(x))
      t.check(`Riley sees none of Sam's stations or ride (0 of 3 shown, against 3 on Sam's page)`, leaks.length === 0, leaks.join(', '))
      t.eq('and no station or ride cards of her own (her requests are only asks)', await t.count('.ms-item[data-kind="station"], .ms-item[data-kind="ride"]'), 0)
    })

    await t.step('before 0043', async () => {
      t.as('before 0043')
      // A migration change rebuilds the fixture store from its seed, so Sam's rows go in again.
      await t.open(`/my-schedule?event=${EV}`, { persona: 'student', mig: BEFORE, ready: '[data-my-schedule]' })
      await seedSam(t)
      await t.open(`/my-schedule?event=${EV}`, { persona: 'student', mig: BEFORE, ready: '.ms-item' })
      const n = await t.count('.ms-item[data-kind="station"]')
      t.check('stations still show', n === 2, `${n}; page: ${(await t.bodyText()).slice(0, 300)}`)
      t.check('rides say they are not set up yet', (await t.bodyText()).includes('Rides show here once the update reaches the server'), '')
      t.eq('no ride card', await t.count('.ms-item[data-kind="ride"]'), 0)
    })

    await t.step('linked from the role board', async () => {
      t.as('links')
      await t.open(`/roles/${EV}`, { persona: 'student', mig: 'all', ready: '[data-page="role-board"]' })
      t.eq('My shifts links to My schedule for this event', await t.evaluate(() => document.querySelector('[data-my-schedule-link]')?.getAttribute('href')), `/my-schedule?event=${EV}`)
    })
  },
}
