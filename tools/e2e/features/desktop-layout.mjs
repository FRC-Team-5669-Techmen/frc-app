import { LAYOUT_PAGES, waitForLayout, prepareLayout, measureLayout, layoutChecks } from '../layout.mjs'

export async function run(t) {
  for (const theme of ['dark', 'light']) {
    await t.context.addInitScript(value => localStorage.setItem('techmen:theme', value), theme)
    for (const p of LAYOUT_PAGES) {
      t.as(`${theme} · ${p.persona} · ${p.path} · ${p.label}`)
      await t.step('page layout', async () => {
        await t.open(p.url, { persona: p.persona, mig: 'all', reset: true })
        await waitForLayout(t.page)
        await prepareLayout(t.page, p)
        const m = await measureLayout(t.page)
        const checks = layoutChecks(m)
        t.check('real content rendered', checks.rendered, `${m.chars} chars; ${m.content}; ${m.sample}`)
        t.eq('requested theme painted', m.theme, theme)
        t.check('0 horizontal overflow and escaping content', checks.overflow, `${m.overflow}px; ${JSON.stringify(m.escapes)}`)
        t.check('content within viewport and 1280px maximum', checks.bounds, `${m.width}px at ${m.left}..${m.right}`)
        t.check('detail panels within viewport', checks.panels, JSON.stringify(m.panels))
        if (p.action === 'job' || p.action === 'feedback') {
          const positions = await t.page.evaluate(action => {
            const list = document.querySelector(action === 'job' ? '.jobs-body' : '.fbp-list').getBoundingClientRect()
            const detail = document.querySelector(action === 'job' ? '.jobs-detail' : '.fbp-modal').getBoundingClientRect()
            return { listRight: list.right, detailLeft: detail.left, detailWidth: detail.width }
          }, p.action)
          t.check('selected record uses the available layout', t.isPhone ? positions.detailWidth <= 375 : positions.detailLeft >= positions.listRight, JSON.stringify(positions))
        }
        const columns = p.path === '/dashboard' ? p.persona === 'parent' ? '.ph-body' : '.mb-grid'
          : ({ '/profile': '.profile-body', '/schedule': '.sch-month', '/my-hours': '.mh-body', '/log-hours': '.lh-body', '/surveys': '.sa-wrap', '/updates': '.upd-timeline', '/meet': '.mt-events', '/rosters': '.st-roster-index', '/survey': '.sv-wrap > form', '/robot': '.hub-grid-robot', '/batteries': '.ba-board', '/my-schedule': '.ms-list', '/access-requests': '.ar-body', '/certifications': '.ic-certs' })[p.path]
        if (columns && p.persona !== 'pending' && !p.action) {
          const n = await t.page.locator(columns).count()
          if (!t.isPhone) t.check('desktop working layout is present', n > 0, columns)
          if (n) {
            const actual = await t.page.locator(columns).first().evaluate(el => {
              const s = getComputedStyle(el)
              return s.display === 'grid' ? s.gridTemplateColumns.split(' ').length : 1
            })
            t.check('columns match the available width', t.isPhone ? actual === 1 : actual >= 2, `${columns}: ${actual} columns`)
          }
        }
      })
    }
  }
  // Positive controls for absence checks: deliberately broken geometry and
  // missing content must both be detected, then restore the same live page.
  await t.open('/dashboard', { persona: 'student', mig: 'all', reset: true })
  await waitForLayout(t.page)
  const before = await measureLayout(t.page)
  const style = await t.page.addStyleTag({ content: '.home-body { width: 2000px !important; max-width: none !important; }' })
  const wide = layoutChecks(await measureLayout(t.page))
  t.as('geometry oracle controls')
  t.check('wide mutant is detected', !wide.overflow && !wide.bounds)
  await style.evaluate(el => el.remove())
  await t.page.locator('.home-body').evaluate(el => { el.dataset.saved = el.innerHTML; el.innerHTML = '' })
  t.check('empty mutant is detected', !layoutChecks(await measureLayout(t.page)).rendered)
  await t.page.locator('.home-body').evaluate(el => { el.innerHTML = el.dataset.saved; delete el.dataset.saved })
  const restored = await measureLayout(t.page)
  t.check('original content and geometry restored', restored.chars === before.chars && Object.values(layoutChecks(restored)).every(Boolean))
}
