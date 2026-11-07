// Every mail function uses shared delivery. Legacy SMTP retains ledger 0027's
// Reply-To, while Workspace uses EMAIL_FROM for all sender identities. Each function
// is loaded from its real file under Node with its two remote imports swapped for
// fakes (the same technique as tests/event-family-function.test.js), driven down
// its send path, and the message the stubbed SMTP client received is inspected.
// invite-member sends through Supabase Auth, not denomailer, so it is asserted
// to NOT use SMTPClient (nothing to set there).

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transformWithEsbuild } from 'vite'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

const SUPABASE_IMPORT = "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'"
const SMTP_IMPORT = "import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'"
const DEFAULT = 'apina@boscotech.edu'
const OVERRIDE = 'someone.else@example.org'
const srcOf = (fn) => readFileSync(fileURLToPath(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url)), 'utf8')

let env = {}
let sends = []
let handler = null

class FakeSMTP {
  async send(msg) { sends.push(msg) }
  async close() {}
}

// A chainable query stub: every method returns itself, awaiting it (or maybeSingle) yields `answer`.
function query(answer) {
  const q = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return (res) => res(answer)
      if (prop === 'maybeSingle' || prop === 'single') return async () => answer
      return () => q
    },
  })
  return q
}

function makeClient(tables) {
  return () => ({
    from: (t) => query(tables[t] ?? { data: null, error: null }),
    rpc: async (name) => name === 'hub_outbox_take'
      ? { data: [{ id: 'o1', to_emails: ['mom@example.org'], subject: 'S', body: 'B', link_invite_id: null }], error: null }
      : { data: true, error: null },
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  })
}

async function load(fn, tables) {
  const source = srcOf(fn)
  expect(source.split(SUPABASE_IMPORT).length - 1).toBe(1)
  expect(source.split(SMTP_IMPORT).length - 1).toBe(1)
  const swapped = source
    .replace(SUPABASE_IMPORT, 'const { createClient } = globalThis.__replyToTest')
    .replace(SMTP_IMPORT, 'const { SMTPClient } = globalThis.__replyToTest')
    .replace("'../_shared/mail.js'", JSON.stringify(new URL('../supabase/functions/_shared/mail.js', import.meta.url).href))
  const { code: js } = await transformWithEsbuild(swapped, 'index.ts', { loader: 'ts' })   // strip the types
  const dir = mkdtempSync(join(tmpdir(), 'reply-to-'))
  const file = join(dir, 'index.mjs')
  writeFileSync(file, js)
  globalThis.__replyToTest = { createClient: makeClient(tables), SMTPClient: FakeSMTP }
  globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h } }
  await import(pathToFileURL(file).href + `?t=${Math.random()}`)
  return handler
}

const post = (h, body, headers = {}) => h(new Request('https://fn.example/x', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
}))

const GMAIL = { GMAIL_USER: 'sender@gmail.example', GMAIL_APP_PASSWORD: 'pw' }

const SENDERS = {
  'send-approval-email': {
    env: {}, tables: { approved_emails: { data: { email: 'kid@example.org' }, error: null } },
    drive: (h) => post(h, { email: 'kid@example.org', full_name: 'Kid' }),
  },
  'send-parent-request': {
    env: {},
    tables: { member_applications: { data: { id: 'a1', member_id: 'u1', parent_email: 'mom@example.org', parent_token: 't', legal_first_name: 'K', legal_last_name: 'S' }, error: null } },
    drive: (h) => post(h, { application_id: 'a1' }, { Authorization: 'Bearer x' }),
  },
  'notice-mail': {
    env: { NOTICE_MAIL_SECRET: 'sec' },
    tables: { notice_outbox: { data: [{ id: 1, to_email: 'mom@example.org', subject: 'S', body: 'B' }], error: null } },
    drive: (h) => post(h, {}, { 'x-cron-secret': 'sec' }),
  },
  'event-family': {
    env: { EVENT_HUB_CRON_SECRET: 'sec', SUPABASE_ANON_KEY: 'anon' },
    tables: {},
    drive: (h) => post(h, { action: 'cron' }, { 'x-cron-secret': 'sec' }),
  },
}

