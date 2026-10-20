// .github/workflows/connector.yml: runs the connector build on a push to main,
// reads no credential, cannot loop, never forces, and checks the tree before
// it pushes (solo mode: every push to main deploys).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import YAML from 'yaml'

const text = readFileSync(new URL('../.github/workflows/connector.yml', import.meta.url), 'utf8')
const doc = YAML.parse(text)
const on = doc.on ?? doc[true]
const job = doc.jobs.regenerate
const run = job.steps.map((s) => s.run ?? '').join('\n')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

describe('connector.yml', () => {
  it('runs on a push to main and by hand, and runs the real build script (positive control)', () => {
    expect(on.push.branches).toEqual(['main'])
    expect(Object.keys(on)).toEqual(expect.arrayContaining(['push', 'workflow_dispatch']))
    expect(run).toContain('npm run connector:build')
    expect(pkg.scripts['connector:build']).toBe('node tools/connector/build.mjs')
  })
  it('reads no secret and writes only contents', () => {
    expect(text).not.toMatch(/secrets\./)
    expect(doc.permissions).toEqual({ contents: 'write' })
  })
  it('skips its own commits, and never forces', () => {
    expect(job.if).toMatch(/github-actions\[bot\]/)
    expect(text).not.toMatch(/push[^\n]*--force/)
    expect(text).not.toMatch(/push -f\b/)
  })
  it('checks the tree before it pushes: the connector tests and the build run before the commit', () => {
    const step = job.steps.find((s) => /git commit/.test(s.run ?? '')).run
    expect(step.indexOf('npx vitest run tests/connector-coverage.test.js')).toBeGreaterThan(-1)
    expect(step.indexOf('npm run build')).toBeLessThan(step.indexOf('git commit'))
    expect(step.indexOf('npx vitest run')).toBeLessThan(step.indexOf('git commit'))
  })
  it('commits only the generated registry', () => {
    expect(text).toMatch(/FILE: api\/_lib\/connector\/registry\.generated\.js/)
    expect(text).toMatch(/git add -- "\$FILE"/)
  })
})
