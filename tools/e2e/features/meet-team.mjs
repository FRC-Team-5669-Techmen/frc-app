/**
 * Meet a team (/meet/:eventId, migration 0035, ledger 0026), Chromium at 375
 * and 1440 on fixture mode (src/dev/fixture/features/meetteam.js: Fixture
 * Blitz started two hours ago; Sam holds a Meet a team box in Qualifications
 * 1; Riley logged team 254 with a contact).
 *
 *  - Sam's Home shows Do this now: Meet a team, with his slot time; it opens
 *    the event page, which reads Not done yet and his slot;
 *  - Save with nothing filled names the three required fields and writes 0
 *    rows (against 1 row after a real save);
 *  - a half-typed note survives a reload (the draft) and is still there;
 *  - Sam fills the form (type-in team, chips, follow up, a contact) and
 *    saves: 1 row in the store with his chips, the shared list shows 1678
 *    beside 254, the status reads Done, and Home's Meet a team item is gone
 *    (0, against 1 before);
 *  - search narrows to one team and a miss shows none;
 *  - Sam sees Edit on his own note only (1, against every note for the
 *    mentor); a parent-only account reads the notes but 0 contacts (against
 *    2 for Sam on the same store);
 *  - the mentor reads progress, previews Give everyone a slot (every name,
 *    nothing written), applies it, and every active student ends with a
 *    Meet a team box or a reason;
 *  - before 0035: the page reads Not set up yet and Home shows no Meet a team.
 * Write-side rules are proven by 0035_meet_a_team_rls_test.sql and
 * mutants-0035.
 */
import { P } from './_util.mjs'

const EV = '35000000-0000-4000-8000-000000000001'
const READY = '[data-page="meet-team"] [data-shared]'

