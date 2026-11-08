import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { transformWithEsbuild } from 'vite'
import { afterEach, expect, test, vi } from 'vitest'

const source = fn => readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8')
const dirs = []
afterEach(() => { vi.unstubAllGlobals(); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })) })

async function load(fn, { user = { id: 'synthetic-staff' }, staff = true, roleError = null, member = { id: 'synthetic-member', approved: true, status: 'active' }, lookupError = null, approved = true } = {}, text = source(fn)) {
  const sends = [], reads = []
  let handler
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async () => ({ data: staff, error: roleError }),
    from(table) {
      reads.push(table)
      const result = table === 'approved_emails' ? { data: approved ? { email: 'synthetic@example.invalid' } : null, error: lookupError }
        : table === 'profiles' ? { data: member, error: lookupError }
        : { data: [], error: null }
      const q = new Proxy({}, { get: (_, key) => key === 'then' ? resolve => resolve(result) : () => q })
      return q
    },
  }
  vi.stubGlobal('__securityEdge', { createClient: () => client, SMTPClient: class {}, createMailer: () => ({ send: async msg => sends.push(msg), close: async () => {} }) })
  vi.stubGlobal('Deno', { env: { get: key => ({ SUPABASE_URL: 'https://synthetic.example.invalid', SUPABASE_ANON_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' })[key] }, serve: h => { handler = h } })
  const swapped = text.replace(/^import .*createClient.*$/m, 'const { createClient } = globalThis.__securityEdge')
    .replace(/^import .*SMTPClient.*$/m, 'const { SMTPClient } = globalThis.__securityEdge')
    .replace(/^import .*createMailer.*$/m, 'const { createMailer } = globalThis.__securityEdge')
  const { code } = await transformWithEsbuild(swapped, 'index.ts', { loader: 'ts' })
  const dir = mkdtempSync(join(tmpdir(), 'security-edge-')); dirs.push(dir)
  const file = join(dir, 'index.mjs'); writeFileSync(file, code)
  await import(pathToFileURL(file).href)
  return { handler, sends, reads }
}
const post = h => h(new Request('https://synthetic.example.invalid', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'synthetic@example.invalid', full_name: '<img src=x> & "Synthetic"' }) }))
const feed = h => h(new Request('https://synthetic.example.invalid?token=synthetic'))

test.each([
  ['signed out', { user: null }, 401],
  ['nonstaff', { staff: false }, 403],
  ['role lookup failed', { roleError: { message: 'unavailable' } }, 403],
])('approval mail refuses %s before privileged reads or sending', async (_, options, status) => {
  const r = await load('send-approval-email', options)
  expect((await post(r.handler)).status).toBe(status)
  expect(r.sends).toHaveLength(0)
  expect(r.reads).toHaveLength(0)
})
test('staff approval mail works and escapes the recipient display name', async () => {
  const r = await load('send-approval-email')
  expect((await post(r.handler)).status).toBe(200)
  expect(r.sends).toHaveLength(1)
  expect(r.sends[0].html).toContain('&lt;img src=x&gt; &amp; &quot;Synthetic&quot;')
  expect(r.sends[0].content).toContain('<img src=x> & "Synthetic"')
})
test('approval mail still requires a whitelist entry', async () => {
  const r = await load('send-approval-email', { approved: false })
  expect((await post(r.handler)).status).toBe(403)
  expect(r.sends).toHaveLength(0)
})
test.each([
  ['pending', { approved: false, status: 'active' }],
  ['inactive', { approved: true, status: 'inactive' }],
  ['alumni', { approved: true, status: 'alumni' }],
])('calendar refuses %s before reading events', async (_, member) => {
  const r = await load('calendar-feed', { member: { id: 'synthetic', ...member } })
  expect((await feed(r.handler)).status).toBe(401)
  expect(r.reads).toEqual(['profiles'])
})
test.each([{ member: null }, { lookupError: { message: 'unavailable' } }])('calendar refuses a missing/failed token lookup', async options => {
  const r = await load('calendar-feed', options)
  expect((await feed(r.handler)).status).toBe(401)
  expect(r.reads).toEqual(['profiles'])
})
test('approved active member receives an iCalendar feed', async () => {
  const r = await load('calendar-feed')
  const response = await feed(r.handler)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('BEGIN:VCALENDAR\r\n')
  expect(r.reads).toContain('events')
})

const edgeMutants = [
  ['approval identity', 'send-approval-email', { user: null }, 'if (userError || !user)', 'if (false)', 401],
  ['approval staff', 'send-approval-email', { staff: false }, 'if (roleError || !isStaff)', 'if (false)', 403],
  ['approval role lookup', 'send-approval-email', { roleError: { message: 'unavailable' } }, 'roleError || !isStaff', '!isStaff', 403],
  ['calendar approval', 'calendar-feed', { member: { id: 'synthetic', approved: false, status: 'active' } }, 'member.approved !== true', 'false', 401],
  ['calendar active status', 'calendar-feed', { member: { id: 'synthetic', approved: true, status: 'inactive' } }, "member.status !== 'active'", 'false', 401],
]
test.each(edgeMutants)('permissive mutation proof: %s', async (_, fn, options, find, replacement, status) => {
  const original = source(fn)
  expect(original).toContain(find)
  const oracle = async text => {
    const r = await load(fn, options, text)
    const response = await (fn === 'calendar-feed' ? feed(r.handler) : post(r.handler))
    if (response.status !== status || r.sends.length || r.reads.some(t => t !== 'profiles')) throw new Error('boundary opened')
  }
  await oracle(original)
  await expect(oracle(original.replace(find, () => replacement))).rejects.toThrow('boundary opened')
  await oracle(original)
  expect(source(fn)).toBe(original)
})
test('HTML escaping mutation is detected and source bytes are unchanged', async () => {
  const original = source('send-approval-email')
  const oracle = async text => {
    const r = await load('send-approval-email', {}, text)
    await post(r.handler)
    if (!r.sends[0].html.includes('&lt;img src=x&gt; &amp; &quot;Synthetic&quot;')) throw new Error('name escaping removed')
  }
  await oracle(original)
  await expect(oracle(original.replace('<p>Hi ${htmlName},</p>', '<p>Hi ${name},</p>'))).rejects.toThrow('name escaping removed')
  await oracle(original)
  expect(source('send-approval-email')).toBe(original)
})
