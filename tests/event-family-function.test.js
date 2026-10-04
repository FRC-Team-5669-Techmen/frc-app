// The event-family Edge Function, driven for real under Node.
//
// supabase/functions/event-family/index.ts is plain JavaScript in a .ts file
// (see its header), so this loads the ACTUAL file, swaps its two remote
// imports (supabase-js and the SMTP client) for in-memory fakes, gives it a
// fake Deno.env / Deno.serve, and calls the handler it registers. Nothing here
// reaches a network or a database.
//
// What it holds the function to -- it decides no rule, so this is all about
// forwarding faithfully and leaking nothing:
//   * a malformed token and an unknown one get the SAME 404, and a malformed
//     one never reaches the database;
//   * a rule's refusal (hub:<code>) reaches the family as 409 with the rule's
//     own sentence; any other error is a bare 500 that echoes nothing;
//   * the cron path needs the exact shared secret; "lost your link" answers
//     identically whether or not the address matched;
//   * mail: nothing is taken from the outbox while Gmail is unset; when it is,
//     each email's {{link}} becomes a freshly minted link and the outbox row
//     is marked sent, or failed when the send throws;
//   * staff "send now" needs a signed-in staff JWT.
// Every refusal sits beside the same request made by someone allowed.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'

const FN_PATH = fileURLToPath(new URL('../supabase/functions/event-family/index.ts', import.meta.url))
const SUPABASE_IMPORT = "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'"
const SMTP_IMPORT = "import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'"

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv'            // 22 chars, base64url
const MINTED = 'ZyXwVuTsRqPoNmLkJiHgFe'
const CRON_SECRET = 'stand-in-cron-secret-for-tests'
const GMAIL_PASS = 'stand-in-gmail-app-password'
const EVENT_ID = 'b1b12026-0000-4000-8000-000000000001'

let handler = null
let env = {}
let calls = []          // every rpc: { name, args, client }
let rpcAnswers = {}     // name -> (args) => { data, error }
let user = null         // what auth.getUser answers on the user-scoped client
let sends = []          // SMTP sends
let sendFails = false
let logs = []

function makeClient(url, key, opts = {}) {
  const kind = key === 'service-role-key' ? 'admin' : 'user'
  return {
    rpc: async (name, args) => {
      calls.push({ name, args, client: kind })
      const f = rpcAnswers[name]
      return f ? f(args, kind) : { data: null, error: null }
    },
    auth: { getUser: async () => ({ data: { user: kind === 'user' && opts?.global?.headers?.Authorization ? user : null } }) },
  }
}

class FakeSMTP {
  async send(msg) {
    if (sendFails) throw new Error('535 auth failed for stand-in')
    sends.push(msg)
  }
  async close() {}
}

async function call(body, headers = {}) {
  const res = await handler(new Request('https://fn.example/event-family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }))
  const text = await res.text()
  return { status: res.status, body: JSON.parse(text), text }
}

beforeAll(async () => {
  const source = readFileSync(FN_PATH, 'utf8')
  expect(source.split(SUPABASE_IMPORT).length - 1).toBe(1)
  expect(source.split(SMTP_IMPORT).length - 1).toBe(1)
  const dir = mkdtempSync(join(tmpdir(), 'event-family-fn-'))
  const file = join(dir, 'index.mjs')
  writeFileSync(file, source
    .replace(SUPABASE_IMPORT, 'const { createClient } = globalThis.__eventFamilyTest')
    .replace(SMTP_IMPORT, 'const { SMTPClient } = globalThis.__eventFamilyTest'))
  globalThis.__eventFamilyTest = { createClient: makeClient, SMTPClient: FakeSMTP }
  globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h } }
  await import(pathToFileURL(file).href)
  expect(typeof handler).toBe('function')
})

beforeEach(() => {
  env = {
    SUPABASE_URL: 'https://project.example', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_ANON_KEY: 'anon-key', EVENT_HUB_CRON_SECRET: CRON_SECRET, APP_URL: 'https://app.example/',
  }
  calls = []
  rpcAnswers = {}
  user = null
  sends = []
  sendFails = false
  logs = []
  console.error = (...a) => { logs.push(a.map(String).join(' ')) }
  delete globalThis.EdgeRuntime
})

