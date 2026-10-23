// Pure: no driver.js, no DOM, so tests/feature-guide.test.js drives it.
import { AREAS, guideFor } from './featureGuide.js'

// The onboarding tour, BUILT FROM THE FEATURE GUIDE (src/featureGuide.js), so
// it covers every page of the app and changes when the guide does (feedback
// aa4e3c4d, ledger 0016). It stays on the dashboard: a page with a nav anchor
// gets a spotlight on that anchor; every other page is named, with where to
// find it and what it does, in one card per area. tests/feature-guide.test.js
// fails on an App.jsx route the guide does not cover, and on a tour that
// leaves a guide entry out.

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const CHUNK = 6

/** The tour as data: [{ element?, popover: { title, description } }]. */
export function tourSteps(isStaff, isParent, { isAdmin = false, present = () => true } = {}) {
  const seen = guideFor({ isStaff, isAdmin, isParent })
  const steps = [{
    popover: {
      title: 'Welcome to Techmen',
      description: `A quick tour of every part of the app you can use: ${seen.length} pages. Replay it any time from your account menu.`,
    },
  }]
  const spot = new Set()
  for (const g of seen) {
    if (g.anchor && present(g.anchor)) {
      spot.add(g.path)
      steps.push({ element: g.anchor, popover: { title: g.title, description: `${esc(g.what)}<br><span class="tour-where">${esc(g.where)}</span>` } })
    }
  }
  for (const area of AREAS) {
    const rest = seen.filter((g) => g.area === area.key && !spot.has(g.path))
    for (let i = 0; i < rest.length; i += CHUNK) {
      const part = rest.slice(i, i + CHUNK)
      const more = rest.length > CHUNK ? ` (${Math.floor(i / CHUNK) + 1} of ${Math.ceil(rest.length / CHUNK)})` : ''
      steps.push({
        popover: {
          title: `${area.title}${area.key === 'admin' && !isAdmin ? ' (admins only)' : ''}${more}`,
          description: `<ul class="tour-list">${part.map((g) => `<li data-tour-path="${esc(g.path)}"><b>${esc(g.title)}</b>: ${esc(g.what)} <span class="tour-where">${esc(g.where)}</span></li>`).join('')}</ul>`,
        },
      })
    }
  }
  steps.push({ popover: { title: 'That is everything', description: 'Something missing, broken or confusing? Use the feedback button in the corner. You can read the answer there too.' } })
  return steps
}
