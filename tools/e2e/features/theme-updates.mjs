/**
 * Light mode and What's new (ledger 0019), Chromium at 375 and 1440 on
 * fixture mode.
 *
 *  - a fresh device paints dark (the default), gold page titles, the dark
 *    theme-color; the account menu offers Light / Dark / System with Dark
 *    checked;
 *  - Light from the account menu repaints at once (white ground, ink titles,
 *    never gold text), keeps the menu open, is stored, and is painted again
 *    after a reload (the index.html pre-paint script);
 *  - Dark on the profile switches back, and the account menu follows;
 *  - What's new: a fresh device carries the unread dot (avatar, menu item,
 *    the Home strip); /updates lists every release newest first; after the
 *    visit the dot is gone (0 against 1 on the same persona) and Home's strip
 *    is no longer lit.
 * The release count comes from src/updates.js's own file text (counted here
 * by date fields), not from the module the page renders.
 */
import { readFileSync } from 'node:fs'

const RELEASES = (readFileSync(new URL('../../../src/updates.js', import.meta.url), 'utf8').match(/\{ date: '\d{4}-\d{2}-\d{2}'/g) ?? []).length
const css = (t, sel, prop) => t.page.evaluate(([s, p]) => { const el = document.querySelector(s); return el ? getComputedStyle(el)[p] : null }, [sel, prop])
const theme = (t) => t.page.evaluate(() => document.documentElement.getAttribute('data-theme'))
const stored = (t) => t.page.evaluate(() => { try { return localStorage.getItem('techmen:theme') } catch { return 'blocked' } })

export default {
  async run(t) {
    t.check('the release file was read (positive control for the count)', RELEASES > 10, `${RELEASES} releases`)

    t.as('fresh device')
    await t.open('/dashboard', { persona: 'student', mig: 'all', reset: true, ready: '.mb-grid' })
    t.eq('dark is the default', await theme(t), 'dark')
    t.eq('the body ground is the dark --bg', await css(t, 'body', 'backgroundColor'), 'rgb(10, 11, 13)')
    t.eq('the browser chrome color is dark', await t.page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#0A0B0D')
    const dotBefore = await t.count('.nav-avatar-dot')
    t.eq('the unread dot is on the avatar (a student: nothing else lights it)', dotBefore, 1)
    t.eq('Home strip is lit as New', await t.count('.mb-news.mb-news-unread'), 1)

    await t.step('account menu: Light', async () => {
      t.as('menu')
      await t.press(t.page.locator('.nav-avatar-btn'))
      await t.waitFor('.nav-avatar-menu')
      t.eq("What's new in the menu carries the dot", await t.count('.nav-avatar-menu a[href="/updates"] .nav-new-dot'), 1)
      t.eq('three theme choices', await t.count('.nav-avatar-menu [role="radio"]'), 3)
      t.eq('Dark is the checked one', await t.page.locator('.nav-avatar-menu [role="radio"][aria-checked="true"]').getAttribute('aria-label'), 'Dark theme')
      await t.shot('menu-dark', { full: false })
      await t.press(t.page.locator('.nav-avatar-menu [aria-label="Light theme"]'))
      t.eq('the page turns light at once', await theme(t), 'light')
      t.eq('the menu stays open to show it', await t.count('.nav-avatar-menu'), 1)
      t.eq('the body ground is white', await css(t, 'body', 'backgroundColor'), 'rgb(255, 255, 255)')
      t.eq('the choice is stored on this device', await stored(t), 'light')
      await t.shot('menu-light', { full: false })
    })

    await t.step('light survives a reload, ink titles', async () => {
      t.as('reload')
      await t.open('/robot', { ready: '.hub-title' })
      t.eq('painted light again after reload', await theme(t), 'light')
      t.eq('the page title is ink, not gold', await css(t, '.hub-title', 'color'), 'rgb(10, 11, 13)')
      t.eq('the browser chrome color is white', await t.page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#FFFFFF')
      await t.noHScroll()
      await t.shot('robot-light')
    })

    await t.step("What's new", async () => {
      t.as('updates')
      await t.open('/updates', { ready: '.upd-card' })
      t.eq('one card per release', await t.count('.upd-card'), RELEASES)
      const dates = await t.page.$$eval('.upd-date', (els) => els.map((e) => e.getAttribute('datetime')))
      t.eq('dates run newest first', dates, [...dates].sort().reverse())
      t.eq('the dot is gone after the visit (0, against 1 before)', await t.count('.nav-avatar-dot'), 0)
      t.check('the visit is stored', !!(await t.page.evaluate(() => localStorage.getItem('techmen:updates-seen'))))
      await t.noHScroll()
      await t.tapTargets('.upd-open', 'Open links at least 44px')
      await t.shot('updates-light')
      await t.open('/dashboard', { ready: '.mb-grid' })
      t.eq('Home strip is shown but no longer lit (0 lit, 1 strip)', [await t.count('.mb-news.mb-news-unread'), await t.count('.mb-news')], [0, 1])
    })

    await t.step('profile: Dark', async () => {
      t.as('profile')
      await t.open('/profile', { ready: '.profile-theme-card' })
      t.eq('the profile switch shows Light chosen', await t.text('.profile-theme-card .theme-switch-opt.on'), 'Light')
      await t.shot('profile-light')
      await t.press(t.page.locator('.profile-theme-card .theme-switch-opt', { hasText: 'Dark' }))
      t.eq('back to dark', await theme(t), 'dark')
      t.eq('stored dark', await stored(t), 'dark')
      await t.open('/robot', { ready: '.hub-title' })
      t.eq('the page title is gold again in dark', await css(t, '.hub-title', 'color'), 'rgb(255, 230, 41)')
    })
  },
}
