// Self-contained test for the Discord calendar sync engine.
//
//   node scripts/discord/calendar-sync.test.mjs      (npm run discord:calendar:test)
//
// No test framework and no network: an in-memory stand-in for supabase-js and a
// fake Discord REST client. It exists because "nothing double-posts" is the
// core correctness requirement of this feature, and that is exactly the kind of
// property you cannot confirm by looking at a live server.
//
// The engine under test lives in the Edge Function and runs on Deno in
// production. It is deliberately written to the intersection of both runtimes —
// plain ESM, explicit file extensions, `node:crypto` (which Deno implements),
// no other imports — so this Node harness exercises the exact same files that
// deploy, not a copy of them.

import assert from 'node:assert/strict'
import { runCalendarSync } from '../../supabase/functions/discord-calendar/lib/calendarSync.js'

// ─────────────────────────────────────────────────────────────────────────────
// Fakes
// ─────────────────────────────────────────────────────────────────────────────

/** Chainable stand-in for the slice of supabase-js the engine uses. */
function fakeSupabase(tables) {
  const db = { events: [], discord_calendar_posts: [], discord_calendar_log: [], ...tables }
  let seq = 0

  const makeQuery = table => {
    const filters = []
    const q = {
      _rows: () => db[table].filter(r => filters.every(f => f(r))),
      select() { return q },
      order() { return q },
      eq(col, val) { filters.push(r => r[col] === val); return q },
      gte(col, val) { filters.push(r => String(r[col]) >= String(val)); return q },
      lte(col, val) { filters.push(r => String(r[col]) <= String(val)); return q },
      in(col, vals) { const s = new Set(vals); filters.push(r => s.has(r[col])); return q },
      single() { return q },
      then(resolve) { resolve({ data: q._rows(), error: null }) },
    }
    return q
  }

  return {
    _db: db,
    from(table) {
      return {
        select() { return makeQuery(table) },

        insert(payload) {
          const rows = Array.isArray(payload) ? payload : [payload]
          // Emulate the unique (event_id, post_kind) constraint — the whole point.
          for (const row of rows) {
            if (table === 'discord_calendar_posts') {
              const clash = db[table].some(r => r.event_id === row.event_id && r.post_kind === row.post_kind)
              if (clash) {
                const err = { code: '23505', message: 'duplicate key value violates unique constraint' }
                return { select: () => ({ single: () => Promise.resolve({ data: null, error: err }) }), then: r => r({ data: null, error: err }) }
              }
            }
          }
          const stored = rows.map(r => ({ id: `row-${++seq}`, status: 'pending', ...r }))
          db[table].push(...stored)
          const result = { data: stored[0], error: null }
          return {
            select: () => ({ single: () => Promise.resolve(result) }),
            then: r => r({ data: stored, error: null }),
          }
        },

        update(patch) {
          return {
            eq(col, val) {
              for (const row of db[table]) if (row[col] === val) Object.assign(row, patch)
              return Promise.resolve({ data: null, error: null })
            },
          }
        },

        delete() {
          return {
            eq(col, val) {
              db[table] = db[table].filter(r => r[col] !== val)
              return Promise.resolve({ data: null, error: null })
            },
          }
        },
      }
    },
  }
}

function fakeDiscord({ failCreate = null } = {}) {
  let n = 0
  const calls = { created: [], edited: [] }
  return {
    calls,
    onEventSink() {},
    async resolveGuild() {
      return {
        channelsByName: new Map([
          ['calendar', { id: 'chan-cal', name: 'calendar' }],
          ['announcements', { id: 'chan-ann', name: 'announcements' }],
        ]),
        rolesByName: new Map([
          ['programming', { id: 'role-prog', name: 'Programming', mentionable: true }],
          ['drive team', { id: 'role-drive', name: 'Drive Team', mentionable: true }],
        ]),
      }
    },
    async createMessage(channelId, payload) {
      if (failCreate) throw failCreate
      const msg = { id: `msg-${++n}` }
      calls.created.push({ channelId, payload, id: msg.id })
      return msg
    },
    async editMessage(channelId, messageId, payload) {
      calls.edited.push({ channelId, messageId, payload })
      return { id: messageId }
    },
  }
}

