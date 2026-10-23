/**
 * The role board v2 (/roles/:eventId, migration 0031, ledger 0023), Chromium
 * at 375 and 1440 on fixture mode. The flow Mr. Pina runs at the 3:10 PM
 * meeting before Beach Blitz:
 *
 *  - a student reads the one-line explainer and an empty My shifts;
 *  - the student asks for 3 boxes and takes 1 back: 2 requests in the store
 *    (3 before the take back), each box reads "You: Asked";
 *  - a student sees no staff buttons in a box (0, against 3 per person for
 *    the mentor on the same box);
 *  - the mentor assigns 7 scouts to a box needing 6 and marks 2 backups: the
 *    sheet reads "7 of 6 assigned · 2 backup · 0 asked", the grid "7/6", the
 *    store 7 assigned and 2 backup;
 *  - the mentor puts himself in as drive coach and assigns himself: no
 *    browser dialog, no error, status assigned, and it shows in his My shifts;
 *  - the mentor adds Riley, who did not ask, as a backup team captain;
 *  - the mentor assigns Sam as scout; Sam then reads it in My shifts and
 *    cannot take it back (the big button is gone, the locked line shows).
 * Write-side rules are proven by 0031_role_board_v2_rls_test.sql and
 * mutants-0031; the 28-member concurrency by tools/sql-harness/sim-0031.mjs.
 */
import { P } from './_util.mjs'

const EV = '16000000-0000-4000-8000-000000000001'
const SID2 = '28000000-0000-4000-8000-000000000002'
const SID3 = '28000000-0000-4000-8000-000000000003'
const cell = (label, role) => `[data-cell="${label}|${role}"]`

