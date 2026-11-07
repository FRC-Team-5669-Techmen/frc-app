// Shared geometry oracle for nav-audit, the feature gate and before/after shots.
// The route catalog is already held equal to App.jsx by fixture-routes.test.js.
import { ROUTES } from '../../src/dev/fixture/routes.js'

export const LAYOUT_WIDTHS = [375, 1152, 1440]
export const CONTENT = [
  '.home-body', '.ph-body', '.sch-body', '.mh-body', '.lh-body', '.board-body',
  '.jobs-body', '.mp-body', '.profile-body', '.sv-wrap', '.pb-wrap', '.ic-body',
  '.hb-body', '.eh-page', '.ehm-page', '.ba-wrap', '.hub-wrap', '.rb-wrap',
  '.ms-wrap', '.mt-wrap', '.dr-wrap', '.hp-wrap', '.ms-screen', '.rm-wrap',
  '.rmd-wrap', '.st-wrap', '.sc-wrap', '.pk-wrap', '.vh-body', '.rp-body',
  '.activity-body', '.rd-body', '.sop-wrap', '.squad-body', '.ar-body',
  '.ap-wrap', '.sa-wrap', '.roster-body', '.fbp-wrap', '.an-wrap', '.cnx-card',
  '.checkin-content', '.checkin-wrap', '.pr-card', '.login-card', '.landing-wrap',
  '.gate-card', '.ma-card', 'main',
].join(', ')

export const LAYOUT_PAGES = [
  ...ROUTES.filter(r => r.group !== 'dev').map(r => ({
    ...r,
    persona: r.group === 'public' ? 'signedout' : r.group === 'checkin' ? 'student' : 'admin',
  })),
  { path: '/dashboard', url: '/dashboard', label: 'Student dashboard', persona: 'student' },
  { path: '/dashboard', url: '/dashboard', label: 'Parent dashboard', persona: 'parent' },
  { path: '/profile', url: '/profile', label: 'Student profile', persona: 'student' },
  { path: '/my-hours', url: '/my-hours', label: 'Student hours dashboard', persona: 'student' },
  { path: '/log-hours', url: '/log-hours', label: 'Student hours entry and history', persona: 'student' },
  { path: '/my-schedule', url: '/my-schedule', label: 'Student competition schedule', persona: 'student' },
  { path: '/standing', url: '/standing', label: 'Student standing', persona: 'student' },
  { path: '/survey', url: '/survey', label: 'Student weekly survey', persona: 'student' },
  { path: '/dashboard', url: '/dashboard', label: 'Access gate', persona: 'pending' },
  { path: '/dashboard', url: '/dashboard', label: 'Member application', persona: 'student', action: 'application' },
  { path: '/jobs', url: '/jobs', label: 'Selected job', persona: 'student', action: 'job' },
  { path: '/feedback', url: '/feedback', label: 'Selected feedback report', persona: 'admin', action: 'feedback' },
  { path: '/handbook', url: '/handbook?section=6', label: 'Handbook reading and index', persona: 'student' },
  { path: '/scouting/:eventId', url: '/scouting/practice', label: 'Scouting practice', persona: 'student' },
]

export async function prepareLayout(page, p) {
  if (p.action === 'application') {
    await page.evaluate(() => { window.__fx.db.member_applications = []; window.__fx.save() })
    await page.goto(new URL('/dashboard', page.url()).href)
    await page.waitForSelector('.ma-form')
  } else if (p.action === 'job') {
    await page.locator('li.jobs-row').first().click()
    await page.waitForSelector('.jobs-detail')
  } else if (p.action === 'feedback') {
    await page.locator('.fbp-item').first().click()
    await page.waitForSelector('.fbp-modal')
  }
  if (p.action) await waitForLayout(page)
}

export function layoutSlug(p) {
  return `${p.persona}-${p.path === '/' ? 'landing' : p.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${p.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/-$/g, '')}`
}

