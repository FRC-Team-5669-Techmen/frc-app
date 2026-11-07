import { parse } from '@babel/parser'
import { guideFor } from '../src/featureGuide.js'
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tourFor, tracksFor, CORE_VERSION } from '../src/tour/catalog.js'
import {
  freshProgress,
  readProgress,
  writeProgress,
  advance,
  coreComplete,
  positionFor,
} from '../src/tour/progress.js'

const ctx = { isStaff: false, isAdmin: false, isParent: false }
const sources = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(dir, e.name))
      : /\.(jsx|js)$/.test(e.name)
        ? [readFileSync(join(dir, e.name), 'utf8')]
        : [],
  )
// Inspect actual JSX attributes, never query-selector strings or comments.
function missing(steps, source) {
  const anchors = new Set()
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (
      node.type === 'JSXAttribute' &&
      node.name?.name === 'data-tour' &&
      node.value?.type === 'StringLiteral'
    )
      anchors.add(node.value.value)
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object') visit(value)
    }
  }
  for (const text of Array.isArray(source) ? source : [source]) {
    if (text.includes('data-tour'))
      visit(parse(text, { sourceType: 'module', plugins: ['jsx'] }))
  }
  return steps
    .filter((step) => !anchors.has(step.target))
    .map((step) => step.target)
}

describe('training contracts', () => {
  it('legacy dismissal cannot record completion', () => {
    expect(readFileSync('src/tour.js', 'utf8')).not.toContain(
      'onDestroyed: finish',
    )
    expect(readFileSync('src/App.jsx', 'utf8')).not.toContain(
      "'member_finish_tour'",
    )
  })
  it('all six tracks exist; operational tracks grant no staff view', () => {
    expect(tracksFor(ctx)).toEqual(['member', 'scout', 'driver', 'pit'])
    expect(tracksFor({ isParent: true })).toEqual(['parent'])
    expect(tracksFor({ isParent: true, isStaff: true })).toContain('mentor')
    expect(tourFor('scout', ctx).some((s) => s.path === '/manage')).toBe(false)
    expect(
      tourFor('mentor', { isStaff: true }).some((s) => s.path === '/manage'),
    ).toBe(true)
  })
  it('every anchor exists in JSX; a removed anchor fails the same contract', () => {
    const source = sources('src')
    const steps = [
      'member',
      'scout',
      'driver',
      'pit',
      'mentor',
      'parent',
    ].flatMap((t) =>
      tourFor(t, {
        isStaff: t === 'mentor',
        isParent: t === 'parent',
        isAdmin: t === 'mentor',
      }),
    )
    expect(steps.length).toBeGreaterThan(100)
    expect(missing(steps, source)).toEqual([])
    expect(
      missing(
        [{ target: 'schedule-view' }],
        source.map((text) => text.replaceAll('data-tour="schedule-view"', '')),
      ),
    ).toEqual(['schedule-view'])
  })
  it('skipping never completes core; all core activities do', () => {
    const steps = tourFor('member', ctx),
      p = freshProgress('member')
    let skipped = p,
      done = p
    for (let i = 0; i < steps.filter((s) => s.core).length; i++) {
      skipped = advance(skipped, steps, false)
      done = advance(done, steps, true)
    }
    expect(coreComplete(skipped, steps)).toBe(false)
    expect(coreComplete(done, steps)).toBe(true)
    expect(done.version).toBe(CORE_VERSION)
  })
  it('resume is scoped by account and version, validates step ids, handles denied storage', () => {
    const m = new Map(),
      storage = { getItem: (k) => m.get(k), setItem: (k, v) => m.set(k, v) }
    const p = { ...freshProgress('member'), index: 2, done: ['attendance'] }
    expect(writeProgress(storage, 'invented-a', p)).toBe(true)
    expect(readProgress(storage, 'invented-a')?.index).toBe(2)
    expect(readProgress(storage, 'invented-b')).toBe(null)
    storage.setItem(
      'techmen:training:invented-a',
      JSON.stringify({ ...p, version: 99 }),
    )
    expect(readProgress(storage, 'invented-a')).toBe(null)
    storage.setItem(
      'techmen:training:invented-a',
      JSON.stringify({ ...p, index: -1 }),
    )
    expect(readProgress(storage, 'invented-a')).toBe(null)
    expect(
      readProgress(
        {
          getItem() {
            throw Error('denied')
          },
        },
        'x',
      ),
    ).toBe(null)
    expect(
      writeProgress(
        {
          setItem() {
            throw Error('denied')
          },
        },
        'x',
        p,
      ),
    ).toBe(false)
  })
})

import { recordCore, loadCompletions } from '../src/tour/api.js'
import { _resetWriteVia } from '../src/writeVia.js'
describe('completion responses', () => {
  it('missing setup and failed reads cannot become completion or empty success', async () => {
    _resetWriteVia()
    for (const code of ['PGRST202', '42883']) {
      const client = { rpc: async () => ({ data: null, error: { code } }) }
      expect((await recordCore(client, 'member')).state).toBe('missing')
      expect((await loadCompletions(client)).state).toBe('missing')
    }
    expect(
      (
        await recordCore(
          { rpc: async () => ({ data: null, error: null }) },
          'member',
        )
      ).state,
    ).toBe('error')
    expect(
      (
        await loadCompletions({
          rpc: async () => ({ data: null, error: { code: '503' } }),
        })
      ).state,
    ).toBe('error')
    expect(
      (
        await recordCore(
          {
            rpc: async () => ({
              data: { member_id: 'invented', completed_at: '2026-11-06' },
              error: null,
            }),
          },
          'member',
        )
      ).state,
    ).toBe('saved')
  })
})

it('every role walkthrough retains every page in its feature catalog', () => {
  for (const track of [
    'member',
    'scout',
    'driver',
    'pit',
    'mentor',
    'parent',
  ]) {
    const ctx = {
      isStaff: track === 'mentor',
      isParent: track === 'parent',
      isAdmin: track === 'mentor',
    }
    const expected = new Set(guideFor(ctx).map((g) => g.path))
    const actual = new Set(
      tourFor(track, ctx)
        .map((s) => s.guidePath || s.path)
        .filter((p) => expected.has(p)),
    )
    expect(actual, track).toEqual(expected)
  }
})

it('resume keeps lesson identity when the catalog changes', () => {
  const steps = [{ id: 'one' }, { id: 'inserted' }, { id: 'two' }]
  expect(positionFor({ index: 1, stepId: 'two' }, steps)).toBe(2)
  expect(positionFor({ index: 1, stepId: 'missing' }, steps)).toBe(1)
  expect(positionFor({ index: 2, stepId: null }, steps)).toBe(3)
})

it('mentor tours omit admin-only pages, with a directly usable admin counterpart', () => {
  const mentor = tourFor('mentor', { isStaff: true, isAdmin: false })
  const admin = tourFor('mentor', { isStaff: true, isAdmin: true })
  for (const path of ['/roster', '/feedback', '/announce']) {
    const m = mentor.find((s) => s.path === path),
      a = admin.find((s) => s.path === path)
    expect(m).toBeUndefined()
    expect(a.reference).toBe(false)
  }
})

it('selector strings are not a declaration of a real tour target', () => {
  const code = `const query = '[data-tour="removed-target"]'; const View = () => <section data-tour="real-target"/>`
  expect(missing([{ target: 'real-target' }], code)).toEqual([])
  expect(missing([{ target: 'removed-target' }], code)).toEqual([
    'removed-target',
  ])
})