export default {
  async run(t) {
    let dialogs = 0
    const onDialog = (d) => { dialogs += 1; d.dismiss().catch(() => {}) }

    t.as('student asks')
    await t.open(`/roles/${EV}`, { persona: 'student', mig: 'all', reset: true, ready: '[data-page="role-board"] .rb-grid' })
    t.check('the one-line explainer is at the top', ((await t.text('[data-explainer]')) || '').includes('Tap a box, then I can do this. Ask for as many as you want. Mr. Pina assigns; backups cover emergencies.'), await t.text('[data-explainer]'))
    t.check('My shifts is there and empty for Sam', ((await t.text('[data-myshifts]')) || '').includes('Nothing assigned yet'), await t.text('[data-myshifts]'))
    const ask = async (label, role) => {
      await t.press(cell(label, role))
      await t.waitFor('[data-sheet]')
      await t.press(t.page.locator('[data-sheet] .rb-big', { hasText: 'I can do this' }))
      await t.waitText('You asked for')
      await t.waitFor('[data-sheet] .rb-big-off')
      await t.press(t.page.locator('[data-sheet] .rb-btn', { hasText: 'Close' }))
    }
    await ask('Qualifications 1', 'scout')
    await ask('Qualifications 1', 'pit_crew')
    await ask('Qualifications 2', 'battery_captain')
    const mine = async () => (await t.rows('role_requests')).filter((r) => r.member_id === P.student.id)
    t.eq('3 requests in the store after 3 taps', (await mine()).length, 3)
    t.eq('each box Sam asked for reads You: Asked (3 of 3)', await t.count('.rb-cell .rb-chip-asked'), 3)
    await t.press(cell('Qualifications 1', 'scout'))
    await t.waitFor('[data-sheet]')
    t.eq('a student sees 0 staff buttons in a box', await t.count('[data-sheet] .rb-act'), 0)
    t.check('the box reads its counts in words', ((await t.text('[data-countline]')) || '') === '0 of 6 assigned · 2 asked', await t.text('[data-countline]'))
    await t.shot('student-sheet')
    await t.press(t.page.locator('[data-sheet] .rb-btn', { hasText: 'Close' }))
    await t.press(cell('Qualifications 1', 'pit_crew'))
    await t.waitFor('[data-sheet]')
    await t.press(t.page.locator('[data-sheet] .rb-big-off', { hasText: 'Take back my request' }))
    await t.waitText('Request taken back')
    t.eq('taking one back leaves 2 requests (3 before)', (await mine()).length, 2)
    await t.press(t.page.locator('[data-sheet] .rb-btn', { hasText: 'Close' }))
    await t.noHScroll()
    await t.shot('student')

    t.as('mentor overfills and names backups')
    t.page.on('dialog', onDialog)
    await t.open(`/roles/${EV}`, { persona: 'mentor', mig: 'all', ready: '[data-page="role-board"] .rb-grid' })
    await t.press(cell('Qualifications 2', 'scout'))
    await t.waitFor('[data-sheet] [data-person]')
    t.check('the box opens at 0 of 6 assigned, 9 asked', ((await t.text('[data-countline]')) || '') === '0 of 6 assigned · 9 asked', await t.text('[data-countline]'))
    const people = await t.page.locator('[data-sheet] [data-person]').evaluateAll((els) => els.map((e) => e.getAttribute('data-person')))
    t.eq('the mentor sees 3 buttons per asked person (Assign, Backup, Remove) for 9 people', await t.count('[data-sheet] .rb-act'), 27 + 2)
    for (const [i, name] of people.entries()) {
      const want = i < 7 ? 'assigned' : 'backup'
      await t.press(t.page.locator(`[data-sheet] li[data-person="${name}"] .rb-act`, { hasText: i < 7 ? 'Assign' : 'Backup' }))
      await t.waitText(`${name}: ${want === 'assigned' ? 'Assigned' : 'Backup'}.`)
    }
    t.check('the sheet reads 7 of 6 assigned · 2 backup · 0 asked', ((await t.text('[data-countline]')) || '') === '7 of 6 assigned · 2 backup · 0 asked', await t.text('[data-countline]'))
    const q2 = (await t.rows('role_requests')).filter((r) => r.slot_id === SID2 && r.role === 'scout')
    t.eq('the store holds 7 assigned and 2 backup scouts in that slot', [q2.filter((r) => r.status === 'assigned').length, q2.filter((r) => r.status === 'backup').length], [7, 2])
    await t.shot('mentor-sheet')
    await t.press(t.page.locator('[data-sheet] .rb-btn', { hasText: 'Close' }))
    t.check('the grid box reads 7/6', ((await t.text(`${cell('Qualifications 2', 'scout')} .rb-count`)) || '').replace(/\s/g, '') === '7/6', await t.text(`${cell('Qualifications 2', 'scout')} .rb-count`))

    t.as('mentor is drive coach, no popup')
    await t.press(cell('Alliance selection', 'drive_coach'))
    await t.waitFor('[data-sheet]')
    await t.press(t.page.locator('[data-sheet] .rb-big', { hasText: 'I can do this' }))
    await t.waitFor('[data-sheet] li[data-person="Coach Max"]')
    await t.press(t.page.locator('[data-sheet] li[data-person="Coach Max"] .rb-act', { hasText: 'Assign' }))
    await t.waitText('Coach Max: Assigned.')
    const dc = (await t.rows('role_requests')).find((r) => r.slot_id === SID3 && r.member_id === P.mentor.id && r.role === 'drive_coach')
    t.eq('assigned as drive coach with 0 dialogs and 0 error lines', [dc?.status, dialogs, await t.count('[role="alert"]')], ['assigned', 0, 0])
    t.check('drive coach shows in his My shifts', ((await t.text('[data-myshifts]')) || '').includes('Drive coach'), await t.text('[data-myshifts]'))
    await t.press(t.page.locator('[data-sheet] .rb-btn', { hasText: 'Close' }))

    t.as('mentor adds someone who did not ask')
    await t.press(cell('Alliance selection', 'team_captain'))
    await t.waitFor('[data-sheet] .rb-add select option:nth-child(2)')
    await t.page.selectOption('[data-sheet] .rb-add select', P.student2.id)
    await t.press(t.page.locator('[data-sheet] .rb-act', { hasText: 'Add as backup' }))
    await t.waitText('added as backup')
    t.eq('Riley is a backup team captain without asking', (await t.rows('role_requests')).find((r) => r.slot_id === SID3 && r.member_id === P.student2.id && r.role === 'team_captain')?.status, 'backup')
    await t.press(t.page.locator('[data-sheet] .rb-btn', { hasText: 'Close' }))

    await t.press(cell('Qualifications 1', 'scout'))
    await t.waitFor('[data-sheet] li[data-person="Sam"]')
    await t.press(t.page.locator('[data-sheet] li[data-person="Sam"] .rb-act', { hasText: 'Assign' }))
    await t.waitText('Sam: Assigned.')
    await t.press(t.page.locator('[data-sheet] .rb-btn', { hasText: 'Close' }))
    await t.noHScroll()
    await t.shot('mentor')

    t.as('student reads My shifts')
    await t.open(`/roles/${EV}`, { persona: 'student', mig: 'all', ready: '[data-page="role-board"] .rb-grid' })
    t.check('My shifts lists Scout, Qualifications 1, Assigned', ((await t.text('[data-myshifts] .rb-shift')) || '').includes('Scout') && ((await t.text('[data-myshifts] .rb-shift')) || '').includes('Assigned'), await t.text('[data-myshifts]'))
    await t.press(cell('Qualifications 1', 'scout'))
    await t.waitFor('[data-sheet]')
    t.eq('an assigned box has no take back button and shows the locked line', [await t.count('[data-sheet] .rb-big'), await t.count('[data-sheet] .rb-locked')], [0, 1])
    await t.shot('student-shift')
    t.page.off('dialog', onDialog)
  },
}