beforeEach(() => { env = {}; sends = []; handler = null })
afterEach(() => vi.unstubAllGlobals())

// Generated disposable key, never a real service account credential.
let privateKey
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  privateKey = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`
})

describe.each(Object.keys(SENDERS))('%s', (fn) => {
  const s = SENDERS[fn]
  const run = async (extraEnv) => {
    env = { SUPABASE_URL: 'https://p.example', SUPABASE_SERVICE_ROLE_KEY: 'srv', SUPABASE_ANON_KEY: 'anon', ...s.env, ...extraEnv }
    const tables = { ...s.tables }
    const h = await load(fn, tables)
    return s.drive(h)
  }

  test('Reply-To defaults to apina@boscotech.edu, From unchanged', async () => {
    await run(GMAIL)
    expect(sends).toHaveLength(1)
    expect(sends[0].replyTo).toBe(DEFAULT)
    expect(sends[0].from).toBe(`Techmen 5669 <${GMAIL.GMAIL_USER}>`)
    if (fn === 'send-approval-email') {
      for (const key of ['subject', 'content', 'html']) expect(sends[0][key]).not.toContain('\u2014')
    }
  })

  test('EMAIL_REPLY_TO overrides it', async () => {
    await run({ ...GMAIL, EMAIL_REPLY_TO: OVERRIDE })
    expect(sends).toHaveLength(1)
    expect(sends[0].replyTo).toBe(OVERRIDE)
  })

  test('nothing is sent (and so nothing to set) while Gmail is unset', async () => {
    await run({})
    expect(sends).toHaveLength(0)
  })

  test.each([true, false])('Workspace sends only from the configured school mailbox (legacy credentials present: %s)', async (oldPresent) => {
    const messages = []
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'stand-in-token', expires_in: 3600 })
      expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
      messages.push(Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8'))
      return Response.json({ id: 'message-1' })
    }))
    await run({
      ...(oldPresent ? { ...GMAIL, GMAIL_USER: 'retired.sender@gmail.com' } : {}), EMAIL_REPLY_TO: 'retired.sender@gmail.com',
      EMAIL_FROM: 'Techmen 5669 <coach@school.example>',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'mailer@project.example.iam.gserviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
    })
    expect(messages).toHaveLength(1) // positive control: a message actually left
    const headers = messages[0].split('\r\n\r\n')[0]
    expect(headers).toContain('From: Techmen 5669 <coach@school.example>\r\n')
    expect(headers).toContain('Reply-To: coach@school.example\r\n')
    expect(headers).not.toContain('retired.sender@gmail.com')
    expect(sends).toHaveLength(0) // cannot silently send through the old account
  })

  test('Workspace auth failure stays visible without sending through the old Gmail account', async () => {
    const provider = vi.fn(async () => Response.json({ error: 'private provider details' }, { status: 403 }))
    vi.stubGlobal('fetch', provider)
    const response = await run({
      ...GMAIL, EMAIL_FROM: 'Techmen 5669 <coach@school.example>',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'mailer@project.example.iam.gserviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
    })
    const body = await response.json()
    expect(body.sent).toBe(fn === 'send-approval-email' || fn === 'send-parent-request' ? false : 0)
    if (fn === 'event-family') expect(body.failed).toBe(1)
    expect(provider).toHaveBeenCalledOnce()
    expect(sends).toHaveLength(0)
    expect(JSON.stringify(body)).not.toContain('private provider details')
  })
})

describe('invite-member', () => {
  test('uses Supabase Auth mail, not denomailer: no SMTPClient, no Reply-To to set', () => {
    const src = srcOf('invite-member')
    expect(src).not.toMatch(/SMTPClient|denomailer/)
    expect(src).toMatch(/inviteUserByEmail/)
  })
})
