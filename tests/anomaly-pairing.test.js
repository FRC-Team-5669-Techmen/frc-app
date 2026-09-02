// The anomaly-resolve routing contract: `detectAnomalies` (src/accountability.js)
// and `unclosedInIds` (src/MemberHoursAdmin.jsx) must agree about which check-in
// is the orphan, because the Resolve button writes a check-out against whatever
// `unclosedInIds` returns.
//
// WHY unclosedInIds EXISTS AT ALL, and why it cannot simply read
// `sessionsFromEvents`: that function OVERWRITES an open IN when a second IN
// arrives, so a `double_in` orphan produces no session row to read. This suite
// pins both halves of that -- the pairing function's answers, and the shape of
// `eventIds` the two surfaces route on.
//
// THE SHIPPED FUNCTION IS THE ONE UNDER TEST. `unclosedInIds` is module-private
// in a .jsx file full of React, so it is extracted from the source by locating
// its own text and evaluated. That is deliberately more awkward than importing
// it: a copy pasted into this file would be a second implementation that passes
// forever while the shipped one drifts. The extraction asserts it found a real
// function before using it, and a POSITIVE CONTROL mutates the extracted source
// in memory (never the file) to prove these assertions can fail.
//
// Rebuilt rather than referenced: the log records this measured inside a
// harness that was deleted after the run.

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { detectAnomalies } from '../src/accountability.js'

const SRC = readFileSync(new URL('../src/MemberHoursAdmin.jsx', import.meta.url), 'utf8')

/** Pull one top-level `function name(...) { ... }` out of a source file by brace matching. */
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`${name} is not in the source -- it was renamed, moved or deleted`)
  let depth = 0
  let i = source.indexOf('{', start)
  const open = i
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`${name}: braces never closed`)
}

const compile = (src) => new Function(`${src}; return unclosedInIds`)()

const SHIPPED_SRC = extractFunction(SRC, 'unclosedInIds')
const unclosedInIds = compile(SHIPPED_SRC)

const ev = (id, type, time, over = {}) => ({ id, type, event_time: time, ...over })
const D = '2026-09-02'
const t = (hhmm) => `${D}T${hhmm}:00.000Z`

// Seven ledgers, the shapes this pairing actually meets in the wild.
const LEDGERS = {
  clean: [ev('i1', 'in', t('16:00')), ev('o1', 'out', t('20:00'))],
  openNow: [ev('i1', 'in', new Date(Date.now() - 30 * 60000).toISOString())],
  doubleIn: [ev('i1', 'in', t('15:00')), ev('i2', 'in', t('16:00')), ev('o1', 'out', t('20:00'))],
  twoInsNoOut: [ev('i1', 'in', t('15:00')), ev('i2', 'in', t('16:00'))],
  twoCleanDays: [
    ev('i1', 'in', t('16:00')), ev('o1', 'out', t('18:00')),
    ev('i2', 'in', '2026-09-03T16:00:00.000Z'), ev('o2', 'out', '2026-09-03T18:00:00.000Z'),
  ],
  orphanThenClean: [
    ev('i1', 'in', t('09:00')),
    ev('i2', 'in', t('16:00')), ev('o2', 'out', t('20:00')),
  ],
  outOfOrder: [ev('o1', 'out', t('20:00')), ev('i1', 'in', t('16:00'))],
}

describe('unclosedInIds, as shipped', () => {
  test('the extraction found the real function, not a comment about it', () => {
    expect(SHIPPED_SRC).toMatch(/function unclosedInIds\(events\)/)
    expect(SHIPPED_SRC).toMatch(/e\.type === 'in'/)
    expect(typeof unclosedInIds).toBe('function')
  })

  test('a clean closed pair leaves nothing unclosed', () => {
    expect([...unclosedInIds(LEDGERS.clean)]).toEqual([])
  })

  test('a live open session IS reported unclosed', () => {
    expect([...unclosedInIds(LEDGERS.openNow)]).toEqual(['i1'])
  })

  test('a double check-in reports the ORPHAN, not the one that got closed', () => {
    expect([...unclosedInIds(LEDGERS.doubleIn)]).toEqual(['i1'])
  })

  test('two INs with no OUT at all report both', () => {
    expect([...unclosedInIds(LEDGERS.twoInsNoOut).values()].sort()).toEqual(['i1', 'i2'])
  })

  test('two clean days report nothing', () => {
    expect([...unclosedInIds(LEDGERS.twoCleanDays)]).toEqual([])
  })

  test('an orphan followed by a clean pair reports only the orphan', () => {
    expect([...unclosedInIds(LEDGERS.orphanThenClean)]).toEqual(['i1'])
  })

  test('events out of order are sorted first', () => {
    expect([...unclosedInIds(LEDGERS.outOfOrder)]).toEqual([])
  })
})

