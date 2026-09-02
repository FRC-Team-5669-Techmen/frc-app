// Fakes for driving the REAL Discord calendar sync engine
// (`supabase/functions/discord-calendar/lib/calendarSync.js`) from vitest.
//
// WHY THIS IS A SECOND COPY, AND WHY THAT IS DELIBERATE RATHER THAN SLOPPY.
// `scripts/discord/calendar-sync.test.mjs` carries fakes of the same shape and
// is driven by `npm run discord:calendar:test`. That file is OUT OF SCOPE for
// the bundle that added this directory (it may not be edited), and it must keep
// working, so its fakes could not be exported and shared. Rather than leave the
// engine's core property untested under `npm test`, the fakes are rebuilt here
// and the legacy script is ALSO gated by `npm test` as a child process (see
// `tests/legacy-suites.test.js`), so both copies run on every push and a drift
// between them shows up as one suite going red while the other stays green.
//
// When `scripts/discord/` next comes into scope for a bundle, the right move is
// to have that script import these fixtures and delete its own copy. Until then
// the duplication is recorded here rather than discovered later.
//
// The one thing these fakes MUST get right is the `unique (event_id, post_kind)`
// constraint on `discord_calendar_posts`. The engine's no-double-post guarantee
// is that constraint plus reserve-then-send, so a permissive fake that let a
// second insert through would make every dedupe assertion below vacuous.

/**
 * Chainable stand-in for the slice of supabase-js the engine uses.
 *
 * `failSelect(table, ops)` fails one specific read. `ops` is the ordered list
 * of [method, column] calls made on the builder, which is how a caller tells
 * the two reads of `discord_calendar_posts` apart: the cancellation sweep
 * filters eq('status') + gte('event_ends_at'), `loadTracking` filters
 * in('event_id').
 */
export function fakeSupabase(tables, { failSelect = null } = {}) {
  const db = { events: [], discord_calendar_posts: [], discord_calendar_log: [], ...tables }
  let seq = 0

  const makeQuery = (table) => {
    const filters = []
    const ops = []
    const q = {
      _rows: () => db[table].filter((r) => filters.every((f) => f(r))),
      select() { return q },
      order() { return q },
      eq(col, val) { ops.push(['eq', col]); filters.push((r) => r[col] === val); return q },
      gte(col, val) { ops.push(['gte', col]); filters.push((r) => String(r[col]) >= String(val)); return q },
      lte(col, val) { ops.push(['lte', col]); filters.push((r) => String(r[col]) <= String(val)); return q },
      in(col, vals) { ops.push(['in', col]); const s = new Set(vals); filters.push((r) => s.has(r[col])); return q },
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
          // THE UNIQUE CONSTRAINT, emulated. This is the whole point of the fake.
          for (const row of rows) {
            if (table === 'discord_calendar_posts') {
              const clash = db[table].some((r) => r.event_id === row.event_id && r.post_kind === row.post_kind)
              if (clash) {
                const err = { code: '23505', message: 'duplicate key value violates unique constraint' }
                return {
                  select: () => ({ single: () => Promise.resolve({ data: null, error: err }) }),
                  then: (r) => r({ data: null, error: err }),
                }
              }
            }
          }
          const stored = rows.map((r) => ({ id: `row-${++seq}`, status: 'pending', ...r }))
          db[table].push(...stored)
          const result = { data: stored[0], error: null }
          return {
            select: () => ({ single: () => Promise.resolve(result) }),
            then: (r) => r({ data: stored, error: null }),
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
              db[table] = db[table].filter((r) => r[col] !== val)
              return Promise.resolve({ data: null, error: null })
            },
          }
        },
      }
    },
  }
}

export function fakeDiscord({ failCreate = null } = {}) {
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

export const NOW = new Date('2026-09-10T18:00:00Z') // 11:00 AM PDT
export const HOUR = 3600_000
export const iso = (base, ms) => new Date(base.getTime() + ms).toISOString()

export const baseConfig = {
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

export const event = (over = {}) => ({
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

/** Matches only the cancellation sweep's read of the tracking table. */
export const sweepRead = (table, ops) =>
  table === 'discord_calendar_posts' && ops.some(([m, c]) => m === 'eq' && c === 'status')

export const JWT_ERR = { code: 'PGRST301', message: 'JWT issued at future' }
