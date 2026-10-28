/**
 * The team pulse board (/display), its three candidate layouts (feedback
 * a51bdc10): ?layout=shop (default), teams, timeline. Chromium at 375 and
 * 1440 on fixture mode. Oracles come from the store.
 *
 *  - every layout lists every team member exactly once (.pb-row), with the
 *    same names, and as many present cards as the header's present count;
 *  - a parent-only account is not on the board (0), against its approved,
 *    active profile in the store (1);
 *  - three layout links, the current one marked; an unknown layout is the default.
 * The staff history dialog and the non-staff rules are display-history.mjs.
 */
export default {
  async run(t) {
    const seen = {}
    for (const layout of ['shop', 'teams', 'timeline']) {
      await t.step(`layout ${layout}`, async () => {
        t.as(`layout ${layout}`)
        await t.open(`/display?layout=${layout}`, { persona: 'mentor', mig: 'all', reset: layout === 'shop', ready: '.pb-row' })
        const b = await t.evaluate(() => ({
          layout: document.querySelector('.pb-wrap')?.dataset.layout,
          rows: [...document.querySelectorAll('.pb-row .pb-name')].map((n) => n.textContent.trim()).sort(),
          present: document.querySelectorAll('.pb-row.pb-present').length,
          now: Number(document.querySelector('.pb-count-now')?.textContent),
          total: Number(document.querySelector('.pb-count-total')?.textContent),
          current: document.querySelector('.pb-layouts a[aria-current="page"]')?.textContent,
          links: document.querySelectorAll('.pb-layouts a').length,
        }))
        seen[layout] = b.rows
        t.eq('the board shows this layout', b.layout, layout)
        t.eq('every member once: rows equal the header total', b.rows.length, b.total)
        t.eq('present cards equal the present count', b.present, b.now)
        t.eq('three layout links, this one marked', [b.links, !!b.current], [3, true])
        const profiles = await t.rows('profiles')
        const roles = await t.rows('member_roles')
        const parentOnly = profiles.filter((p) => p.approved && (p.status ?? 'active') === 'active' && roles.some((r) => r.member_id === p.id) && roles.filter((r) => r.member_id === p.id).every((r) => r.role === 'parent'))
        t.check(`parent-only accounts are off the board (0 of ${parentOnly.length} shown, and the store has at least 1)`,
          parentOnly.length >= 1 && parentOnly.every((p) => !b.rows.includes(p.nickname || p.full_name)), parentOnly.map((p) => p.full_name).join(', '))
        await t.noHScroll()
        await t.shot(layout)
      })
    }
    await t.step('same people in every layout', async () => {
      t.as('compare')
      t.eq('teams lists the same names as shop', seen.teams, seen.shop)
      t.eq('timeline lists the same names as shop', seen.timeline, seen.shop)
      await t.open('/display?layout=nonsense', { persona: 'student', mig: 'all', ready: '.pb-row' })
      t.eq('an unknown layout falls back to In the shop', await t.evaluate(() => document.querySelector('.pb-wrap')?.dataset.layout), 'shop')
    })
  },
}
