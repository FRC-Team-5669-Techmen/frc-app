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

/**
 * Chainable stand-in for the slice of supabase-js the engine uses.
 *
 * `failSelect(table, ops)` lets a test fail one specific read. `ops` is the
 * ordered list of [method, column] calls made on the builder, which is how a
 * test tells the two reads of discord_calendar_posts apart: the cancellation
 * sweep filters eq('status') + gte('event_ends_at'), loadTracking filters
 * in('event_id'). Returning an error object makes that read resolve to it;
 * returning nothing lets it through.
 */
function fakeSupabase(tables, { failSelect = null } = {}) {
  const db = { events: [], discord_calendar_posts: [], discord_calendar_log: [], ...tables }
  let seq = 0

  const makeQuery = table => {
    const filters = []
    const ops = []
    const q = {
      _rows: () => db[table].filter(r => filters.every(f => f(r))),
      select() { return q },
      order() { return q },
      eq(col, val) { ops.push(['eq', col]); filters.push(r => r[col] === val); return q },
      gte(col, val) { ops.push(['gte', col]); filters.push(r => String(r[col]) >= String(val)); return q },
      lte(col, val) { ops.push(['lte', col]); filters.push(r => String(r[col]) <= String(val)); return q },
      in(col, vals) { ops.push(['in', col]); const s = new Set(vals); filters.push(r => s.has(r[col])); return q },
      single() { return q },
      then(resolve) {
        const error = failSelect ? failSelect(table, ops) : null
        if (error) return resolve({ data: null, error })
        resolve({ data: q._rows(), error: null })
      },
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
  // Injected so the bounded auth retry does not put real backoff into the
  // suite. The engine defaults to a real timer when this is absent.
  sleep: async () => {},
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

const run = (supabase, discord, config = {}, now = NOW) =>
  runCalendarSync({ supabase, discord, now, config: { ...baseConfig, ...config } })

// Same run, at a chosen instant. Reminder scheduling is entirely a function of
// (now, starts_at), so walking the clock across a fixture event is how the
// reminder windows are proved rather than asserted.
const runAt = (supabase, discord, now, config = {}) => run(supabase, discord, config, now)

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

test('reminder_24h is retired: an event inside 24h never creates one', async () => {
  // 20h out is squarely inside the old 24h lead. This is the exact fixture
  // that used to post a 24h reminder. Nothing may reach #announcements now,
  // and no reminder_24h tracking row may be reserved (reserving one would burn
  // the dedupe key and block a restore from ever firing).
  const ev = event({ starts_at: iso(NOW, 20 * HOUR), ends_at: iso(NOW, 23 * HOUR) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)

  assert.equal(dc.calls.created.filter(c => c.channelId === 'chan-ann').length, 0, 'no reminder inside 24h')
  assert.equal(sb._db.discord_calendar_posts.some(r => r.post_kind === 'reminder_24h'), false, 'no 24h row at all')
  assert.equal(sb._db.discord_calendar_posts.some(r => r.post_kind === 'calendar'), true, 'the #calendar embed is unaffected')
})

test('retiring 24h does not skip, delay or double-fire the 2h reminder', async () => {
  // One fixture event walked across the whole window on the real engine.
  const start = 20 * HOUR
  const ev = event({ starts_at: iso(NOW, start), ends_at: iso(NOW, start + 3 * HOUR) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  const annCount = () => dc.calls.created.filter(c => c.channelId === 'chan-ann').length
  const at = ms => new Date(NOW.getTime() + ms)

  // t-20h and t-3h: still outside the 2h lead, so nothing fires.
  await runAt(sb, dc, at(0))
  assert.equal(annCount(), 0, 't-20h: silent')
  await runAt(sb, dc, at(start - 3 * HOUR))
  assert.equal(annCount(), 0, 't-3h: silent')

  // t-119m: first tick inside the 2h lead. It fires here, not later: retiring
  // the longer lead must not push the surviving one back.
  await runAt(sb, dc, at(start - 119 * 60_000))
  assert.equal(annCount(), 1, 't-119m: the 2h reminder fires on the first tick inside its window')
  const row = sb._db.discord_calendar_posts.find(r => r.post_kind === 'reminder_2h')
  assert.equal(row.status, 'posted')

  // Every later tick before the event: still exactly one. The unique
  // (event_id, post_kind) constraint is what guarantees this, and it is
  // untouched by the retirement.
  await runAt(sb, dc, at(start - 90 * 60_000))
  await runAt(sb, dc, at(start - 10 * 60_000))
  assert.equal(annCount(), 1, 'no double-fire across later ticks')

  // And nothing ever opened a 24h slot along the way.
  assert.equal(sb._db.discord_calendar_posts.some(r => r.post_kind === 'reminder_24h'), false)
})

test('2h reminder fires; no 24h slot is opened or superseded', async () => {
  // Previously this produced a superseded reminder_24h alongside the posted
  // reminder_2h. With the lead retired the slot is never opened in the first
  // place, so there is nothing to close.
  const ev = event({ starts_at: iso(NOW, 90 * 60_000), ends_at: iso(NOW, 4 * HOUR) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)
  const kinds = sb._db.discord_calendar_posts.map(r => [r.post_kind, r.status])
  assert.deepEqual(
    Object.fromEntries(kinds),
    { calendar: 'posted', reminder_2h: 'posted' },
  )
  assert.equal(dc.calls.created.filter(c => c.channelId === 'chan-ann').length, 1)
})

test('an event naming a subteam pings that role, and only that role', async () => {
  // Inside the 2h lead: the surviving reminder is the one that carries the ping.
  const ev = event({ title: 'Programming sprint', starts_at: iso(NOW, 90 * 60_000), ends_at: iso(NOW, 4 * HOUR) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)
  const rem = dc.calls.created.find(c => c.channelId === 'chan-ann')
  assert.deepEqual(rem.payload.allowed_mentions, { parse: [], roles: ['role-prog'] })
  assert.match(rem.payload.content, /<@&role-prog>/)
})

test('an event naming no subteam pings nobody', async () => {
  const ev = event({ title: 'Team meeting', notes: 'all hands', starts_at: iso(NOW, 90 * 60_000), ends_at: iso(NOW, 4 * HOUR) })
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

// ── Failure isolation: the cancellation sweep ────────────────────────────────
// Nine production runs in one week died on `JWT issued at future` inside the
// sweep, which holds the first PostgREST call of the run, so every one of them
// aborted before considering a single post and never wrote run_end.

// Matches only the sweep read: eq(status) + gte(event_ends_at) on the tracking
// table. loadTracking hits the same table with in(event_id) and must be left
// alone, or the test would be proving something else.
const sweepRead = (table, ops) =>
  table === 'discord_calendar_posts' && ops.some(([m, c]) => m === 'eq' && c === 'status')

const JWT_ERR = { code: 'PGRST301', message: 'JWT issued at future' }

test('a failing cancellation sweep no longer stops reminders from posting', async () => {
  // The exact production shape: the sweep read fails with the JWT error on
  // every attempt, so the bounded retry is exhausted and the sweep genuinely
  // cannot run. The reminder must still go out.
  const ev = event({ starts_at: iso(NOW, 90 * 60_000), ends_at: iso(NOW, 4 * HOUR) })
  const sb = fakeSupabase({ events: [ev] }, { failSelect: (t, o) => (sweepRead(t, o) ? JWT_ERR : null) })
  const dc = fakeDiscord()
  const s = await run(sb, dc)

  assert.equal(s.fatal, undefined, 'the run must not be fatal')
  assert.equal(dc.calls.created.filter(c => c.channelId === 'chan-ann').length, 1, 'the 2h reminder still posts')
  assert.equal(dc.calls.created.filter(c => c.channelId === 'chan-cal').length, 1, 'the #calendar embed still posts')
  assert.equal(s.created, 2)

  const log = sb._db.discord_calendar_log
  assert.ok(log.some(l => l.action === 'run_end'), 'run_end must still be written')
  const err = log.find(l => l.action === 'error' && l.detail?.phase === 'cancellation_sweep')
  assert.ok(err, 'the sweep failure is still recorded')
  assert.equal(err.detail.fatal, false, 'recorded as non-fatal')
  assert.equal(err.detail.status, null, 'same detail shape as before')
  assert.match(err.detail.message, /loading cancellation candidates: JWT issued at future/)
})

test('a JWT failure is retried at most twice, and a recoverable one succeeds', async () => {
  // Fails once then clears, which is what clock skew actually does.
  let n = 0
  const sb = fakeSupabase({ events: [event()] }, {
    failSelect: (t, o) => (sweepRead(t, o) && n++ === 0 ? JWT_ERR : null),
  })
  const dc = fakeDiscord()
  await run(sb, dc)
  sb._db.events = []                        // staff deleted the event = cancelled
  n = 0                                     // arm one more failure for the sweep
  sb._db.discord_calendar_log = []          // count this run only
  const s = await run(sb, dc)

  assert.equal(s.cancelled, 1, 'the retry let the sweep complete')
  assert.equal(s.sweep_error, undefined)
  const retries = sb._db.discord_calendar_log.filter(l => l.action === 'auth_retry')
  assert.equal(retries.length, 1, 'exactly one retry was needed')
  assert.equal(retries[0].detail.phase, 'loading cancellation candidates')

  // And the bound holds when it never clears: 1 attempt + 2 retries, no more.
  const sb2 = fakeSupabase({ events: [event()] }, { failSelect: (t, o) => (sweepRead(t, o) ? JWT_ERR : null) })
  await run(sb2, fakeDiscord())
  assert.equal(sb2._db.discord_calendar_log.filter(l => l.action === 'auth_retry').length, 2, 'at most two retries')
})

test('a retried run cannot create a second row or a second Discord message', async () => {
  // The dedupe guarantee under retry. Run 1 is clean and posts both messages.
  // Run 2 exercises the retry path on every read the engine makes, so if a
  // retry could re-enter the posting path at all, this is where a second row
  // and a second message would appear.
  const ev = event({ starts_at: iso(NOW, 90 * 60_000), ends_at: iso(NOW, 4 * HOUR) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)

  const rowsAfterFirst = sb._db.discord_calendar_posts.map(r => `${r.event_id}:${r.post_kind}`).sort()
  assert.deepEqual(rowsAfterFirst, ['ev-1:calendar', 'ev-1:reminder_2h'])
  assert.equal(dc.calls.created.length, 2)

  // Every read fails once with the JWT error, then succeeds: four reads, four
  // retries, one full run.
  const seen = new Set()
  sb._db.__unused = null
  const sb2 = fakeSupabase(sb._db, {
    failSelect: (t, o) => {
      const key = `${t}:${o.map(x => x.join('.')).join(',')}`
      if (seen.has(key)) return null
      seen.add(key)
      return JWT_ERR
    },
  })
  const s = await run(sb2, dc)

  assert.ok(sb2._db.discord_calendar_log.filter(l => l.action === 'auth_retry').length >= 2, 'retries did happen')
  assert.equal(s.created, 0, 'no new post')
  assert.equal(dc.calls.created.length, 2, 'no second Discord message')
  assert.deepEqual(
    sb2._db.discord_calendar_posts.map(r => `${r.event_id}:${r.post_kind}`).sort(),
    rowsAfterFirst,
    'no second row for the same (event_id, post_kind)',
  )
})

test('only auth-shaped failures are retried, never anything else', async () => {
  // A plain database error must fail straight through with no backoff at all.
  const dbErr = { code: '57014', message: 'canceling statement due to statement timeout' }
  const sb = fakeSupabase({ events: [event()] }, { failSelect: (t, o) => (sweepRead(t, o) ? dbErr : null) })
  const s = await run(sb, fakeDiscord())
  assert.equal(sb._db.discord_calendar_log.filter(l => l.action === 'auth_retry').length, 0, 'not retried')
  assert.match(s.sweep_error, /statement timeout/)
  assert.equal(s.created, 1, 'and the run still posted')

  // A Discord failure is never routed through the retry either: it is raised by
  // the REST client inside the posting path, which is deliberately not wrapped.
  const { DiscordError } = await import('../../supabase/functions/discord-calendar/lib/discord.js')
  const sb2 = fakeSupabase({ events: [event()] })
  await run(sb2, fakeDiscord({ failCreate: new DiscordError('service unavailable', { status: 503 }) }))
  assert.equal(sb2._db.discord_calendar_log.filter(l => l.action === 'auth_retry').length, 0, 'no retry on a Discord error')
})

// ── Silent loss ──────────────────────────────────────────────────────────────

test('a 2h reminder that was never sent is logged as reminder_missed, once', async () => {
  // The event started 30 minutes ago and no reminder_2h row exists: nobody was
  // told, and until now the only trace was a `superseded` row indistinguishable
  // from the routine planned close.
  const ev = event({ starts_at: iso(NOW, -30 * 60_000), ends_at: iso(NOW, 90 * 60_000) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)

  const missed = sb._db.discord_calendar_log.filter(l => l.action === 'reminder_missed')
  assert.equal(missed.length, 1)
  assert.equal(missed[0].event_id, 'ev-1', 'the event id is queryable')
  assert.equal(missed[0].post_kind, 'reminder_2h')
  assert.equal(missed[0].detail.minutes_late, 30)
  assert.equal(dc.calls.created.filter(c => c.channelId === 'chan-ann').length, 0, 'no late reminder is posted')

  // Written once, not every hour: the supersede row closes the slot.
  await run(sb, dc)
  assert.equal(sb._db.discord_calendar_log.filter(l => l.action === 'reminder_missed').length, 1)
})

test('a reminder that fired normally is never logged as missed', async () => {
  const ev = event({ starts_at: iso(NOW, 90 * 60_000), ends_at: iso(NOW, 4 * HOUR) })
  const sb = fakeSupabase({ events: [ev] })
  const dc = fakeDiscord()
  await run(sb, dc)                                   // posts the 2h reminder
  await runAt(sb, dc, new Date(NOW.getTime() + 3 * HOUR))   // now well past the start
  assert.equal(sb._db.discord_calendar_log.some(l => l.action === 'reminder_missed'), false)
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