export default {
  async run(t) {
    t.as('student: Do this now')
    await t.open('/dashboard', { persona: 'student', mig: 'all', reset: true, ready: '[data-testid="do-this-now"]' })
    const dtn = t.page.locator(`[data-testid="do-this-now"] a[href="/meet/${EV}"]`)
    t.eq('Do this now has one Meet a team item linking to the event', await dtn.count(), 1)
    t.check('it names Meet a team and his slot time', ((await dtn.textContent()) || '').includes('Meet a team') && ((await dtn.textContent()) || '').includes('Your slot:'), await dtn.textContent())
    await t.press(dtn)
    await t.waitFor(READY)
    t.check('the event page says Not done yet', ((await t.text('[data-status]')) || '').includes('Not done yet'), await t.text('[data-status]'))
    t.check('and shows his slot', ((await t.text('[data-myslot]')) || '').includes('Your slot:'), await t.text('[data-myslot]'))
    t.eq('the shared list already holds Riley\'s team 254', await t.count('[data-team="254"]'), 1)
    t.check('the form asks before writing down contacts', ((await t.text('[data-ask]')) || '').includes('Ask before you write down anyone'), await t.text('[data-ask]'))

    t.as('student: validation and draft')
    const mine = async () => (await t.rows('team_connections')).filter((r) => r.member_id === P.student.id)
    await t.press(t.page.locator('[data-form] button[type="submit"]'))
    await t.waitText('Fix the marked fields.')
    t.eq('an empty save names 3 required fields', await t.count('[data-form] .mt-field-error'), 3)
    t.eq('and writes 0 rows', (await mine()).length, 0)
    await t.page.fill('[data-form] input[name="team_number"]', '1678')
    await t.page.fill('[data-form] textarea[name="does_well"]', 'Strategy binder for every match')
    await t.page.reload()
    await t.waitFor(READY)
    t.check('the half-typed note comes back after a reload', (await t.page.inputValue('[data-form] textarea[name="does_well"]')) === 'Strategy binder for every match'
      && ((await t.text('[data-note]')) || '').includes('Draft restored'), await t.page.inputValue('[data-form] textarea[name="does_well"]'))

    t.as('student: save')
    await t.page.fill('[data-form] input[name="team_name"]', 'Citrus Circuits')
    await t.press('[data-form] [data-chip="strategy_team"]')
    await t.press('[data-form] [data-chip="subteams"]')
    await t.press('[data-form] [data-chip="training_material"]')
    await t.page.fill('[data-form] textarea[name="copy_this"]', 'A binder per match with one page per robot')
    await t.press(t.page.locator('[data-form] .mt-chip', { hasText: 'Yes' }))
    await t.page.fill('[data-form] input[name="follow_up_note"]', 'Ask for their binder template')
    await t.press('[data-form] .mt-more summary')
    await t.page.fill('[data-form] input[name="contact_name"]', 'Morgan')
    await t.page.selectOption('[data-form] select[name="contact_role"]', 'student')
    await t.page.fill('[data-form] input[name="contact_email"]', 'morgan@example.org')
    await t.shot('student-form')
    await t.press(t.page.locator('[data-form] button[type="submit"]'))
    await t.waitText('Saved. Thanks for connecting with 1678.')
    const rows = await mine()
    t.eq('1 row in the store for Sam, team 1678, his chips, follow up on', rows.map((r) => [r.team_number, [...(r.org_tags ?? [])].sort().join(','), (r.resource_tags ?? []).join(','), r.follow_up]),
      [[1678, 'strategy_team,subteams', 'training_material', true]])
    t.eq('its contact row holds the email', (await t.rows('team_connection_contacts')).find((c) => c.connection_id === rows[0]?.id)?.email, 'morgan@example.org')
    t.eq('the shared list shows 1678 and 254', await t.count('[data-team]'), 2)
    t.check('the status reads Done, 1 team logged', ((await t.text('[data-status]')) || '').includes('Done · 1 team logged'), await t.text('[data-status]'))
    t.eq('Sam sees Edit on his own note only (1)', await t.count('.mt-note-acts .mt-btn:text-is("Edit")'), 1)
    t.eq('Sam sees both contacts', await t.count('[data-contact]'), 2)
    await t.page.fill('.mt-search', 'binder')
    t.eq('search "binder" leaves one team', await t.count('[data-team]'), 1)
    await t.page.fill('.mt-search', 'zzzz')
    t.eq('a miss leaves none', await t.count('[data-team]'), 0)
    await t.page.fill('.mt-search', '')
    await t.noHScroll()
    await t.shot('student-list')

    await t.open('/dashboard', { persona: 'student', mig: 'all', ready: '.home-wrap' })
    await t.settle()
    t.eq('after logging, Home shows 0 Meet a team items (1 before)', await t.count(`[data-testid="do-this-now"] a[href="/meet/${EV}"]`), 0)

    t.as('parent reads, no contacts')
    await t.open(`/meet/${EV}`, { persona: 'parent', mig: 'all', ready: READY })
    t.eq('the parent reads both teams', await t.count('[data-team]'), 2)
    t.eq('and 0 contacts (2 for Sam)', await t.count('[data-contact]'), 0)
    t.eq('and no form', await t.count('[data-form]'), 0)

    t.as('mentor: progress and give everyone a slot')
    await t.open(`/meet/${EV}`, { persona: 'mentor', mig: 'all', ready: '[data-progress]' })
    t.eq('the mentor sees Edit on every note (2)', await t.count('.mt-note-acts .mt-btn:text-is("Edit")'), 2)
    const students = async () => {
      const roles = await t.rows('member_roles'); const profiles = await t.rows('profiles')
      return profiles.filter((p) => p.approved && (p.status ?? 'active') === 'active' && roles.some((r) => r.member_id === p.id && r.role === 'student')).map((p) => p.id)
    }
    const all = await students()
    const done = Number(await t.text('[data-num="done"] b'))
    t.eq('progress counts Riley and Sam done', done, 2)
    const meetRows = async () => (await t.rows('role_requests')).filter((r) => r.role === 'meet_team' && r.status === 'assigned')
    const before = (await meetRows()).length
    await t.press('[data-fill]')
    await t.waitFor('[data-plan]')
    const listed = await t.count('[data-plan] li')
    t.eq('the preview lists every student without a box (placed or not)', listed, all.length - before)
    t.eq('the preview writes nothing', (await meetRows()).length, before)
    await t.shot('mentor-preview')
    await t.press('[data-apply]')
    await t.waitText('placed')
    const after = await meetRows()
    t.eq('every active student now holds a Meet a team box', all.filter((id) => after.some((r) => r.member_id === id)).length, all.length)
    t.eq('no slot reads 0', Number(await t.text('[data-num="no_slot"] b')), 0)
    await t.noHScroll()
    await t.shot('mentor')

    t.as('before 0035')
    await t.open(`/meet/${EV}`, { persona: 'student', mig: 'none', reset: true, ready: '[data-missing]' })
    t.check('the page reads Not set up yet', ((await t.text('[data-missing]')) || '').includes('Not set up yet'), await t.text('[data-missing]'))
    await t.open('/dashboard', { persona: 'student', mig: 'none', ready: '.home-wrap' })
    await t.settle()
    t.eq('Home shows no Meet a team item without 0035', await t.count('[data-testid="do-this-now"] a[href^="/meet/"]'), 0)
  },
}
