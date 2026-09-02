// The Discord calendar sync engine's core correctness properties, driven
// against the REAL engine that deploys (`supabase/functions/discord-calendar/
// lib/calendarSync.js`), not a copy of it.
//
// These are ports of cases from `scripts/discord/calendar-sync.test.mjs`, which
// still exists and still runs (`npm run discord:calendar:test`, and as a child
// process from `tests/legacy-suites.test.js`). See `tests/fixtures/
// discord-calendar.js` for why the fakes are a second copy.
//
// WHAT IS PORTED, AND WHY THIS SUBSET. The property the whole feature turns on
// is "nothing double-posts to sixty people", which is a database constraint
// plus reserve-then-send rather than app logic. Every case below is one edge of
// that: the second run, the changed event, the cancellation, the two kinds of
// send failure, and the retry path. The reminder-window walk and the subteam
// ping cases stay in the legacy script, which this suite runs in full.

import { describe, expect, test } from 'vitest'
import { runCalendarSync } from '../supabase/functions/discord-calendar/lib/calendarSync.js'
import {
  fakeSupabase, fakeDiscord, baseConfig, event, iso, NOW, HOUR, sweepRead, JWT_ERR,
} from './fixtures/discord-calendar.js'

const run = (supabase, discord, config = {}, now = NOW) =>
  runCalendarSync({ supabase, discord, now, config: { ...baseConfig, ...config } })

describe('no double post', () => {
  test('report-only posts nothing and burns no dedupe key', async () => {
    const sb = fakeSupabase({ events: [event()] })
    const dc = fakeDiscord()
    const s = await run(sb, dc, { reportOnly: true })
    expect(dc.calls.created).toHaveLength(0)
    expect(sb._db.discord_calendar_posts).toHaveLength(0)
    expect(s.planned).toBeGreaterThanOrEqual(1)
    expect(sb._db.discord_calendar_log.some((l) => l.action === 'plan_create')).toBe(true)
  })

  test('POSITIVE CONTROL: the same fixture in live mode does post and does reserve', async () => {
    // Without this, the assertions above are satisfied by an engine that has
    // simply stopped working: "posted nothing" is what a broken run looks like.
    const sb = fakeSupabase({ events: [event()] })
    const dc = fakeDiscord()
    const s = await run(sb, dc)
    expect(s.created).toBe(1)
    expect(dc.calls.created[0].channelId).toBe('chan-cal')
    const row = sb._db.discord_calendar_posts[0]
    expect(row.post_kind).toBe('calendar')
    expect(row.status).toBe('posted')
    expect(row.message_id).toBe('msg-1')
  })

  test('a second run over unchanged data posts nothing', async () => {
    const sb = fakeSupabase({ events: [event()] })
    const dc = fakeDiscord()
    await run(sb, dc)
    expect(dc.calls.created).toHaveLength(1)
    const s = await run(sb, dc)
    expect(dc.calls.created).toHaveLength(1)
    expect(s.created).toBe(0)
    expect(s.edited).toBe(0)
  })

  test('POSITIVE CONTROL: the fake enforces unique (event_id, post_kind)', async () => {
    // The dedupe assertion above means nothing if the fake would have accepted
    // a second row anyway. Insert the clashing row directly and require 23505.
    const sb = fakeSupabase({ events: [event()] })
    await run(sb, fakeDiscord())
    const { error } = await sb
      .from('discord_calendar_posts')
      .insert({ event_id: 'ev-1', post_kind: 'calendar' })
      .select()
      .single()
    expect(error?.code).toBe('23505')
  })

  test('a changed event edits the existing message instead of posting again', async () => {
    const ev = event()
    const sb = fakeSupabase({ events: [ev] })
    const dc = fakeDiscord()
    await run(sb, dc)

    ev.location = 'FLL Room'
    const s = await run(sb, dc)
    expect(s.created).toBe(0)
    expect(s.edited).toBe(1)
    expect(dc.calls.edited[0].messageId).toBe('msg-1')
    expect(JSON.stringify(dc.calls.edited[0].payload)).toMatch(/FLL Room/)
  })
})

