/**
 * Scouting browser acceptance tests, Chromium at 375 and 1440.
 * The expected records are asserted directly against the fixture store, not
 * against the model used by the UI. This proves rendering and browser storage,
 * not live SQL, Discord, actual venue networking or real phone usability.
 */
import { P } from './_util.mjs'
const EVENT = '16000000-0000-4000-8000-000000000001'
const ROUTE = `/scouting/${EVENT}`
const PRE = Array.from({ length: 21 }, (_, i) => String(i + 1).padStart(4, '0')).join(',')
const own = (records, kind) => records.filter(r => r.member_id === P.student.id && r.kind === kind)

async function tab(t, name) {
  await t.press(t.page.locator('.sc-tabs').getByRole('tab', { name, exact: true }))
  await t.settle()
}
async function choice(t, group, name) {
  await t.press(t.page.getByRole('group', { name: group, exact: true }).getByRole('button', { name, exact: true }))
}
async function connectivity(t, online) {
  await t.page.evaluate(value => {
    localStorage.setItem('__scoutingE2EOffline', value ? '0' : '1')
    window.dispatchEvent(new Event(value ? 'online' : 'offline'))
  }, online)
}

export default {
  async run(t) {
    await t.page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => localStorage.getItem('__scoutingE2EOffline') !== '1' })
    })
    t.as('student event')
    await t.open(ROUTE, { persona: 'student', mig: 'all', reset: true, ready: '.sc-wrap' })
    await t.waitText('Fixture Regional')
    t.check('student reaches scouting', await t.page.getByRole('button', { name: 'New observation', exact: true }).count() === 1)
    t.eq('manager controls hidden for student', await t.page.getByText('Manage event', { exact: true }).count(), 0)
    t.eq('fixture has no invalid seeded rows', await t.evaluate(() => window.__fx.seedProblems.length), 0)
    await t.noHScroll()
    await t.tapTargets('.sc-wrap button, .sc-wrap select, .sc-wrap input', 'student controls at least 44px')
    await t.shot('student-home')

    await t.step('capture persists explicit unknown, failure and zero defaults', async () => {
      t.as('capture observation')
      await t.press(t.page.getByRole('button', { name: 'New observation', exact: true }))
      await t.waitFor('dialog[open]')
      await t.page.getByLabel('Team number', { exact: true }).fill('5669')
      await t.page.getByLabel('Match', { exact: true }).fill('qm7')
      t.eq('new observation starts with no selected answers', await t.count('dialog button[aria-pressed="true"]'), 0)
      await choice(t, 'Passes under the TRENCH', 'Did not see')
      await choice(t, 'Crosses the BUMP', 'No')
      await choice(t, 'Intakes FUEL from the floor', 'Yes')
      await t.page.getByLabel('Notes', { exact: true }).fill('Fixture acceptance: view blocked at trench; bump attempt stopped.')
      await t.tapTargets('dialog button, dialog input, dialog select', 'capture controls at least 44px')
      await t.shot('observation-draft')
      await t.press(t.page.getByRole('button', { name: 'Save observation', exact: true }))
      await t.waitFor('dialog[open]', { state: 'detached' })
      await t.settle()
      const saved = own(await t.rows('scouting_records'), 'observation').find(r => r.match_key === 'qm7')
      t.check('one durable observation reaches the server fixture', !!saved, saved?.id)
      t.eq('Did not see remains distinct from No and Yes', saved?.payload.answers, { trench: 'did_not_see', bump: 'no', ground_intake: 'yes' })
      t.eq('observation attribution comes from the signed-in member', saved?.member_id, P.student.id)
      t.eq('fresh record starts at version one', saved?.version, 1)
      t.eq('one revision exists for submitted observation', (await t.rows('scouting_revisions')).filter(r => r.record_id === saved?.id).length, 1)
    })

    await t.step('draft survives interruption', async () => {
      t.as('draft recovery')
      await t.press(t.page.getByRole('button', { name: 'New observation', exact: true }))
      await t.page.getByLabel('Team number', { exact: true }).fill('1538')
      await t.page.getByLabel('Match', { exact: true }).fill('qm8')
      await t.page.getByLabel('Notes', { exact: true }).fill('Unsubmitted draft survives closing and reload.')
      await t.waitText('Draft saved on this device')
      await t.page.reload()
      await t.waitText('Fixture Regional')
      await t.press(t.page.getByRole('button', { name: 'New observation', exact: true }))
      await t.waitText('Draft restored on this device')
      t.eq('interrupted match draft restored', await t.page.getByLabel('Match', { exact: true }).inputValue(), 'qm8')
      t.eq('interrupted notes restored', await t.page.getByLabel('Notes', { exact: true }).inputValue(), 'Unsubmitted draft survives closing and reload.')
      t.eq('unsubmitted draft created no server observation', own(await t.rows('scouting_records'), 'observation').filter(r => r.match_key === 'qm8').length, 0)
      await t.press(t.page.getByRole('button', { name: 'Close form', exact: true }))
    })

    await t.step('offline queue survives reload and retries exactly once', async () => {
      t.as('simulated offline capture')
      await connectivity(t, false)
      await t.press(t.page.getByRole('button', { name: 'New observation', exact: true }))
      await t.waitText('Draft restored on this device')
      await t.press(t.page.getByRole('button', { name: 'Save observation', exact: true }))
      await t.waitFor('dialog[open]', { state: 'detached' })
      t.eq('offline save does not claim a server record', own(await t.rows('scouting_records'), 'observation').filter(r => r.match_key === 'qm8').length, 0)
      await t.page.reload()
      await t.waitText('Fixture Regional')
      t.check('local queue remains visible after reload', /saved locally|local|waiting/i.test(await t.bodyText()))
      await t.open(ROUTE, { persona: 'student2', mig: 'all', ready: '.sc-wrap' })
      t.check('another account cannot see the local proposal', !(await t.bodyText()).includes('Unsubmitted draft survives closing and reload.'))
      await connectivity(t, true)
      await t.press(t.page.getByRole('button', { name: 'Sync now', exact: true }))
      await t.settle()
      t.eq('another account cannot synchronize the saved operation', own(await t.rows('scouting_records'), 'observation').filter(r => r.match_key === 'qm8').length, 0)
      await t.open(ROUTE, { persona: 'student', mig: 'all', ready: '.sc-wrap' })
      await t.press(t.page.getByRole('button', { name: 'Sync now', exact: true }))
      await t.settle()
      const matches = own(await t.rows('scouting_records'), 'observation').filter(r => r.match_key === 'qm8')
      t.eq('reconnect synchronizes the saved local observation', matches.length, 1)
      await t.press(t.page.getByRole('button', { name: 'Sync now', exact: true }))
      await t.settle()
      t.eq('repeat synchronization does not duplicate the logical record', own(await t.rows('scouting_records'), 'observation').filter(r => r.match_key === 'qm8').length, 1)
      await t.shot('recovered-queue')
    })

    await t.step('team evidence and messages', async () => {
      t.as('teams and evidence')
      await tab(t, 'Teams')
      t.check('team cards expose names and claims', (await t.bodyText()).includes('HighTide'))
      await t.noHScroll()
      await t.tapTargets('.sc-wrap button, .sc-wrap select, .sc-wrap input', 'team controls at least 44px')
      await t.shot('teams')
      await tab(t, 'Pit messages')
      t.check('saved message remains readable despite failed delivery', (await t.bodyText()).includes('Ask whether the intake jam was repaired.'))
      t.check('failed delivery is not presented as delivered', /failed|unavailable/i.test(await t.bodyText()))
      await t.shot('messages')
    })

    await t.step('pick lists and comparison', async () => {
      t.as('pick list')
      await tab(t, 'Pick lists')
      const listText = await t.bodyText()
      t.check('individual list shows four fixture teams', [4414, 1538, 5669, 1323].every(n => listText.includes(String(n))), listText.slice(-500))
      const before = own(await t.rows('scouting_records'), 'pick_list')[0]
      t.eq('own list initially has four unique entries', new Set(before.payload.entries.map(e => e.team)).size, 4)
      await t.noHScroll()
      await t.tapTargets('.sc-wrap button, .sc-wrap select, .sc-wrap input', 'pick-list controls at least 44px')
      await t.shot('pick-lists')
      await t.press(t.page.getByText('Compare three teams', { exact: true }))
      await t.page.getByLabel('Team 1', { exact: true }).selectOption('4414')
      await t.page.getByLabel('Team 2', { exact: true }).selectOption('1538')
      await t.page.getByLabel('Team 3', { exact: true }).selectOption('5669')
      const pairs = t.page.getByRole('group', { name: 'Which team would you pick first?', exact: true })
      await t.press(pairs.nth(0).getByRole('button', { name: /^1538 / }))
      await t.press(pairs.nth(1).getByRole('button', { name: /^5669 / }))
      await t.press(pairs.nth(2).getByRole('button', { name: /^5669 / }))
      await t.press(t.page.getByRole('button', { name: 'Preview order', exact: true }))
      await t.waitText('Proposed list')
      t.eq('preview computes the independently expected order', await t.page.locator('.sc-preview li').allTextContents(), ['5669 · Tier 1 · position 1', '1538 · Tier 1 · position 2', '4414 · Tier 2 · position 1', '1323 · Tier 3 · position 1'])
      t.eq('preview leaves saved list unchanged', own(await t.rows('scouting_records'), 'pick_list')[0].version, before.version)
      await t.press(t.page.getByRole('button', { name: 'Cancel preview', exact: true }))
      t.eq('cancel leaves saved list unchanged', own(await t.rows('scouting_records'), 'pick_list')[0].version, before.version)
      await t.press(t.page.getByRole('button', { name: 'Preview order', exact: true }))
      await t.press(t.page.getByRole('button', { name: 'Apply proposed order', exact: true }))
      await t.settle()
      const after = own(await t.rows('scouting_records'), 'pick_list')[0]
      t.eq('explicit apply commits one new list version', after.version, before.version + 1)
      t.eq('apply preserves unselected team and selected slots', after.payload.entries.map(e => e.team), [5669, 1538, 4414, 1323])
      await t.press(t.page.getByRole('button', { name: 'Master list', exact: true }))
      t.check('master labels Techmen aggregation choice and support', /Techmen rule: median tier and rank/.test(await t.bodyText()) && /2 lists/.test(await t.bodyText()))
      await t.press(t.page.getByRole('button', { name: 'My list', exact: true }))
    })

    await t.step('stale correction is reviewed before replacing server data', async () => {
      t.as('correction conflict')
      await t.open(ROUTE, { persona: 'student', mig: 'all', ready: '.sc-wrap' })
      const before = own(await t.rows('scouting_records'), 'observation').find(r => r.match_key === 'qm7')
      const card = t.page.locator('.sc-evidence-record').filter({ has: t.page.getByRole('heading', { name: '5669 · qm7', exact: true }) })
      await t.press(card.getByRole('button', { name: 'Correct observation', exact: true }))
      await t.page.getByLabel('Notes', { exact: true }).fill('My reviewed correction keeps the blocked view explicit.')
      const concurrent = await t.evaluate(async r => window.__fx.supabase.rpc('scouting_save', {
        p_actor: r.member_id, p_id: r.id, p_event: r.event_id, p_kind: r.kind, p_team: r.team_number, p_match: r.match_key,
        p_payload: { ...r.payload, notes: 'Another tab corrected this observation first.' }, p_expected_version: r.version, p_operation: crypto.randomUUID(),
      }), before)
      t.eq('concurrent fixture writer creates version two', concurrent.data?.version, 2)
      await t.press(t.page.getByRole('button', { name: 'Save observation', exact: true }))
      await t.waitFor('dialog[open]', { state: 'detached' })
      await t.waitText('Review conflict')
      const conflicted = own(await t.rows('scouting_records'), 'observation').find(r => r.id === before.id)
      t.eq('stale edit did not overwrite newer server notes', conflicted.payload.notes, 'Another tab corrected this observation first.')
      await t.press(t.page.getByRole('button', { name: 'Review conflict', exact: true }))
      await t.waitText('Your saved proposal')
      t.check('review displays both proposals', (await t.bodyText()).includes('My reviewed correction keeps the blocked view explicit.') && (await t.bodyText()).includes('Another tab corrected this observation first.'))
      await t.press(t.page.getByRole('button', { name: 'Apply my reviewed proposal', exact: true }))
      await t.settle()
      const reviewed = own(await t.rows('scouting_records'), 'observation').find(r => r.id === before.id)
      t.eq('explicit review commits a third version', reviewed.version, 3)
      t.eq('reviewed correction is the latest evidence', reviewed.payload.notes, 'My reviewed correction keeps the blocked view explicit.')
      t.eq('all three correction snapshots are retained', (await t.rows('scouting_revisions')).filter(r => r.record_id === before.id).length, 3)
      await t.shot('conflict-resolved')
    })

    await t.step('manager control positive and parent negative', async () => {
      t.as('manager')
      await t.open(ROUTE, { persona: 'mentor', mig: 'all', ready: '.sc-wrap' })
      await t.waitText('Manage event')
      t.eq('manager controls shown to mentor', await t.page.getByText('Manage event', { exact: true }).count(), 1)
      await t.shot('mentor')
      t.as('parent-only')
      await t.open(ROUTE, { persona: 'parent', mig: 'all' })
      t.eq('parent-only cannot open a capture form', await t.page.getByRole('button', { name: 'New observation', exact: true }).count(), 0)
      t.eq('parent-only cannot read scouting records in fixture', (await t.evaluate(async () => (await window.__fx.supabase.from('scouting_records').select('*')).data)).length, 0)
      const parentSave = await t.evaluate(async ({ event, actor }) => window.__fx.supabase.rpc('scouting_save', { p_actor: actor, p_id: crypto.randomUUID(), p_event: event, p_kind: 'message', p_team: 4414, p_match: null, p_payload: { text: 'Must be refused', status: 'open', request_delivery: false }, p_expected_version: 0, p_operation: crypto.randomUUID() }), { event: EVENT, actor: P.parent.id })
      t.eq('parent-only fixture RPC refuses capture', parentSave.error?.code, '42501')
      await t.shot('parent-denied')
    })

    await t.step('interactive practice saves incomplete work', async () => {
      await t.open(ROUTE, { persona: 'student', mig: 'all', reset: true, ready: '.sc-wrap' })
      await tab(t, 'Practice')
      await t.waitText('Practice record loaded on this device.')
      const drill = t.page.getByRole('region', { name: 'Interactive practice', exact: true })
      await t.press(drill.getByRole('group').first().getByRole('button', { name: 'Pit claim', exact: true }))
      await t.page.getByLabel('One thing I learned, and one question for my mentor', { exact: true }).fill('Keep the claim separate from a visible match observation.')
      await t.waitText('Practice saved on this device.')
      await t.page.reload(); await t.waitText('Fixture Regional'); await tab(t, 'Practice')
      await t.waitText('Practice record loaded on this device.')
      t.eq('incomplete practice note survives reload', await t.page.getByLabel('One thing I learned, and one question for my mentor', { exact: true }).inputValue(), 'Keep the claim separate from a visible match observation.')
      t.eq('incomplete exercise cannot record a finished mission', await t.page.getByRole('button', { name: 'Record mission practice', exact: true }).isDisabled(), true)
      await t.noHScroll(); await t.shot('practice-mission')
    })

    await t.step('lead previews a shift before assigning it', async () => {
      await t.open(ROUTE, { persona: 'mentor', mig: 'all', reset: true, ready: '.sc-wrap' })
      await t.press(t.page.getByText('Manage event', { exact: true }))
      await t.page.getByLabel('Match schedule', { exact: true }).fill('qm80, 5669\nqm81, 4414')
      await t.press(t.page.getByRole('group', { name: 'Available scouts', exact: true }).getByRole('button').first())
      await t.press(t.page.getByRole('button', { name: 'Preview assignment plan', exact: true }))
      await t.waitText('2 new assignments')
      t.eq('preview writes no assignments', (await t.rows('scouting_records')).filter(r => ['qm80', 'qm81'].includes(r.match_key)).length, 0)
      await t.press(t.page.getByRole('button', { name: 'Save 2 assignments', exact: true }))
      await t.page.waitForFunction(() => window.__fx.rows('scouting_records').filter(r => ['qm80', 'qm81'].includes(r.match_key)).length === 2)
      t.eq('reviewed plan creates exactly two assignments', (await t.rows('scouting_records')).filter(r => ['qm80', 'qm81'].includes(r.match_key)).length, 2)
      await t.noHScroll(); await t.shot('assignment-plan')
    })

    await t.step('missing migration fallback', async () => {
      t.as('pre-0022')
      await t.open(ROUTE, { persona: 'student', mig: PRE, reset: true, ready: '.sc-wrap' })
      await t.waitText('Scouting is not set up yet')
      t.eq('missing schema offers no active capture action', await t.page.getByRole('button', { name: 'New observation', exact: true }).count(), 0)
      await t.shot('not-set-up')
    })
  },
}
