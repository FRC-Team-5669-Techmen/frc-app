// The discord-announce Edge Function, driven for real under Node.
//
// supabase/functions/discord-announce/index.ts is plain JavaScript in a .ts
// file (see its header), so this loads the ACTUAL file, swaps its one remote
// import for an in-memory Supabase, gives it a fake Deno.env / Deno.serve and a
// fake Discord behind fetch, and calls the handler it registers. Nothing here
// reaches a network.
//
// What it holds the function to: only an admin gets past the door; what is
// missing is named, never a value; the payload sent to Discord is the one the
// shared builder makes, with allowed_mentions pinned to the selected rows; a
// row is reserved before Discord is called and a second request with the same
// id posts nothing; a refusal and a non-answer are logged differently; a dry
// run posts and logs nothing. Each refusal sits beside the same request made
// by someone or something that is allowed, so a function that refused
// everything would fail here.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { buildAnnouncePayload, normalizeDraft } from '../src/discordAnnounce.js'

const FN_PATH = fileURLToPath(new URL('../supabase/functions/discord-announce/index.ts', import.meta.url))
const IMPORT_LINE = "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'"

// Fictional ids and stand-in secrets: the shape of real ones, nobody's real
// values. The token is distinctive so a leak is a substring match.
const GUILD = '100000000000000777'
const CH_ANNOUNCE = '100000000000000100'
const CH_PARENTS = '100000000000000101'
const MECH = '100000000000000001'
const PROG = '100000000000000003'
const GHOST = '100000000000000008'   // in the table, not in the server
const ADMIN_ID = '00000000-0000-0000-0000-0000000000a1'
const STUDENT_ID = '00000000-0000-0000-0000-0000000000c1'
const FAKE_TOKEN = 'stand-in-bot-token-for-tests-only'

let handler = null
const env = {}
let db = null
let discord = null

// ── An in-memory Supabase, just wide enough for this function ──────────────
function makeDb() {
  return {
    missingTables: new Set(),
    tables: {
      discord_announce_roles: [
        { id: 'r1', name: 'Mechanical', role_id: MECH, active: true, sort_order: 10 },
        { id: 'r2', name: 'Programming', role_id: PROG, active: true, sort_order: 30 },
        { id: 'r3', name: 'Ghost', role_id: GHOST, active: true, sort_order: 40 },
      ],
      discord_announcements: [],
      profiles: [
        { id: ADMIN_ID, full_name: 'Ada Admin', nickname: 'Ada' },
        { id: STUDENT_ID, full_name: 'Sam Student', nickname: null },
      ],
    },
  }
}

function query(table) {
  const filters = []
  let op = 'select'
  let patch = null
  let row = null
  const missing = () => ({ data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } })
  const rows = () => db.tables[table].filter(r => filters.every(([k, v]) => r[k] === v))
  const run = (shape) => {
    if (db.missingTables.has(table)) return missing()
    if (op === 'select') {
      const found = rows()
      if (shape === 'maybeSingle') return { data: found[0] ?? null, error: null }
      if (shape === 'single') return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { code: 'PGRST116' } }
      return { data: found.map(r => ({ ...r })), error: null }
    }
    if (op === 'insert') {
      if (table === 'discord_announcements' && db.tables[table].some(r => r.request_id === row.request_id)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "discord_announcements_request_id_key"' } }
      }
      const stored = { id: `log-${db.tables[table].length + 1}`, ...row }
      db.tables[table].push(stored)
      return { data: shape ? { id: stored.id } : null, error: null }
    }
    if (op === 'update') {
      for (const r of rows()) Object.assign(r, patch)
      return { data: null, error: null }
    }
    throw new Error(`fake db: unsupported ${op}`)
  }
  const builder = {
    select() { return builder },
    insert(r) { op = 'insert'; row = r; return builder },
    update(p) { op = 'update'; patch = p; return builder },
    eq(k, v) { filters.push([k, v]); return builder },
    maybeSingle() { return Promise.resolve(run('maybeSingle')) },
    single() { return Promise.resolve(run('single')) },
    then(resolve, reject) { return Promise.resolve(run(null)).then(resolve, reject) },
  }
  return builder
}

