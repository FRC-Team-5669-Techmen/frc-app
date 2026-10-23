/**
 * The driver leaderboard (/drivers, migration 0029, ledger 0020), Chromium at
 * 375 and 1440 on fixture mode. Hours are computed here from the seeded rows
 * (the oracle), not read from src/driverScore.js.
 *
 *  - before 0029: the page says not set up, and makes no write;
 *  - a student sees Riley, Sam, Casey in that order (Riley: most robot time
 *    and two strong ratings; Sam: some robot and MoSim time, one middling
 *    rating, a voided match that counts for nothing; Casey: MoSim only,
 *    unrated); robot hours match the store; All time adds last season;
 *  - logging a session writes one row, attributed, and the board moves; the
 *    driver can void it (1 Void button on their fresh session, against 0 on
 *    the seeded ones older than 24 hours);
 *  - a coach note is shown to staff and to the driver it is about, not to
 *    another student; a student has no rating form and no Edit buttons,
 *    against one form and Edit buttons for a mentor; a mentor rating writes
 *    one row;
 *  - a parent-only account reads nothing.
 * Write-side RLS is proven by 0029_driver_leaderboard_rls_test.sql, not here.
 */
import { P, PRE_0014 } from './_util.mjs'

const PRE_0029 = `${PRE_0014},0014,0015,0016,0017,0018,0019,0020,0021,0022,0023,0024,0025,0026,0027,0028`
const REAL = new Set(['practice_field', 'match', 'test'])
const hm = (min) => (min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`)
const robotMinutes = (rows, member, from = '2026-05-01') => rows.filter((r) => r.member_id === member && !r.voided_at && REAL.has(r.kind) && r.session_date >= from).reduce((a, r) => a + r.minutes, 0)
const WRITES = /^driver_(log_session|edit_session|void_session|rate)$/

export default {
  async run(t) {
    await t.step('before 0029', async () => {
      t.as('mig without 0029')
      await t.open('/drivers', { persona: 'student', mig: PRE_0029, reset: true, ready: '.ba-wrap' })
      await t.waitText('Not set up yet')
      t.eq('the page says not set up, with no leaderboard rows', await t.count('.dr-row'), 0)
      t.eq('no driver write function was called', (await t.calls()).filter((c) => c.kind === 'rpc' && WRITES.test(c.name ?? '')).length, 0)
    })

    t.as('student board')
    await t.open('/drivers', { persona: 'student', mig: 'all', reset: true, ready: '.dr-open' })
    const seeded = await t.rows('drive_sessions')
    t.check('the fixture seeded sessions for the oracle', seeded.length >= 8, `${seeded.length} sessions`)
    t.eq('the leaderboard reads Riley, Sam (with his you tag), Casey', await t.texts('.dr-open .dr-name'), ['Riley', 'Samyou', 'Casey'])
    const riley = await t.text('.dr-row[data-driver="Riley"] .dr-real')
    t.eq('Riley robot time matches the store (voided and last-season sessions excluded)', riley.replace(/^Robot\s*/, ''), hm(robotMinutes(seeded, P.student2.id)))
    t.eq('Sam robot time leaves out the voided match', (await t.text('.dr-row[data-driver="Sam"] .dr-real')).replace(/^Robot\s*/, ''), hm(robotMinutes(seeded, P.student.id)))
    t.check('Casey reads Unrated', (await t.text('.dr-row[data-driver="Casey"] .dr-coach')).includes('Unrated'))
    t.eq('Sam row is marked as you (1 of 3 rows)', await t.count('.dr-row-me'), 1)
    t.eq('no rating form for a student', await t.count('.dr-staff'), 0)
    await t.noHScroll()
    await t.tapTargets('.dr-wrap button, .dr-wrap select, .dr-wrap input', 'driver controls at least 44px')
    await t.shot('board')

    await t.step('All time', async () => {
      t.as('season switch')
      await t.page.selectOption('select[aria-label="Season"]', 'all')
      await t.settle()
      t.eq('All time adds Casey last-season robot time', (await t.text('.dr-row[data-driver="Casey"] .dr-real')).replace(/^Robot\s*/, ''), hm(robotMinutes(seeded, P.exempt.id, '0000')))
      t.check('and the season-scoped value was 0m before', robotMinutes(seeded, P.exempt.id) === 0, `${robotMinutes(seeded, P.exempt.id)} min`)
      await t.page.selectOption('select[aria-label="Season"]', { label: 'Offseason 2026' })
      await t.settle()
    })

    await t.step('formula disclosure', async () => {
      t.as('formula')
      await t.press(t.page.locator('.dr-formula summary'))
      t.check('the disclosure states the formula', (await t.text('.dr-formula')).includes('1 − e'), (await t.text('.dr-formula')).slice(0, 80))
    })

    await t.step('log a session and void it', async () => {
      t.as('log')
      const before = (await t.rows('drive_sessions')).length
      t.eq('no Void button on Sam sessions older than 24 hours', await t.count('.dr-panel .dr-void-btn'), 0)
      await t.press(t.page.locator('.dr-form button', { hasText: 'Match' }))
      await t.page.getByLabel('Minutes', { exact: true }).fill('45')
      await t.press(t.page.locator('.dr-form button[type="submit"]'))
      await t.waitText('45m of Match logged')
      await t.settle()
      const all = await t.rows('drive_sessions')
      const mine = all.filter((r) => r.member_id === P.student.id && r.minutes === 45 && r.kind === 'match')
      t.eq('exactly one new session', all.length - before, 1)
      t.check('attributed to Sam and logged by Sam', mine.length === 1 && mine[0].logged_by === P.student.id, JSON.stringify(mine[0] ?? null).slice(0, 120))
      t.eq('Sam robot time on the board rises by 45 minutes', (await t.text('.dr-row[data-driver="Sam"] .dr-real')).replace(/^Robot\s*/, ''), hm(robotMinutes(all, P.student.id)))
      t.eq('the fresh session has the one Void button', await t.count('.dr-panel .dr-void-btn'), 1)
      await t.shot('logged')
      await t.press(t.page.locator('.dr-panel .dr-void-btn'))
      await t.waitText('Session voided')
      await t.settle()
      const v = (await t.rows('drive_sessions')).find((r) => r.id === mine[0]?.id)
      t.check('the session is void, by Sam, and still in the table', !!v?.voided_at && v.voided_by === P.student.id)
    })

    await t.step('notes', async () => {
      t.as('who reads a note')
      await t.press(t.page.locator('.dr-row[data-driver="Riley"] .dr-open'))
      await t.waitFor('dialog.dr-sheet[open]')
      t.check('the sheet shows Riley ratings by coach', (await t.count('dialog.dr-sheet .dr-rating')) >= 2)
      t.eq('a student reads no note on Riley ratings', await t.count('dialog.dr-sheet .dr-note'), 0)
      t.eq('and has no Edit buttons in the sheet', await t.count('dialog.dr-sheet button:text-is("Edit")'), 0)
      await t.press(t.page.locator('dialog.dr-sheet .ba-btn', { hasText: 'Close' }))
      await t.press(t.page.locator('.dr-row[data-driver="Sam"] .dr-open'))
      await t.waitFor('dialog.dr-sheet[open]')
      t.check('Sam reads the note on his own rating', (await t.texts('dialog.dr-sheet .dr-note')).includes('Watch the wall on turns'))
      await t.press(t.page.locator('dialog.dr-sheet .ba-btn', { hasText: 'Close' }))
    })

    await t.step('staff', async () => {
      t.as('mentor')
      await t.open('/drivers', { persona: 'mentor', mig: 'all', ready: '.dr-open' })
      t.eq('a mentor has the rating form (1, against 0 for a student)', await t.count('.dr-staff'), 1)
      await t.press(t.page.locator('.dr-row[data-driver="Riley"] .dr-open'))
      await t.waitFor('dialog.dr-sheet[open]')
      t.check('the mentor reads the coach note on Riley', (await t.texts('dialog.dr-sheet .dr-note')).includes('Calm under pressure'))
      t.check('and has Edit buttons on Riley sessions (against 0 for a student)', (await t.count('dialog.dr-sheet button:text-is("Edit")')) > 0)
      await t.press(t.page.locator('dialog.dr-sheet .ba-btn', { hasText: 'Close' }))
      const before = (await t.rows('driver_ratings')).length
      await t.page.selectOption('select[aria-label="Driver to rate"]', P.student.id)
      await t.press(t.page.getByRole('button', { name: 'Control 5', exact: true }))
      await t.press(t.page.getByRole('button', { name: 'Consistency 4', exact: true }))
      await t.press(t.page.locator('.dr-rate button[type="submit"]'))
      await t.waitText('Rating saved')
      const r = (await t.rows('driver_ratings'))
      const fresh = r.filter((x) => x.driver_id === P.student.id && x.coach_id === P.mentor.id && x.control === 5 && x.consistency === 4 && x.scoring == null)
      t.eq('one new rating, by the mentor, for Sam, with unrated criteria left empty', [r.length - before, fresh.length], [1, 1])
      await t.shot('mentor')
    })

    await t.step('parent', async () => {
      t.as('parent-only')
      await t.open('/drivers', { persona: 'parent', mig: 'all', ready: '.ba-wrap' })
      t.eq('a parent-only account sees no leaderboard rows, against three for a student', await t.count('.dr-open'), 0)
      t.check('and is told why', (await t.bodyText()).includes('for students and staff'))
    })
  },
}
