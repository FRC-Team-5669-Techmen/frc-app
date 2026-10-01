// The arrival wiring of both tag routes, which IS the check-out fix.
//
// tests/attendance-state.test.js proves nextNfcAction answers a revisit with
// 'confirm_check_out' instead of a write. That proves nothing about the pages
// unless each one (a) starts from the history entry's own marker, (b) passes
// it to the rule, (c) stamps the entry BEFORE the only automatic write, and
// (d) acts on nothing once it has unmounted, and (e) keeps a receipt that
// still holds. A page that passed `revisit: false` would pass every test in
// that file and ship the 2026-09-08 bug again.
//
// The pages cannot be rendered here (no DOM; see vitest.config.js), so these
// read the source. Each invariant is shown to hold on the shipped file AND to
// fail on an in-memory mutant of that same file -- the mutant is the positive
// control proving the check can see the defect at all. The browser pass for
// the same behaviour is in the b2 lane report (browser_expectations).

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

// The body of `async function <name>(...) { ... }` or `function <name>() {...}`,
// by brace counting from the first `{` after the parameter list.
function fnBody(text, name) {
  const at = text.search(new RegExp(`function ${name}\\(`))
  if (at < 0) return ''
  const open = text.indexOf('{', text.indexOf(')', at))
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1)
  }
  return ''
}

// Each check is a predicate over a page's source.
const CHECKS = {
  'the marker on this history entry starts the page as handled':
    (s) => /const handled = useRef\(isRevisit\(location\.state\)\)/.test(s),
  'the rule is told about a revisit, from the argument or the marker':
    (s) => /nextNfcAction\([\s\S]*?revisit: revisit \|\| handled\.current/.test(fnBody(s, 'arrive')),
  'the entry is stamped before the automatic check-out write': (s) => {
    const a = fnBody(s, 'arrive')
    const stamp = a.indexOf('markHandled()')
    const write = a.indexOf("insertEvent('out')")
    return stamp > 0 && write > 0 && stamp < write
  },
  'the stamp is a replace carrying the marker': (s) => {
    const m = fnBody(s, 'markHandled')
    return /navigate\([\s\S]*replace: true, state: ARRIVAL_HANDLED/.test(m)
  },
  'an arrival whose page unmounted acts on nothing (before stamping)': (s) => {
    const a = fnBody(s, 'arrive')
    const guard = a.indexOf('if (!mounted.current) return')
    return guard > 0 && guard < a.indexOf('markHandled()')
      && /mounted\.current = true\s*\n\s*return \(\) => \{ mounted\.current = false \}/.test(s)
  },
  'a receipt that still holds stays up (before stamping or any write)': (s) => {
    const a = fnBody(s, 'arrive')
    const keep = a.indexOf('if (receipt && receiptHolds(next, receipt)) return')
    return keep > 0 && keep < a.indexOf('markHandled()')
      && (s.match(/arrive\(\{ revisit: true, receipt \}\)/g) ?? []).length === 2
  },
}

// One mutant per invariant: the smallest edit that reintroduces the defect.
const MUTANTS = {
  'the marker on this history entry starts the page as handled':
    (s) => s.replace('useRef(isRevisit(location.state))', 'useRef(false)'),
  'the rule is told about a revisit, from the argument or the marker':
    (s) => s.replace('revisit: revisit || handled.current', 'revisit: revisit'),
  'the entry is stamped before the automatic check-out write':
    (s) => s.replace(/\n\s*markHandled\(\)\n/, '\n'),
  'the stamp is a replace carrying the marker':
    (s) => s.replace('state: ARRIVAL_HANDLED', 'state: null'),
  'an arrival whose page unmounted acts on nothing (before stamping)':
    (s) => s.replace('if (!mounted.current) return', ''),
  'a receipt that still holds stays up (before stamping or any write)':
    (s) => s.replace('if (receipt && receiptHolds(next, receipt)) return', ''),
}

describe.each(['CheckinPage.jsx', 'VolunteerCheckinPage.jsx'])('%s arrival', (file) => {
  const shipped = src(file)

  test('the arrival function was found (the slicer is not reading an empty string)', () => {
    expect(fnBody(shipped, 'arrive').length).toBeGreaterThan(500)
    expect(fnBody(shipped, 'markHandled').length).toBeGreaterThan(20)
  })

  for (const [what, holds] of Object.entries(CHECKS)) {
    test(what, () => {
      expect(holds(shipped), 'shipped source').toBe(true)
      const mutant = MUTANTS[what](shipped)
      expect(mutant, 'the mutant must change the file').not.toBe(shipped)
      expect(holds(mutant), 'mutant must fail the check').toBe(false)
    })
  }
})