function createClient(_url, key, opts = {}) {
  const auth = opts?.global?.headers?.Authorization ?? ''
  const userFor = { 'Bearer admin-jwt': ADMIN_ID, 'Bearer student-jwt': STUDENT_ID }
  const uid = key === env.SUPABASE_ANON_KEY ? userFor[auth] : null
  return {
    auth: { getUser: async () => ({ data: { user: uid ? { id: uid } : null }, error: null }) },
    rpc: async (name) => (name === 'is_admin' ? { data: uid === ADMIN_ID, error: null } : { data: null, error: { code: '42883' } }),
    from: (table) => {
      if (key !== env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('the function read a table without the service role')
      return query(table)
    },
  }
}

// ── A fake Discord behind fetch ─────────────────────────────────────────────
function makeDiscord() {
  return {
    calls: [],
    postResult: () => ({ status: 200, body: { id: '100000000000009999' } }),
    channels: [
      { id: CH_ANNOUNCE, name: 'announcements', type: 0 },
      { id: CH_PARENTS, name: 'parents', type: 0 },
      { id: '100000000000000102', name: 'General VC', type: 2 },
    ],
    roles: [
      { id: GUILD, name: '@everyone', mentionable: false },
      { id: MECH, name: 'Mechanical', mentionable: true },
      { id: PROG, name: 'Programming', mentionable: false },
    ],
  }
}

async function fakeFetch(url, init = {}) {
  const u = new URL(url)
  const path = u.pathname.replace(/^\/api\/v10/, '')
  const call = { method: init.method, path, auth: init.headers?.Authorization, body: init.body ? JSON.parse(init.body) : undefined }
  discord.calls.push(call)
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (call.auth !== `Bot ${env.DISCORD_BOT_TOKEN}`) return reply(401, { message: '401: Unauthorized', code: 0 })
  if (init.method === 'GET' && path === `/guilds/${GUILD}/channels`) return reply(200, discord.channels)
  if (init.method === 'GET' && path === `/guilds/${GUILD}/roles`) return reply(200, discord.roles)
  if (init.method === 'POST' && /^\/channels\/\d+\/messages$/.test(path)) {
    const r = discord.postResult(call)
    if (r.throw) throw new TypeError(r.throw)
    return reply(r.status, r.body)
  }
  return reply(404, { message: 'Unknown', code: 0 })
}

const posts = () => discord.calls.filter(c => c.method === 'POST')

async function call(body, { jwt = 'admin-jwt', method = 'POST' } = {}) {
  const res = await handler(new Request('http://localhost/functions/v1/discord-announce', {
    method,
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }))
  const text = await res.text()
  return { status: res.status, text, body: text && text !== 'ok' ? JSON.parse(text) : null, headers: res.headers }
}

const DRAFT = { channel: 'announcements', content: 'Drivetrain assembly Tuesday. @everyone', roleIds: [PROG, MECH] }
const rid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

beforeAll(async () => {
  const source = readFileSync(FN_PATH, 'utf8')
  expect(source.split(IMPORT_LINE).length - 1).toBe(1)
  const dir = mkdtempSync(join(tmpdir(), 'announce-fn-'))
  const file = join(dir, 'index.mjs')
  writeFileSync(file, source.replace(IMPORT_LINE, 'const { createClient } = globalThis.__announceTest'))
  globalThis.__announceTest = { createClient: (...a) => createClient(...a) }
  globalThis.Deno = { env: { get: k => env[k] }, serve: h => { handler = h } }
  globalThis.fetch = fakeFetch
  await import(pathToFileURL(file).href)
  expect(typeof handler).toBe('function')
})

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k]
  Object.assign(env, {
    SUPABASE_URL: 'http://supabase.invalid',
    SUPABASE_ANON_KEY: 'stand-in-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'stand-in-service-key',
    DISCORD_BOT_TOKEN: FAKE_TOKEN,
    DISCORD_GUILD_ID: GUILD,
  })
  db = makeDb()
  discord = makeDiscord()
})

describe('the door', () => {
  test('CORS preflight answers', async () => {
    const r = await call(null, { method: 'OPTIONS' })
    expect(r.status).toBe(200)
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
  })

  test('no session is 401 and a non-admin is 403; neither touches Discord or the log', async () => {
    expect((await call({ action: 'send', request_id: rid(1), draft: DRAFT }, { jwt: null })).status).toBe(401)
    const student = await call({ action: 'send', request_id: rid(2), draft: DRAFT }, { jwt: 'student-jwt' })
    expect(student.status).toBe(403)
    expect(student.body.code).toBe('forbidden')
    expect(discord.calls).toHaveLength(0)
    expect(db.tables.discord_announcements).toHaveLength(0)
    // Control: the same request from the admin goes through.
    const adminSend = await call({ action: 'send', request_id: rid(3), draft: DRAFT })
    expect(adminSend.status).toBe(200)
    expect(posts()).toHaveLength(1)
  })

  test('an unknown action is refused', async () => {
    const r = await call({ action: 'delete-everything' })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('invalid')
  })
})

