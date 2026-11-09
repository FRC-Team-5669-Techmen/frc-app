// Every Vercel function under api/ must load. A module that fails to load
// (2026-11-08: two imports both named boardView in api/_lib/connector/tools.js)
// makes Vercel answer FUNCTION_INVOCATION_FAILED on every request, so the
// whole Techmen connector went dark while every other test stayed green.
// Plain Node loads each file, not Vitest: Vite rewrites imports and does not
// reject a duplicate binding, so an in-process import passes a broken module.
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

function entries(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name.startsWith('_') ? [] : entries(path)
    return name.endsWith('.js') && !name.includes('.test.') ? [path] : []
  })
}

describe('api entry points', () => {
  const files = entries('api')
  it('finds the connector entry', () => {
    expect(files.map((f) => relative('.', f))).toContain(join('api', 'mcp.js'))
  })
  it.each(files)('%s loads in plain Node', (file) => {
    const url = pathToFileURL(file).href
    const out = execFileSync(process.execPath, ['--input-type=module', '-e',
      `const m = await import(${JSON.stringify(url)}); console.log(typeof m.default)`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    expect(out.trim()).toBe('function')
  })
})
