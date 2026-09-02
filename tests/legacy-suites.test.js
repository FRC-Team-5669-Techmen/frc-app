// The standalone suites this repo had BEFORE `npm test` existed, gated by
// `npm test` as child processes so one command runs everything.
//
// `scripts/discord/calendar-sync.test.mjs` is a self-contained 19-case suite
// with its own fakes and its own runner. It is not converted to vitest and not
// edited: it is the harness a Deno-targeted engine is proved against under Node,
// and the bundle that added `tests/` may not touch `scripts/`. Running it here
// means a push cannot go green while it is red, which is what `npm test` is for.
//
// The pass count is asserted, not just the exit code. A suite that silently
// stopped registering cases would still exit 0 with "0/0 passed"; requiring the
// number to be at least what it was when this was written turns that into a
// failure. It is a FLOOR, not an equality, so adding a case there does not
// redden this file.

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, test } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const LEGACY = 'scripts/discord/calendar-sync.test.mjs'

/** Run a node script and return { status, out }. Never throws on a non-zero exit. */
function runScript(relPath, { cwd = REPO } = {}) {
  try {
    const out = execFileSync(process.execPath, [relPath], {
      cwd, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, out }
  } catch (err) {
    return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

const parsePassLine = (out) => {
  const m = /(\d+)\/(\d+) passed/.exec(out)
  return m ? { passed: Number(m[1]), total: Number(m[2]) } : null
}

describe(LEGACY, () => {
  const result = runScript(LEGACY)

  test('exits 0', () => {
    expect(result.status, result.out.slice(-3000)).toBe(0)
  })

  test('reports every case passing, and at least the 19 it had on 2026-09-02', () => {
    const counts = parsePassLine(result.out)
    expect(counts, `no "N/N passed" line in:\n${result.out.slice(-2000)}`).toBeTruthy()
    expect(counts.passed).toBe(counts.total)
    expect(counts.total).toBeGreaterThanOrEqual(19)
  })
})

describe('POSITIVE CONTROL: that suite can fail, and this wrapper sees it', () => {
  // Without this, "exits 0 and N/N passed" is satisfied by a script that no
  // longer runs a single case. A COPY of the real suite is broken in a temp
  // directory -- the repo file is never written to -- and must come back
  // non-zero with fewer passes than cases.
  //
  // The copy sits inside the repo tree (a temp dir under it) so its relative
  // imports of ../../supabase/... still resolve; a copy in /tmp would fail to
  // import and prove only that a missing file throws.
  const dir = mkdtempSync(join(REPO, 'scripts', 'discord', '.control-'))
  const copy = join(dir, 'calendar-sync.test.mjs')

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const source = readFileSync(join(REPO, LEGACY), 'utf8')
  // The imports go up two levels from scripts/discord/; the copy is one level
  // deeper, so they need one more.
  const broken = source
    .replace(/(['"])\.\.\/\.\.\//g, '$1../../../')
    .replace(
      "test('every run is logged'",
      "test('INJECTED FAILURE (positive control)', async () => { assert.equal(1, 2, 'injected') })\ntest('every run is logged'",
    )
  writeFileSync(copy, broken)

  const result = runScript(join('scripts', 'discord', dir.split('/').pop(), 'calendar-sync.test.mjs'))

  test('the injected case is reported as a failure', () => {
    expect(result.status).not.toBe(0)
    const counts = parsePassLine(result.out)
    expect(counts, `no "N/N passed" line in:\n${result.out.slice(-2000)}`).toBeTruthy()
    expect(counts.passed).toBeLessThan(counts.total)
    expect(result.out).toMatch(/INJECTED FAILURE/)
  })

  test('and the rest of the suite still passed, so the control is narrow', () => {
    const counts = parsePassLine(result.out)
    expect(counts.total - counts.passed).toBe(1)
  })

  test('the real file on disk is untouched', () => {
    expect(readFileSync(join(REPO, LEGACY), 'utf8')).toBe(source)
  })
})