const named = (n) => calls.filter((c) => c.name === n)

describe('a family, by token', () => {
  test('a malformed token and an unknown one get the same 404; only the well-formed one reaches the database', async () => {
    rpcAnswers.hub_family_call = () => ({ data: null, error: { code: 'P0002', message: 'hub:not_found', details: 'That link is not valid.' } })
    const malformed = await call({ token: 'short', action: 'fetch' })
    expect(named('hub_family_call')).toHaveLength(0)
    const unknown = await call({ token: TOKEN, action: 'fetch' })
    expect(named('hub_family_call')).toHaveLength(1)
    expect(malformed.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(unknown.text).toBe(malformed.text)
  })

  test('a valid token passes the action and args through unchanged and returns the page as the database built it', async () => {
    const view = { invite_id: 'i1', event: { id: EVENT_ID }, student: { name: 'Sam Student' } }
    rpcAnswers.hub_family_call = () => ({ data: view, error: null })
    const r = await call({ token: TOKEN, action: 'fetch' })
    expect(r.status).toBe(200)
    expect(r.body).toEqual(view)
    expect(named('hub_family_call')[0].args).toEqual({ p_token: TOKEN, p_action: 'fetch', p_args: {} })
    expect(named('hub_family_call')[0].client).toBe('admin')
  })

  test('a rule refusal reaches the family with its own sentence; any other error says only server_error', async () => {
    rpcAnswers.hub_family_call = () => ({ data: null, error: { code: 'P0001', message: 'hub:car_full', details: 'That car just filled. Pick another.' } })
    const refused = await call({ token: TOKEN, action: 'claim_seat', args: { car_id: 'c1' } })
    expect(refused.status).toBe(409)
    expect(refused.body).toEqual({ error: 'car_full', message: 'That car just filled. Pick another.' })

    rpcAnswers.hub_family_call = () => ({ data: null, error: { code: '42501', message: 'permission denied for table hub_seats', details: 'secret internals' } })
    const broken = await call({ token: TOKEN, action: 'claim_seat', args: { car_id: 'c1' } })
    expect(broken.status).toBe(500)
    expect(broken.body).toEqual({ error: 'server_error' })
    expect(broken.text).not.toContain('hub_seats')
  })

  test('an action that is not a family action is refused before the database', async () => {
    const r = await call({ token: TOKEN, action: 'send_invites' })
    expect(r.status).toBe(400)
    expect(named('hub_family_call')).toHaveLength(0)
  })

  test('after a change, that event\'s outbox is drained; a fetch drains nothing', async () => {
    env.GMAIL_USER = 'team@example.org'
    env.GMAIL_APP_PASSWORD = GMAIL_PASS
    rpcAnswers.hub_family_call = () => ({ data: { event: { id: EVENT_ID } }, error: null })
    rpcAnswers.hub_outbox_take = () => ({ data: [], error: null })
    await call({ token: TOKEN, action: 'fetch' })
    expect(named('hub_outbox_take')).toHaveLength(0)
    await call({ token: TOKEN, action: 'mark', args: { car_id: 'c1', what: 'left' } })
    expect(named('hub_outbox_take')).toHaveLength(1)
    expect(named('hub_outbox_take')[0].args).toEqual({ p_limit: 25, p_event: EVENT_ID })
  })
})

describe('mail', () => {
  const row = (id, extra = {}) => ({ id, to_emails: ['pat@example.com'], subject: 'Beach Blitz 2026: plan for Sam', body: 'Your page:\n{{link}}\n', link_invite_id: 'inv-1', ...extra })

  test('while Gmail is unset nothing is taken from the outbox, so nothing is lost; once set, it is', async () => {
    rpcAnswers.hub_cron_enqueue = () => ({ data: 3, error: null })
    rpcAnswers.hub_outbox_take = () => ({ data: [], error: null })
    const unset = await call({ action: 'cron' }, { 'x-cron-secret': CRON_SECRET })
    expect(unset.body.skipped).toBe('gmail_not_configured')
    expect(named('hub_outbox_take')).toHaveLength(0)
    env.GMAIL_USER = 'team@example.org'
    env.GMAIL_APP_PASSWORD = GMAIL_PASS
    await call({ action: 'cron' }, { 'x-cron-secret': CRON_SECRET })
    expect(named('hub_outbox_take')).toHaveLength(1)
  })

  test('each link is minted at send time and replaces {{link}}; the row is marked sent; a failed send is marked failed', async () => {
    env.GMAIL_USER = 'team@example.org'
    env.GMAIL_APP_PASSWORD = GMAIL_PASS
    rpcAnswers.hub_cron_enqueue = () => ({ data: 0, error: null })
    rpcAnswers.hub_outbox_take = () => ({ data: [row('o1'), row('o2', { link_invite_id: null, body: 'Car left at 6:02 AM.' })], error: null })
    rpcAnswers.hub_outbox_mint_link = () => ({ data: MINTED, error: null })
    const r = await call({ action: 'cron' }, { 'x-cron-secret': CRON_SECRET })
    expect(r.body).toMatchObject({ ok: true, sent: 2, failed: 0 })
    expect(named('hub_outbox_mint_link')).toHaveLength(1)
    expect(sends[0].content).toContain(`https://app.example/e/${MINTED}`)
    expect(sends[0].content).not.toContain('{{link}}')
    expect(sends[1].content).toBe('Car left at 6:02 AM.')
    expect(named('hub_outbox_done').map((c) => c.args.p_ok)).toEqual([true, true])
    expect(r.text).not.toContain(MINTED)

    calls = []
    sendFails = true
    const f = await call({ action: 'cron' }, { 'x-cron-secret': CRON_SECRET })
    expect(f.body).toMatchObject({ sent: 0, failed: 2 })
    expect(named('hub_outbox_done').map((c) => c.args.p_ok)).toEqual([false, false])
    expect(f.text).not.toContain(GMAIL_PASS)
  })
})

describe('the doors that are not a token', () => {
  test('cron needs the exact shared secret; the secret is never echoed', async () => {
    rpcAnswers.hub_cron_enqueue = () => ({ data: 0, error: null })
    const wrong = await call({ action: 'cron' }, { 'x-cron-secret': CRON_SECRET + 'x' })
    const none = await call({ action: 'cron' })
    expect(wrong.status).toBe(401)
    expect(none.status).toBe(401)
    expect(named('hub_cron_enqueue')).toHaveLength(0)
    const right = await call({ action: 'cron' }, { 'x-cron-secret': CRON_SECRET })
    expect(right.status).toBe(200)
    expect(named('hub_cron_enqueue')).toHaveLength(1)
    for (const r of [wrong, none, right]) expect(r.text).not.toContain(CRON_SECRET)
    expect(logs.join('\n')).not.toContain(CRON_SECRET)
  })

  test('"lost your link" answers identically for a known address and an unknown one', async () => {
    rpcAnswers.hub_resend_request = () => ({ data: null, error: null })
    const known = await call({ action: 'resend_link', email: 'pat@example.com' })
    const unknown = await call({ action: 'resend_link', email: 'nobody@example.com' })
    expect(known.status).toBe(200)
    expect(unknown.text).toBe(known.text)
    expect(named('hub_resend_request').map((c) => c.args.p_email)).toEqual(['pat@example.com', 'nobody@example.com'])
  })

  test('staff "send now" needs a signed-in staff member', async () => {
    env.GMAIL_USER = 'team@example.org'
    env.GMAIL_APP_PASSWORD = GMAIL_PASS
    rpcAnswers.hub_outbox_take = () => ({ data: [], error: null })
    const anon = await call({ action: 'drain', event_id: EVENT_ID })
    expect(anon.status).toBe(401)
    user = { id: 'student' }
    rpcAnswers.is_staff = () => ({ data: false, error: null })
    const student = await call({ action: 'drain', event_id: EVENT_ID }, { Authorization: 'Bearer student-jwt' })
    expect(student.status).toBe(403)
    expect(named('hub_outbox_take')).toHaveLength(0)
    user = { id: 'mentor' }
    rpcAnswers.is_staff = () => ({ data: true, error: null })
    const staff = await call({ action: 'drain', event_id: EVENT_ID }, { Authorization: 'Bearer mentor-jwt' })
    expect(staff.status).toBe(200)
    expect(named('hub_outbox_take')).toHaveLength(1)
    expect(named('is_staff').every((c) => c.client === 'user')).toBe(true)
  })
})