describe('setup states', () => {
  test('status names missing secrets by NAME, and is ready once they exist', async () => {
    delete env.DISCORD_BOT_TOKEN
    const r = await call({ action: 'status' })
    expect(r.body).toMatchObject({ ok: true, ready: false, missing: ['DISCORD_BOT_TOKEN'] })
    env.DISCORD_BOT_TOKEN = FAKE_TOKEN
    expect((await call({ action: 'status' })).body).toMatchObject({ ok: true, ready: true, missing: [] })
  })

  test('a guild id that is not a snowflake is named as such', async () => {
    env.DISCORD_GUILD_ID = 'Bosco Tech Robotics'
    expect((await call({ action: 'status' })).body.missing).toEqual(['DISCORD_GUILD_ID (not a server id)'])
  })

  test('migration not applied: status says so, preview and send answer needs_setup', async () => {
    db.missingTables.add('discord_announce_roles')
    expect((await call({ action: 'status' })).body.missing).toEqual(['migration 0003_discord_announcements.sql'])
    const p = await call({ action: 'preview', draft: DRAFT })
    expect(p.status).toBe(503)
    expect(p.body).toMatchObject({ code: 'needs_setup', missing: ['migration 0003_discord_announcements.sql'] })
    expect(discord.calls).toHaveLength(0)
  })

  test('send without the bot secret is needs_setup, writes no row, calls nothing', async () => {
    delete env.DISCORD_BOT_TOKEN
    const r = await call({ action: 'send', request_id: rid(4), draft: DRAFT })
    expect(r.status).toBe(503)
    expect(r.body).toMatchObject({ code: 'needs_setup', missing: ['DISCORD_BOT_TOKEN'] })
    expect(db.tables.discord_announcements).toHaveLength(0)
    expect(discord.calls).toHaveLength(0)
  })
})

describe('the dry run', () => {
  test('returns the shared builder\'s exact payload, posts nothing, logs nothing', async () => {
    const r = await call({ action: 'preview', draft: DRAFT })
    expect(r.status).toBe(200)
    const roles = db.tables.discord_announce_roles
    const expected = buildAnnouncePayload(normalizeDraft(DRAFT), { roles })
    expect(JSON.stringify(r.body.payload)).toBe(JSON.stringify(expected))
    expect(r.body.payload.allowed_mentions).toEqual({ parse: [], roles: [MECH, PROG] })
    expect(r.body.payload.content).not.toMatch(/@everyone/)
    expect(posts()).toHaveLength(0)
    expect(db.tables.discord_announcements).toHaveLength(0)
    // It did look at the server: the channel resolved and both roles checked.
    expect(r.body.guild_checked).toBe(true)
    expect(r.body.channel).toEqual({ name: 'announcements', found: true, id: CH_ANNOUNCE })
    expect(r.body.warnings.join(' ')).toContain('@Programming is not mentionable')
  })

  test('without the bot secret it still returns the payload, unchecked', async () => {
    delete env.DISCORD_GUILD_ID
    const r = await call({ action: 'preview', draft: DRAFT })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ guild_checked: false, missing: ['DISCORD_GUILD_ID'] })
    expect(r.body.payload.allowed_mentions.roles).toEqual([MECH, PROG])
    expect(discord.calls).toHaveLength(0)
  })

  test('a table row whose id is not in the server is a problem, not a warning', async () => {
    const r = await call({ action: 'preview', draft: { ...DRAFT, roleIds: [GHOST] } })
    expect(r.body.problems.join(' ')).toContain(`"Ghost" (${GHOST}) is not a role in the server`)
  })
})

