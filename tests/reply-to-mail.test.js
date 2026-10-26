// Every Edge Function that sends mail over denomailer must put Reply-To on the
// message: apina@boscotech.edu by default, EMAIL_REPLY_TO when set. Each function
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
import { beforeEach, describe, expect, test } from 'vitest'

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

describe.each(Object.keys(SENDERS))('%s', (fn) => {
  const s = SENDERS[fn]
  const run = async (extraEnv) => {
    env = { SUPABASE_URL: 'https://p.example', SUPABASE_SERVICE_ROLE_KEY: 'srv', SUPABASE_ANON_KEY: 'anon', ...s.env, ...extraEnv }
    const tables = { ...s.tables }
    const h = await load(fn, tables)
    await s.drive(h)
  }

  test('Reply-To defaults to apina@boscotech.edu, From unchanged', async () => {
    await run(GMAIL)
    expect(sends).toHaveLength(1)
    expect(sends[0].replyTo).toBe(DEFAULT)
    expect(sends[0].from).toBe(`Techmen 5669 <${GMAIL.GMAIL_USER}>`)
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
})

describe('invite-member', () => {
  test('uses Supabase Auth mail, not denomailer: no SMTPClient, no Reply-To to set', () => {
    const src = srcOf('invite-member')
    expect(src).not.toMatch(/SMTPClient|denomailer/)
    expect(src).toMatch(/inviteUserByEmail/)
  })
})
