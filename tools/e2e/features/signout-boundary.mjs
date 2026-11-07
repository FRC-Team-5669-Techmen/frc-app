// Item 1, codex-frc-direction. Real routes, fictional people, both themes.
// SQL guards are proved independently in 0046 and its permissive mutants.
import { P } from './_util.mjs'
import { measureLayout, layoutChecks } from '../layout.mjs'
const events = async t => (await t.rows('attendance_events')).filter(e => e.user_id === P.student.id)
const requests = async t => (await t.rows('signout_requests')).filter(r => r.member_id === P.student.id)
async function geometry(t, label) {
  await t.settle()
  const m = await measureLayout(t.page)
  t.check(`${label}: real content and bounded geometry`, Object.values(layoutChecks(m)).every(Boolean), JSON.stringify(m))
  await t.shot(label)
}
async function note(t, value) {
  await t.page.fill('.so-note', value)
  await t.page.check('.so-check input')
  await t.press('.so-submit')
}
export async function run(t) {
  for (const theme of ['dark', 'light']) {
    await t.context.addInitScript(value => localStorage.setItem('techmen:theme', value), theme)
    await t.advanceTime(2 * 60000)
    t.as(`${theme}: build stays open at the FLL tag`)
    await t.open('/checkin-volunteer?loc=fll-room', { persona: 'student', mig: 'all', reset: true, ready: '.checkin-wrap h1' })
    await t.settle()
    const before = (await events(t)).length
    t.eq('build cannot switch without approval: explanation and sign-out link, no switch button',
      [await t.count('.checkin-build-open'), await t.count('a[data-build-signout]'), await t.count('.checkin-build-open button')], [1, 1, 0])
    t.eq('the session stays open with no new event or request', [(await events(t)).length, (await requests(t)).length], [before, 0])
    // Keep the baseline red short and explicit before the dependent flow exists.
    if (!await t.count('a[data-build-signout]')) continue
    t.eq('theme paints correctly', await t.evaluate(() => document.documentElement.dataset.theme), theme)
    await t.tapTargets('a[data-build-signout]', 'build sign-out link is at least 44px')
    await geometry(t, `${theme}-build-open`)
    await t.press('a[data-build-signout]')
    await t.waitFor('.so-form')
    await note(t, 'Assembled the intake and tested wiring')
    await t.waitFor('.checkin-pending')
    t.eq('request keeps the same extended session until approval', [(await events(t)).length, (await requests(t))[0]?.status], [before, 'pending'])
    await geometry(t, `${theme}-pending`)
    await t.open('/signouts', { persona: 'mentor', mig: 'all', ready: '.sop-row' })
    t.eq('the waiting name is a one-tap approval button', await t.count('button.sop-name'), 1)
    await t.tapTargets('button.sop-name', 'the name is at least 44px')
    await geometry(t, `${theme}-queue`)
    await t.press('button.sop-name')
    await t.waitFor(() => !document.querySelector('.sop-row'))
    const after = await events(t)
    t.eq('one name tap writes exactly one OUT with the work note', [after.length - before, after.at(-1)?.type, after.at(-1)?.note], [1, 'out', 'Assembled the intake and tested wiring'])
    await t.advanceTime(2 * 60000)
    await t.open('/checkin-volunteer?loc=fll-room', { persona: 'student', mig: 'all', ready: '.checkin-wrap button' })
    // A fictional precise fix in the FLL room, through the real geofence code.
    await t.context.grantPermissions(['geolocation'])
    await t.context.setGeolocation({ latitude: 34.042134, longitude: -118.086326, accuracy: 10 })
    await t.press('.checkin-wrap button')
    await t.waitFor('.checkin-success')
    t.eq('only after approval can a new FLL session start', (await events(t)).at(-1)?.category, 'volunteer')
    await t.advanceTime(2 * 60000)
    await t.open('/checkin-volunteer?loc=fll-room', { persona: 'student', mig: 'all', ready: '.so-form' })
    const n = (await events(t)).length
    await t.press('.so-submit')
    t.eq('FLL empty note is refused without a write', [(await events(t)).length, await t.count('.so-problem')], [n, 1])
    await note(t, 'Coached an FLL attachment test')
    await t.waitFor('.checkin-checkout')
    t.eq('FLL signs out freely with the note and no pending request', [(await events(t)).length - n, (await events(t)).at(-1)?.note, (await requests(t)).filter(r => r.status === 'pending').length], [1, 'Coached an FLL attachment test', 0])
    await geometry(t, `${theme}-fll-out`)
  }
}