describe('sending', () => {
  test('reserve, post once with the pinned mentions, record sent', async () => {
    const r = await call({ action: 'send', request_id: rid(10), draft: DRAFT })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, status: 'sent', message_id: '100000000000009999', channel: 'announcements' })
    expect(posts()).toHaveLength(1)
    const sent = posts()[0]
    expect(sent.path).toBe(`/channels/${CH_ANNOUNCE}/messages`)
    expect(sent.body.allowed_mentions).toEqual({ parse: [], roles: [MECH, PROG] })
    expect(sent.body.content.startsWith(`<@&${MECH}> <@&${PROG}>\n`)).toBe(true)
    const [row] = db.tables.discord_announcements
    expect(row).toMatchObject({
      request_id: rid(10), sent_by: ADMIN_ID, sender_name: 'Ada', channel_name: 'announcements', channel_id: CH_ANNOUNCE,
      role_ids: [MECH, PROG], role_names: ['Mechanical', 'Programming'], status: 'sent', discord_message_id: '100000000000009999',
    })
    expect(row.payload).toEqual(sent.body)
  })

  test('the same request_id twice posts ONCE; the second answer says already sent', async () => {
    const first = await call({ action: 'send', request_id: rid(11), draft: DRAFT })
    const second = await call({ action: 'send', request_id: rid(11), draft: DRAFT })
    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    expect(second.body).toMatchObject({ code: 'already_sent', status: 'sent', message_id: '100000000000009999' })
    expect(posts()).toHaveLength(1)
    expect(db.tables.discord_announcements).toHaveLength(1)
    // Control: a NEW request_id for the same text does post again.
    expect((await call({ action: 'send', request_id: rid(12), draft: DRAFT })).status).toBe(200)
    expect(posts()).toHaveLength(2)
  })

  test('the body cannot widen the pings: unknown ids are refused, smuggled fields ignored', async () => {
    const bad = await call({ action: 'send', request_id: rid(13), draft: { ...DRAFT, roleIds: ['100000000000000555'] } })
    expect(bad.status).toBe(422)
    expect(posts()).toHaveLength(0)
    expect(db.tables.discord_announcements).toHaveLength(0)
    const smuggled = await call({
      action: 'send', request_id: rid(14),
      draft: { ...DRAFT, roleIds: [MECH], allowed_mentions: { parse: ['everyone'] } },
      payload: { content: '@everyone', allowed_mentions: { parse: ['everyone'] } },
    })
    expect(smuggled.status).toBe(200)
    expect(posts()[0].body.allowed_mentions).toEqual({ parse: [], roles: [MECH] })
  })

  test('a role row carrying the server id (@everyone) is refused', async () => {
    db.tables.discord_announce_roles.push({ id: 'r9', name: 'Everybody', role_id: GUILD, active: true, sort_order: 1 })
    const r = await call({ action: 'send', request_id: rid(15), draft: { ...DRAFT, roleIds: [GUILD] } })
    expect(r.status).toBe(422)
    expect(r.body.errors[0].message).toContain('@everyone role')
    expect(posts()).toHaveLength(0)
  })

  test('a channel that is not in the server is refused before anything is reserved', async () => {
    discord.channels = discord.channels.filter(c => c.name !== 'parents')
    const r = await call({ action: 'send', request_id: rid(16), draft: { ...DRAFT, channel: 'parents' } })
    expect(r.status).toBe(422)
    expect(db.tables.discord_announcements).toHaveLength(0)
    expect(posts()).toHaveLength(0)
  })

  test('Discord refusing (missing permission) is logged failed, with the fix named', async () => {
    discord.postResult = () => ({ status: 403, body: { message: 'Missing Permissions', code: 50013 } })
    const r = await call({ action: 'send', request_id: rid(17), draft: DRAFT })
    expect(r.status).toBe(502)
    expect(r.body).toMatchObject({ code: 'discord_error', status: 'failed' })
    expect(r.body.error).toContain('Send Polls')
    const [row] = db.tables.discord_announcements
    expect(row.status).toBe('failed')
    expect(row.discord_message_id ?? null).toBeNull()
    expect(row.error).toContain('Send Polls')
  })

  test('no answer from Discord is logged unknown, never retried', async () => {
    discord.postResult = () => ({ throw: 'socket hang up' })
    const r = await call({ action: 'send', request_id: rid(18), draft: DRAFT })
    expect(r.body).toMatchObject({ code: 'discord_error', status: 'unknown' })
    expect(posts()).toHaveLength(1)
    expect(db.tables.discord_announcements[0].status).toBe('unknown')
    // A 5xx is just as ambiguous.
    discord.postResult = () => ({ status: 502, body: { message: 'Bad Gateway' } })
    expect((await call({ action: 'send', request_id: rid(19), draft: DRAFT })).body.status).toBe('unknown')
    expect(posts()).toHaveLength(2)
  })

  test('a malformed request_id is refused before anything happens', async () => {
    const r = await call({ action: 'send', request_id: 'again', draft: DRAFT })
    expect(r.status).toBe(422)
    expect(discord.calls).toHaveLength(0)
  })
})

describe('no secret ever leaves the function', () => {
  test('a Discord error that echoes the token is scrubbed', async () => {
    discord.postResult = () => ({ status: 400, body: { message: `bad auth ${FAKE_TOKEN}`, code: 50035 } })
    const r = await call({ action: 'send', request_id: rid(20), draft: DRAFT })
    expect(r.text).not.toContain(FAKE_TOKEN)
    expect(r.text).toContain('[DISCORD_BOT_TOKEN redacted]')
    expect(JSON.stringify(db.tables.discord_announcements)).not.toContain(FAKE_TOKEN)
  })

  test('across every response in a full run, no secret value appears', async () => {
    const texts = []
    for (const body of [
      { action: 'status' },
      { action: 'preview', draft: DRAFT },
      { action: 'send', request_id: rid(21), draft: DRAFT },
      { action: 'send', request_id: rid(21), draft: DRAFT },
    ]) texts.push((await call(body)).text)
    const all = texts.join('\n')
    for (const v of [FAKE_TOKEN, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_ANON_KEY]) expect(all).not.toContain(v)
    // Control: the responses are real, not empty strings.
    expect(all).toContain('allowed_mentions')
  })
})