const NOW = new Date('2026-09-10T18:00:00Z')   // 11:00 AM PDT
const iso = (base, ms) => new Date(base.getTime() + ms).toISOString()
const HOUR = 3600_000

const baseConfig = {
  runId: '00000000-0000-4000-8000-000000000000',
  guildId: 'g1',
  calendarChannel: 'calendar',
  announceChannel: 'announcements',
  horizonDays: 14,
  reportOnly: false,
}

const event = (over = {}) => ({
  id: 'ev-1',
  title: 'Build day',
  kind: 'build',
  starts_at: iso(NOW, 5 * 24 * HOUR),
  ends_at: iso(NOW, 5 * 24 * HOUR + 4 * HOUR),
  location: 'Shop',
  notes: 'Bring safety glasses',
  updated_at: iso(NOW, 0),
  ...over,
})

const run = (supabase, discord, config = {}) =>
  runCalendarSync({ supabase, discord, now: NOW, config: { ...baseConfig, ...config } })

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────
const tests = []
const test = (name, fn) => tests.push([name, fn])

test('report-only posts nothing and writes no tracking rows', async () => {
  const sb = fakeSupabase({ events: [event()] })
  const dc = fakeDiscord()
  const s = await run(sb, dc, { reportOnly: true })
  assert.equal(dc.calls.created.length, 0, 'must not call Discord')
  assert.equal(sb._db.discord_calendar_posts.length, 0, 'must not burn a dedupe key')
  assert.ok(s.planned >= 1, 'must log an intended post')
  assert.ok(sb._db.discord_calendar_log.some(l => l.action === 'plan_create'))
})

test('first live run posts to #calendar and records the message id', async () => {
  const sb = fakeSupabase({ events: [event()] })
  const dc = fakeDiscord()
  const s = await run(sb, dc)
  assert.equal(s.created, 1)
  assert.equal(dc.calls.created[0].channelId, 'chan-cal')
  const row = sb._db.discord_calendar_posts[0]
  assert.equal(row.post_kind, 'calendar')
  assert.equal(row.status, 'posted')
  assert.equal(row.message_id, 'msg-1')
})

test('second run over unchanged data posts NOTHING (no double post)', async () => {
  const sb = fakeSupabase({ events: [event()] })
  const dc = fakeDiscord()
  await run(sb, dc)
  const after = dc.calls.created.length
  const s = await run(sb, dc)
  assert.equal(dc.calls.created.length, after, 'no second post')
  assert.equal(s.created, 0)
  assert.equal(s.edited, 0)
})

test('a changed event EDITS the existing message instead of posting again', async () => {
  const ev = event()
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)

  ev.location = 'FLL Room'
  const s = await run(sb, dc)
  assert.equal(s.created, 0, 'must not repost')
  assert.equal(s.edited, 1)
  assert.equal(dc.calls.edited[0].messageId, 'msg-1')
  assert.match(JSON.stringify(dc.calls.edited[0].payload), /FLL Room/)
})

test('a deleted event strikes the message and marks it cancelled, never deletes', async () => {
  const sb = fakeSupabase({ events: [event()] })
  const dc = fakeDiscord()
  await run(sb, dc)

  sb._db.events = []                       // staff deleted the event = cancelled
  const s = await run(sb, dc)
  assert.equal(s.cancelled, 1)
  const edit = dc.calls.edited.at(-1)
  assert.match(edit.payload.content, /CANCELLED/)
  assert.match(edit.payload.content, /~~/, 'struck through')
  assert.equal(sb._db.discord_calendar_posts[0].status, 'cancelled')
  assert.ok(sb._db.discord_calendar_posts[0].message_id, 'tracking row is kept, not deleted')
})

test('cancellation is idempotent — a second sweep does not re-edit', async () => {
  const sb = fakeSupabase({ events: [event()] })
  const dc = fakeDiscord()
  await run(sb, dc)
  sb._db.events = []
  await run(sb, dc)
  const edits = dc.calls.edited.length
  await run(sb, dc)
  assert.equal(dc.calls.edited.length, edits)
})