describe('cancellation', () => {
  test('a deleted event is struck through and kept, never deleted', async () => {
    const sb = fakeSupabase({ events: [event()] })
    const dc = fakeDiscord()
    await run(sb, dc)

    sb._db.events = [] // staff cancel by deleting the row; there is no cancelled column
    const s = await run(sb, dc)
    expect(s.cancelled).toBe(1)
    const edit = dc.calls.edited.at(-1)
    expect(edit.payload.content).toMatch(/CANCELLED/)
    expect(edit.payload.content).toMatch(/~~/)
    expect(sb._db.discord_calendar_posts[0].status).toBe('cancelled')
    expect(sb._db.discord_calendar_posts[0].message_id).toBeTruthy()
  })

  test('a second sweep does not re-edit an already cancelled message', async () => {
    const sb = fakeSupabase({ events: [event()] })
    const dc = fakeDiscord()
    await run(sb, dc)
    sb._db.events = []
    await run(sb, dc)
    const edits = dc.calls.edited.length
    await run(sb, dc)
    expect(dc.calls.edited).toHaveLength(edits)
  })
})

describe('send failures: the reservation rule', () => {
  test('a definitive 4xx releases the reservation', async () => {
    const { DiscordError } = await import('../supabase/functions/discord-calendar/lib/discord.js')
    const sb = fakeSupabase({ events: [event()] })
    await run(sb, fakeDiscord({ failCreate: new DiscordError('bad request', { status: 400 }) }))
    expect(sb._db.discord_calendar_posts).toHaveLength(0)
  })

  test('an ambiguous failure KEEPS the reservation and is never auto-retried', async () => {
    const sb = fakeSupabase({ events: [event()] })
    await run(sb, fakeDiscord({ failCreate: new Error('socket hang up') }))
    expect(sb._db.discord_calendar_posts[0].status).toBe('pending')

    const s = await run(sb, fakeDiscord())
    expect(s.created).toBe(0)
    expect(sb._db.discord_calendar_log.some((l) => l.detail?.reason === 'pending_stale')).toBe(true)
  })
})

describe('failure isolation (the nine aborted production runs)', () => {
  test('a failing cancellation sweep no longer stops the reminders posting', async () => {
    const ev = event({ starts_at: iso(NOW, 90 * 60_000), ends_at: iso(NOW, 4 * HOUR) })
    const sb = fakeSupabase({ events: [ev] }, { failSelect: (t, o) => (sweepRead(t, o) ? JWT_ERR : null) })
    const dc = fakeDiscord()
    const s = await run(sb, dc)

    expect(s.fatal).toBeUndefined()
    expect(dc.calls.created.filter((c) => c.channelId === 'chan-ann')).toHaveLength(1)
    expect(dc.calls.created.filter((c) => c.channelId === 'chan-cal')).toHaveLength(1)
  })

  test('a retried run cannot create a second row or a second message', async () => {
    const ev = event({ starts_at: iso(NOW, 90 * 60_000), ends_at: iso(NOW, 4 * HOUR) })
    const sb = fakeSupabase({ events: [ev] })
    const dc = fakeDiscord()
    await run(sb, dc)

    const after = sb._db.discord_calendar_posts.map((r) => `${r.event_id}:${r.post_kind}`).sort()
    expect(after).toEqual(['ev-1:calendar', 'ev-1:reminder_2h'])
    expect(dc.calls.created).toHaveLength(2)

    // Every distinct read fails once with the JWT error, then succeeds.
    const seen = new Set()
    const sb2 = fakeSupabase(sb._db, {
      failSelect: (t, o) => {
        const key = `${t}:${o.map((x) => x.join('.')).join(',')}`
        if (seen.has(key)) return null
        seen.add(key)
        return JWT_ERR
      },
    })
    sb2._db.discord_calendar_log.length = 0 // the log accumulates across runs on one db
    const s = await run(sb2, dc)

    expect(sb2._db.discord_calendar_log.filter((l) => l.action === 'auth_retry').length).toBeGreaterThanOrEqual(1)
    expect(s.created).toBe(0)
    expect(dc.calls.created).toHaveLength(2)
    expect(sb2._db.discord_calendar_posts.map((r) => `${r.event_id}:${r.post_kind}`).sort()).toEqual(after)
  })

  test('only auth-shaped failures are retried', async () => {
    const dbErr = { code: '57014', message: 'canceling statement due to statement timeout' }
    const sb = fakeSupabase({ events: [event()] }, { failSelect: (t, o) => (sweepRead(t, o) ? dbErr : null) })
    const s = await run(sb, fakeDiscord())
    expect(sb._db.discord_calendar_log.filter((l) => l.action === 'auth_retry')).toHaveLength(0)
    expect(s.sweep_error).toMatch(/statement timeout/)
    expect(s.created).toBe(1) // POSITIVE CONTROL: not retried, and not aborted either
  })
})
