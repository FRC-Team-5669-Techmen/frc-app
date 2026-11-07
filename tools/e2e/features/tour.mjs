import { readdirSync } from 'node:fs'
// Guided training, real routes and real controls, both themes at every width.
const WITHOUT_TOUR = readdirSync(new URL('../../../supabase/migrations/', import.meta.url)).filter(name => /^\d{4}_.*\.sql$/.test(name) && !name.endsWith('_rls_test.sql') && !name.startsWith('0047_')).map(name => name.slice(0,4)).join(',')
const PANEL = '[data-tour-runner]'
const COMPLETE = 'tour_completions'
const coreOrder = [
  'attendance',
  'checkout',
  'absence',
  'schedule',
  'roles',
  'scouting',
  'batteries',
  'matches',
  'feedback',
]
async function next(t) {
  await t.press(
    t.page
      .locator(PANEL)
      .getByRole('button', { name: 'Continue', exact: true }),
  )
}
async function question(t) {
  await t.press(t.page.locator(PANEL + ' input[type=radio]').first())
  await t.press(
    t.page
      .locator(PANEL)
      .getByRole('button', { name: 'Check answer', exact: true }),
  )
}
async function geometry(t, label) {
  await t.settle()
  await t.noHScroll(label + ' page fits')
  const g = await t.page.evaluate(() => {
    const panel = document
        .querySelector('[data-tour-runner]')
        ?.getBoundingClientRect(),
      target = document
        .querySelector('[data-tour-active]')
        ?.getBoundingClientRect()
    return {
      panel: panel && {
        left: panel.left,
        right: panel.right,
        top: panel.top,
        bottom: panel.bottom,
      },
      target: target && {
        left: target.left,
        right: target.right,
        top: target.top,
        bottom: target.bottom,
      },
      w: innerWidth,
      h: innerHeight,
    }
  })
  t.check(
    label + ' panel fits viewport',
    g.panel &&
      g.panel.left >= 0 &&
      g.panel.right <= g.w &&
      g.panel.top >= 0 &&
      g.panel.bottom <= g.h,
    JSON.stringify(g),
  )
  t.check(
    label + ' target visible above or beside guidance',
    g.target &&
      g.panel &&
      (g.target.right <= g.panel.left || g.target.top < g.panel.top),
    JSON.stringify(g.target),
  )
  await t.tapTargets(PANEL + ' button', label + ' guidance buttons 44px', {
    everyWidth: true,
  })
}
export default {
  async run(t) {
    for (const theme of ['dark', 'light']) {
      t.as(theme)
      await t.page.evaluate(() => {
        try {
          for (const key of Object.keys(localStorage))
            if (key.startsWith('techmen:training:'))
              localStorage.removeItem(key)
        } catch {}
      })
      await t.open('/training', {
        persona: 'student',
        mig: 'all',
        reset: true,
        ready: '.tour-page',
      })
      await t.page.evaluate(
        (theme) => localStorage.setItem('techmen:theme', theme),
        theme,
      )
      await t.page.reload()
      await t.waitFor('#tour-track')
      t.eq(
        'theme applied',
        await t.page.locator('html').getAttribute('data-theme'),
        theme,
      )
      t.eq(
        'member sees four learning tracks',
        await t.page.locator('#tour-track option').count(),
        4,
      )
      t.eq(
        'no staff roster for a member',
        await t.count('[data-tour="completion-roster"]'),
        0,
      )
      await t.page
        .getByLabel('Competition for event lessons')
        .selectOption('16000000-0000-4000-8000-000000000001')
      const before = await t.rows('attendance_events'),
        absences = await t.rows('absence_requests')
      await t.press(
        t.page.getByRole('button', { name: 'Start Member tour', exact: true }),
      )
      await t.waitFor('[data-tour-active=""]')
      await geometry(t, 'attendance')
      t.check(
        'Continue blocked before doing activity',
        await t.page
          .locator(PANEL)
          .getByRole('button', { name: 'Continue', exact: true })
          .isDisabled(),
      )
      await t.press(
        t.page.locator(PANEL).getByRole('button', { name: 'Skip step' }),
      )
      t.eq(
        'skip creates no personal completion',
        (await t.rows(COMPLETE)).filter((c) => c.member_id.endsWith('c1'))
          .length,
        0,
      )
      await t.press(
        t.page.locator(PANEL).getByRole('button', { name: 'Pause training' }),
      )
      t.eq('pause removes guidance', await t.count(PANEL), 0)
      await t.open('/training', { ready: '.tour-page' })
      t.check(
        'saved position survives full reload',
        (await t.text('.tour-page')).includes('1 skipped'),
      )
      await t.press(
        t.page.getByRole('button', { name: 'Resume Member tour', exact: true }),
      )
      await t.waitFor(PANEL)
      t.eq(
        'resumes on checkout',
        await t.text('#tour-heading'),
        'Leave with a sign-out',
      )
      await t.press(
        t.page
          .locator(PANEL)
          .getByRole('button', { name: 'Back', exact: true }),
      )
      await t.waitFor('[data-tour="status-card"][data-tour-active]')
      await question(t)
      await next(t)
      await t.page.locator(PANEL + ' textarea').fill('Built a sample mechanism')
      await t.press(t.page.locator(PANEL + ' input[type=checkbox]'))
      await t.press(
        t.page
          .locator(PANEL)
          .getByRole('button', { name: 'Practice sign-out request' }),
      )
      await next(t)
      await t.waitFor('[data-tour="absence-practice"][data-tour-active]')
      await t.page.locator('#st-ev').selectOption('practice-meeting')
      await t.press(
        t.page.getByRole('radio', { name: 'Medical visit', exact: true }),
      )
      await t.page
        .getByLabel('Note for the mentor', { exact: true })
        .fill('Sample appointment only')
      await t.press(
        t.page.getByRole('button', {
          name: 'Practice absence request',
          exact: true,
        }),
      )
      await next(t)
      await t.waitFor('[data-tour="schedule-view"][data-tour-active]')
      await geometry(t, 'schedule')
      await t.page.keyboard.press('F8')
      t.check(
        'F8 reaches guidance heading or feature',
        await t.page.evaluate(
          () =>
            document.activeElement?.id === 'tour-heading' ||
            document.activeElement?.getAttribute('data-tour') ===
              'schedule-view',
        ),
      )
      await t.press(
        t.page.locator('[data-tour="schedule-view"] button').first(),
      )
      await next(t)
      await t.waitFor('[data-tour="role-board"][data-tour-active]')
      await question(t)
      await next(t)
      await t.waitFor('[data-tour="scout-practice"][data-tour-active]')
      await question(t)
      await next(t)
      await t.waitFor('[data-tour="battery-filters"][data-tour-active]')
      await t.press(
        t.page.locator('[data-tour="battery-filters"] button').first(),
      )
      await next(t)
      await t.waitFor('[data-tour="match-views"][data-tour-active]')
      await t.press(
        t.page
          .locator('[data-tour="match-views"]')
          .getByRole('button', { name: 'Trends', exact: true }),
      )
      await next(t)
      await t.waitFor('[data-tour="feedback-launcher"][data-tour-active]')
      await t.press('[data-tour="feedback-launcher"]')
      await t.waitFor('.fb-panel')
      await t.press('[data-tour="feedback-launcher"]')
      await next(t)
      await t.page.waitForFunction(() =>
        window.__fx
          .rows('tour_completions')
          .some((c) => c.member_id.endsWith('c1')),
      )
      t.eq(
        'all core activities create exactly one completion',
        (await t.rows(COMPLETE)).filter((c) => c.member_id.endsWith('c1'))
          .length,
        1,
      )
      t.eq(
        'training never writes attendance',
        await t.rows('attendance_events'),
        before,
      )
      t.eq(
        'absence practice never writes absences',
        await t.rows('absence_requests'),
        absences,
      )
      // Persistence can precede the RPC response and React's success paint.
      // Wait for the learner-visible acknowledgment, not only the fixture row.
      await t.page.locator(PANEL).getByRole('status').filter({
        hasText: 'Core completion recorded for your mentors.',
      }).waitFor({ state: 'visible' })
      t.check(
        'completion acknowledged',
        (await t.text(PANEL)).includes('Core completion recorded'),
      )
      await t.waitFor('[data-tour="nav-search"][data-tour-active]')
      await t.press('[data-tour="nav-search"]')
      await t.waitFor('.command-palette[open]')
      await t.page.locator('.command-palette input').fill('my profile')
      t.eq('Search practice finds the real profile page', await t.count('[data-command="/profile"]'), 1)
      await t.page.keyboard.press('Escape')
      t.eq('closing Search preserves active training', [await t.count('.command-palette[open]'), await t.count(PANEL)], [0, 1])
      t.check('Search practice permits Continue after closing the modal',
        await t.page.locator(PANEL).getByRole('button', { name: 'Continue', exact: true }).isEnabled())
      await next(t)
      await t.shot(theme + '-core-done', { full: false })
      await t.press(
        t.page.locator(PANEL).getByRole('button', { name: 'Pause training' }),
      )
      await t.open('/training', { persona: 'mentor', ready: '.tour-page' })
      await t.waitFor('[data-tour="completion-roster"] .tour-roster')
      t.eq(
        'staff gets completion roster',
        await t.count('[data-tour="completion-roster"]'),
        1,
      )
      t.check(
        'mentor default filter shows unfinished',
        (await t.text('[data-tour="completion-roster"]')).includes(
          'Not completed',
        ),
      )
      await t.press(
        t.page.locator('[data-tour="completion-roster"] input[type=checkbox]'),
      )
      t.check(
        'all filter shows completed counterpart',
        (await t.text('[data-tour="completion-roster"]')).includes(
          'Completed · Member',
        ),
      )
      await t.shot(theme + '-mentor', { full: false })
      t.eq(
        'staff defaults to Mentor track',
        await t.page.locator('#tour-track').inputValue(),
        'mentor',
      )
      await t.open('/training', { persona: 'parent', ready: '.tour-page' })
      t.eq(
        'parent only gets parent track',
        await t.page.locator('#tour-track option').allTextContents(),
        ['Parent'],
      )
      t.eq(
        'account switch never resumes another account',
        await t.page
          .getByRole('button', { name: 'Resume Member tour', exact: true })
          .count(),
        0,
      )
      t.eq(
        'parent cannot see progress roster',
        await t.count('[data-tour="completion-roster"]'),
        0,
      )
      await t.press(
        t.page.getByRole('button', { name: 'Start Parent tour', exact: true }),
      )
      await t.waitFor('[data-tour="parent-home"][data-tour-active]')
      await question(t)
      await next(t)
      await t.waitFor('[data-tour="schedule-view"][data-tour-active]')
      await t.press(
        t.page.locator('[data-tour="schedule-view"] button').first(),
      )
      await next(t)
      await t.waitFor('[data-tour="feature-reference"][data-tour-active]')
      await question(t)
      await next(t)
      await t.waitFor('[data-tour="feedback-launcher"][data-tour-active]')
      await t.press('[data-tour="feedback-launcher"]')
      await t.waitFor('.fb-panel')
      await t.press('[data-tour="feedback-launcher"]')
      await next(t)
      await t.page.waitForFunction(() =>
        window.__fx
          .rows('tour_completions')
          .some((c) => c.member_id.endsWith('d1')),
      )
      t.eq(
        'parent completes their own curriculum',
        (await t.rows(COMPLETE)).filter(
          (c) => c.member_id.endsWith('d1') && c.track === 'parent',
        ).length,
        1,
      )
      await t.page.keyboard.press('Escape')
      await t.page.waitForSelector(PANEL, { state: 'detached' })
      t.eq(
        'Escape restores focus to account button',
        await t.page.evaluate(() =>
          document.activeElement?.getAttribute('data-tour'),
        ),
        'nav-profile',
      )
    }
    t.as('missing target')
    await t.open('/training', {
      persona: 'student2',
      mig: 'all',
      reset: true,
      ready: '.tour-page',
    })
    // Hold Home's pending work until after the target disappears. This makes
    // the missing-anchor control exercise a real, late React insertion.
    await t.page.evaluate(() => {
      const sb = window.__fx.supabase, original = sb.rpc
      const gate = new Promise(resolve => { window.__tourReleaseDtn = resolve })
      window.__tourDtnHeld = false
      sb.rpc = async function (name, ...args) {
        const result = original.call(this, name, ...args)
        if (name === 'meet_team_todo') {
          window.__tourDtnHeld = true
          await gate
        }
        return result
      }
      window.__tourRestoreDtn = () => { sb.rpc = original }
    })
    await t.press(
      t.page.getByRole('button', { name: 'Start Member tour', exact: true }),
    )
    await t.waitFor('[data-tour="status-card"][data-tour-active]')
    await question(t)
    t.check('late Home work is held before anchor loss',
      await t.page.evaluate(() => window.__tourDtnHeld && !document.querySelector('[data-testid="do-this-now"]')))
    await t.page.evaluate(() =>
      document.querySelector('[data-tour="status-card"]').removeAttribute('data-tour'),
    )
    await t.page.waitForFunction(() => [...document.querySelectorAll('[data-tour-runner] button')]
      .some(button => button.textContent === 'Continue' && button.disabled))
    t.eq('missing anchor has zero matching targets', await t.count('[data-tour="status-card"]'), 0)
    t.check(
      'missing target blocks Continue',
      await t.page
        .locator(PANEL)
        .getByRole('button', { name: 'Continue', exact: true })
        .isDisabled(),
    )
    t.eq(
      'missing target records no completion',
      (await t.rows(COMPLETE)).filter((c) => c.member_id.endsWith('c2')).length,
      0,
    )
    await t.page.evaluate(() => { window.__tourReleaseDtn(); window.__tourRestoreDtn() })
    await t.waitFor('[data-testid="do-this-now"]')
    t.eq('late Home work renders with the anchor missing', await t.count('[data-testid="do-this-now"]'), 1)
    t.eq('anchor loss preserves the React-owned feature', await t.count('#status'), 1)
    await t.page.evaluate(() => document.querySelector('#status').setAttribute('data-tour', 'status-card'))
    await t.waitFor('[data-tour="status-card"][data-tour-active]')
    await t.page.waitForFunction(() => [...document.querySelectorAll('[data-tour-runner] button')]
      .some(button => button.textContent === 'Continue' && !button.disabled))
    t.check('restoring the target permits the completed activity to continue',
      await t.page.locator(PANEL).getByRole('button', { name: 'Continue', exact: true }).isEnabled())
    await t.press(
      t.page.locator(PANEL).getByRole('button', { name: 'Skip step' }),
    )
    await t.press(
      t.page.locator(PANEL).getByRole('button', { name: 'Pause training' }),
    )
    for (const track of ['scout', 'driver', 'pit']) {
      await t.open('/training', {
        persona: 'student2',
        mig: 'all',
        ready: '#tour-track',
      })
      await t.page.locator('#tour-track').selectOption(track)
      await t.press(
        t.page.getByRole('button', {
          name: `Start ${track[0].toUpperCase() + track.slice(1)} tour`,
          exact: true,
        }),
      )
      await t.waitFor('[data-tour="status-card"][data-tour-active]')
      t.check(
        `${track} track starts with named accessible guidance`,
        (await t.page.locator(PANEL).ariaSnapshot()).includes(
          'region "Check in at the door"',
        ),
      )
      await t.page.keyboard.press('Escape')
      await t.page.waitForSelector(PANEL, { state: 'detached' })
    }
    await t.open('/training', {
      persona: 'student2',
      mig: 'all',
      ready: '#tour-track',
    })
    await t.page.locator('#tour-track').selectOption('member')
    await t.page.evaluate(() => {
      window.__tourOriginalSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('techmen:training:'))
          throw new DOMException('Blocked', 'SecurityError')
        return window.__tourOriginalSetItem.call(this, key, value)
      }
    })
    await t.press(
      t.page.getByRole('button', { name: 'Start Member tour', exact: true }),
    )
    await t.waitFor(PANEL)
    await t.page.waitForFunction(() =>
      document
        .querySelector('[data-tour-runner]')
        ?.textContent.includes('could not save your place'),
    )
    t.check(
      'blocked storage is explicit and the tab stays usable',
      (await t.text(PANEL)).includes('could not save your place'),
    )
    await t.press(
      t.page.locator(PANEL).getByRole('button', { name: 'Skip step' }),
    )
    t.eq(
      'blocked storage can advance in memory',
      await t.text('#tour-heading'),
      'Leave with a sign-out',
    )
    await t.page.evaluate(() => {
      Storage.prototype.setItem = window.__tourOriginalSetItem
    })
    await t.page.keyboard.press('Escape')
    await t.open('/training', {
      persona: 'mentor',
      mig: WITHOUT_TOUR,
      reset: true,
      ready: '.tour-page',
    })
    await t.page.getByRole('button', { name: 'Refresh progress' }).waitFor()
    await t.page.waitForFunction(() =>
      document
        .querySelector('[data-tour="completion-roster"]')
        ?.textContent.includes('not set up yet'),
    )
    const signouts = await t.page.evaluate(() => window.__fx.supabase.rpc('can_approve_signouts'))
    t.eq('other migrations stay available while tour tracking is missing', signouts.data, true)
    t.check(
      'missing migration is explicit',
      (await t.text('[data-tour="completion-roster"]')).includes(
        'not set up yet',
      ),
    )
  },
}