describe('POSITIVE CONTROL: the orphan-IN branch is load-bearing', () => {
  // Remove the one line that records the previous open IN when a second arrives
  // -- in memory, never on disk -- and require the suite above to break. Without
  // this, every assertion here would pass against a function that had quietly
  // stopped detecting orphans and returned an empty set.
  const broken = compile(SHIPPED_SRC.replace('if (openIn) ids.add(openIn.id)', ''))

  test('the mutated pairing no longer finds the orphan in three ledgers', () => {
    expect([...broken(LEDGERS.doubleIn)]).toEqual([])
    expect([...broken(LEDGERS.twoInsNoOut)]).toEqual(['i2'])
    expect([...broken(LEDGERS.orphanThenClean)]).toEqual([])
  })

  test('the mutation really changed the function it was applied to', () => {
    expect(broken.toString()).not.toBe(unclosedInIds.toString())
    // and the clean cases are unaffected, so the control is narrow
    expect([...broken(LEDGERS.clean)]).toEqual([])
  })
})

describe('detectAnomalies and the eventIds shape the resolve UI routes on', () => {
  test('double_in always carries [orphan, next] -- the inline-resolve case', () => {
    const [a] = detectAnomalies(LEDGERS.doubleIn).filter((x) => x.kind === 'double_in')
    expect(a).toBeTruthy()
    expect(a.eventIds).toEqual(['i1', 'i2'])
    // eventIds[0] is what the resolve card writes a check-out against.
    expect(unclosedInIds(LEDGERS.doubleIn).has(a.eventIds[0])).toBe(true)
  })

  test('a trailing open IN is NOT a double_in -- it is the live session', () => {
    expect(detectAnomalies(LEDGERS.openNow).filter((x) => x.kind === 'double_in')).toHaveLength(0)
  })

  test('capped with ONE id is a still-open stale session: the missed check-out', () => {
    const stale = [ev('i1', 'in', new Date(Date.now() - 30 * 3600_000).toISOString())]
    const [a] = detectAnomalies(stale).filter((x) => x.kind === 'capped')
    expect(a).toBeTruthy()
    expect(a.eventIds).toHaveLength(1)
    expect(a.eventIds[0]).toBe('i1')
  })

  test('capped with TWO ids means a real check-out exists: the edit case', () => {
    // A closed pair longer than the cap. Adding a second OUT would not fix it,
    // which is why this one routes to MemberHoursAdmin instead of resolving inline.
    const long = [ev('i1', 'in', t('06:00')), ev('o1', 'out', '2026-09-03T06:00:00.000Z')]
    const [a] = detectAnomalies(long).filter((x) => x.kind === 'capped')
    expect(a).toBeTruthy()
    expect(a.eventIds).toEqual(['i1', 'o1'])
  })

  test('geofence fires for a non-exempt member and is suppressed for an exempt one', () => {
    const events = [ev('i1', 'in', t('16:00'), { geo_ok: false }), ev('o1', 'out', t('20:00'))]
    expect(detectAnomalies(events).filter((x) => x.kind === 'geofence')).toHaveLength(1)
    expect(detectAnomalies(events, { exempt: true }).filter((x) => x.kind === 'geofence')).toHaveLength(0)
  })

  test('POSITIVE CONTROL: a clean ledger raises nothing at all', () => {
    // The suppression assertion above is satisfied by a detector that returns
    // nothing ever; this pins the other end against the same shape of fixture.
    expect(detectAnomalies(LEDGERS.twoCleanDays)).toEqual([])
    expect(detectAnomalies(LEDGERS.doubleIn).length).toBeGreaterThan(0)
  })
})
