// THE SERVICE ROLE STAYS IN ONE FILE. Under the connector's own code
// (api/mcp.js, api/connector/, api/_lib/connector/, src/Connector*), only
// api/_lib/connector/backend.js may name SUPABASE_SERVICE_ROLE_KEY, and inside
// it only `serviceClient()` reads it. Every tool runs through a client carrying
// the minted user's own session.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
function walk(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${e}`
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
    else if (/\.(js|jsx|mjs)$/.test(e)) out.push(rel)
  }
  return out
}
const connectorFiles = () => [
  'api/mcp.js',
  ...walk('api/connector'),
  ...walk('api/_lib/connector'),
  ...readdirSync(join(ROOT, 'src')).filter((f) => f.startsWith('Connector')).map((f) => `src/${f}`),
]
const SERVICE = /SUPABASE_SERVICE_ROLE_KEY|service_role|serviceClient/

export function filesNamingService(files, read = (f) => readFileSync(join(ROOT, f), 'utf8')) {
  return files.filter((f) => SERVICE.test(read(f)))
}

describe('the service role', () => {
  it('scans the connector files (positive control: there are at least ten, backend.js among them)', () => {
    const files = connectorFiles()
    expect(files.length).toBeGreaterThanOrEqual(10)
    expect(files).toContain('api/_lib/connector/backend.js')
  })
  it('is named in exactly one connector file, backend.js', () => {
    expect(filesNamingService(connectorFiles())).toEqual(['api/_lib/connector/backend.js'])
  })
  it('the scan catches a planted name (negative control for the scanner)', () => {
    const fake = { 'a.js': "const k = process.env.SUPABASE_SERVICE_ROLE_KEY", 'b.js': 'ok' }
    expect(filesNamingService(Object.keys(fake), (f) => fake[f])).toEqual(['a.js'])
  })
  it('inside backend.js the key is read once, by serviceClient, and the user half never calls it', () => {
    const text = readFileSync(join(ROOT, 'api/_lib/connector/backend.js'), 'utf8')
    expect(text.match(/SUPABASE_SERVICE_ROLE_KEY'\)/g)).toHaveLength(1)
    const userHalf = text.slice(text.indexOf('// ---- The user half'))
    expect(userHalf.length).toBeGreaterThan(200)
    expect(userHalf).not.toMatch(/serviceClient/)
    expect(userHalf).toMatch(/userClient\(session\.accessToken\)/)
  })
  it('the browser page never names it', () => {
    for (const f of connectorFiles().filter((x) => x.startsWith('src/'))) expect(readFileSync(join(ROOT, f), 'utf8')).not.toMatch(SERVICE)
  })
})