export async function waitForLayout(page) {
  await page.waitForFunction(() => {
    const root = document.getElementById('root')
    if (!root || root.querySelector('.splash, .home-loading, .sch-loading, .mh-loading, .board-loading, .profile-loading, .ph-loading')) return false
    const clone = root.cloneNode(true)
    clone.querySelectorAll('.navbar, .fb-launch, .fb-panel, script, style').forEach(el => el.remove())
    return (clone.textContent || '').trim().length > 30
  }, null, { timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
  // Wait for route reads, including lazy children, to stop growing the log.
  let last = -1, stable = Date.now()
  const start = Date.now()
  while (Date.now() - start < 10000) {
    const n = await page.evaluate(() => window.__fx?.calls.length ?? 0)
    if (n !== last) { last = n; stable = Date.now() }
    else if (Date.now() - stable > 400) break
    await page.waitForTimeout(100)
  }
  if (await page.locator('.driver-popover').count()) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
}

export async function measureLayout(page) {
  return page.evaluate(selector => {
    const visible = el => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return false
      for (let n = el; n; n = n.parentElement) {
        const s = getComputedStyle(n)
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false
      }
      return true
    }
    // First matching selector in priority order, not the outermost DOM match.
    const content = selector.split(', ').flatMap(s => [...document.querySelectorAll(s)]).find(visible)
      ?? [...document.querySelector('#root').children].find(visible)
    const r = content?.getBoundingClientRect()
    const round = n => Math.round(n * 10) / 10
    const clone = content?.cloneNode(true)
    clone?.querySelectorAll('.navbar, .fb-launch, .fb-panel, script, style').forEach(el => el.remove())
    const text = (clone?.textContent || '').replace(/\s+/g, ' ').trim()
    const grids = content ? [content, ...content.querySelectorAll('*')].filter(el => {
      if (!visible(el)) return false
      const s = getComputedStyle(el)
      return s.display === 'grid' && s.gridTemplateColumns.split(' ').filter(Boolean).length > 1
    }).map(el => ({ selector: el.className, columns: getComputedStyle(el).gridTemplateColumns, width: round(el.getBoundingClientRect().width) })) : []
    // Local table scrollers are intentional. Detect escaping boxes anywhere
    // else, even if an ancestor hides the document's horizontal scrollbar.
    const escapes = content ? [...content.querySelectorAll('*')].filter(el => {
      if (!visible(el) || ['fixed', 'absolute'].includes(getComputedStyle(el).position)) return false
      const b = el.getBoundingClientRect()
      if (b.left >= -1 && b.right <= innerWidth + 1) return false
      for (let p = el.parentElement; p && p !== content; p = p.parentElement) {
        if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return false
      }
      return true
    }).slice(0, 8).map(el => ({ selector: el.className || el.tagName, left: round(el.getBoundingClientRect().left), right: round(el.getBoundingClientRect().right) })) : []
    return {
      path: location.pathname, theme: document.documentElement.dataset.theme,
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      content: content?.className || content?.tagName, left: round(r?.left ?? 0),
      right: round(r?.right ?? 0), width: round(r?.width ?? 0), height: round(r?.height ?? 0),
      chars: text.length, sample: text.slice(0, 100), grids, escapes,
      panels: [...document.querySelectorAll('.jobs-detail, .fbp-modal')].filter(visible).map(el => {
        const b = el.getBoundingClientRect()
        return { selector: el.className, left: round(b.left), right: round(b.right), width: round(b.width) }
      }),
      errorBoundary: !!document.querySelector('.eb-wrap'),
    }
  }, CONTENT)
}

export function layoutChecks(m) {
  const maximum = ['sc-wrap', 'pk-wrap'].includes(m.content) ? m.viewport : 1280
  return {
    rendered: m.chars > 30 && m.width > 250 && !m.errorBoundary,
    overflow: m.overflow === 0 && m.escapes.length === 0,
    bounds: m.left >= -1 && m.right <= m.viewport + 1 && m.width <= maximum,
    panels: m.panels.every(p => p.left >= -1 && p.right <= m.viewport + 1 && p.width >= 250 && p.width <= 1280),
  }
}