test('24h reminder fires inside the window, once, into #announcements', async () => {
  const ev = event({ starts_at: iso(NOW, 20 * HOUR), ends_at: iso(NOW, 23 * HOUR) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)
  const reminders = dc.calls.created.filter(c => c.channelId === 'chan-ann')
  assert.equal(reminders.length, 1)
  assert.equal(sb._db.discord_calendar_posts.find(r => r.post_kind === 'reminder_24h').status, 'posted')

  await run(sb, dc)
  assert.equal(dc.calls.created.filter(c => c.channelId === 'chan-ann').length, 1, 'no repeat')
})

test('2h reminder fires and the 24h slot is closed, not fired late', async () => {
  const ev = event({ starts_at: iso(NOW, 90 * 60_000), ends_at: iso(NOW, 4 * HOUR) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)
  const kinds = sb._db.discord_calendar_posts.map(r => [r.post_kind, r.status])
  assert.deepEqual(
    Object.fromEntries(kinds),
    { calendar: 'posted', reminder_24h: 'superseded', reminder_2h: 'posted' },
  )
  assert.equal(dc.calls.created.filter(c => c.channelId === 'chan-ann').length, 1)
})

test('an event naming a subteam pings that role, and only that role', async () => {
  const ev = event({ title: 'Programming sprint', starts_at: iso(NOW, 20 * HOUR), ends_at: iso(NOW, 23 * HOUR) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)
  const rem = dc.calls.created.find(c => c.channelId === 'chan-ann')
  assert.deepEqual(rem.payload.allowed_mentions, { parse: [], roles: ['role-prog'] })
  assert.match(rem.payload.content, /<@&role-prog>/)
})

test('an event naming no subteam pings nobody', async () => {
  const ev = event({ title: 'Team meeting', notes: 'all hands', starts_at: iso(NOW, 20 * HOUR), ends_at: iso(NOW, 23 * HOUR) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)
  const rem = dc.calls.created.find(c => c.channelId === 'chan-ann')
  assert.deepEqual(rem.payload.allowed_mentions.roles, [])
  assert.doesNotMatch(rem.payload.content, /<@&/)
})

test('a 4xx on create releases the reservation; an ambiguous failure keeps it', async () => {
  const { DiscordError } = await import('../../supabase/functions/discord-calendar/lib/discord.js')

  const sb1 = fakeSupabase({ events: [event()] })
  await run(sb1, fakeDiscord({ failCreate: new DiscordError('bad request', { status: 400 }) }))
  assert.equal(sb1._db.discord_calendar_posts.length, 0, '4xx = no message exists, retry is safe')

  const sb2 = fakeSupabase({ events: [event()] })
  const dc2 = fakeDiscord({ failCreate: new Error('socket hang up') })
  await run(sb2, dc2)
  assert.equal(sb2._db.discord_calendar_posts[0].status, 'pending', 'unknown outcome stays reserved')

  // And a later healthy run must NOT retry it — that is the anti-double-post rule.
  const s = await run(sb2, fakeDiscord())
  assert.equal(s.created, 0)
  assert.ok(sb2._db.discord_calendar_log.some(l => l.detail?.reason === 'pending_stale'))
})

test('every run is logged', async () => {
  const sb = fakeSupabase({ events: [event()] })
  await run(sb, fakeDiscord())
  const actions = sb._db.discord_calendar_log.map(l => l.action)
  assert.ok(actions.includes('run_start'))
  assert.ok(actions.includes('resolve'))
  assert.ok(actions.includes('created'))
  assert.ok(actions.includes('run_end'))
})

// ─────────────────────────────────────────────────────────────────────────────
let failed = 0
for (const [name, fn] of tests) {
  try {
    await fn()
    console.log(`  PASS  ${name}`)
  } catch (err) {
    failed++
    console.error(`  FAIL  ${name}\n        ${err.message}`)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`)
process.exit(failed ? 1 : 0)
