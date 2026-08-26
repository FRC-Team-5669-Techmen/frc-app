// The calendar sync engine.
//
// Runs on Deno inside the discord-calendar Edge Function, and unchanged on Node
// inside scripts/discord/calendar-sync.test.mjs. Keep it to the intersection of
// both runtimes: plain ESM, explicit file extensions on relative imports, and
// no imports beyond `node:crypto` (which Deno implements).
//
// One pass = cancellations, then #calendar posts, then #announcements reminders.
// Everything it does is decided by two tables:
//
//   public.events                  — the source of truth (this app's schedule)
//   public.discord_calendar_posts  — what has already been posted
//
// The no-double-post guarantee is a DATABASE constraint, not a code path:
// unique (event_id, post_kind). Every write reserves that row BEFORE talking to
// Discord, so two overlapping cron runs cannot both post the same thing — the
// loser gets 23505 and skips.
//
// Report-only mode writes to discord_calendar_log and NOTHING else. It never
// reserves a tracking row, so a week of dry runs does not burn the dedupe keys:
// flipping to live posts everything as if for the first time.

import { calendarMessage, reminderMessage, namedSubteamRoles, payloadHash } from './render.js'
import { norm, DiscordError } from './discord.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// Lead times, longest first. `kind` is the post_kind stored on the tracking row.
//
// reminder_24h was retired on 2026-08-26. The Sunday week-ahead digest already
// tells the team what is happening tomorrow, so the 24h reminder was the one
// duplicated post that also pings a role. The 2h reminder is same-day and
// nothing else covers it, so it stays.
//
// Retired by removing the entry from this array and nothing else. The rendering
// path (reminderMessage with lead '24h'), the existing dedupe rows in
// discord_calendar_posts and the existing discord_calendar_log rows are all
// deliberately left intact: already-posted 24h messages are still edited on a
// change and still struck through on a cancellation, because the cancellation
// sweep walks the tracking table rather than this array. Restoring the single
// commented line below brings the reminder back with no other edit.
export const REMINDERS = [
  // { kind: 'reminder_24h', lead: '24h', leadMs: 24 * HOUR },
  { kind: 'reminder_2h',  lead: '2h',  leadMs: 2 * HOUR },
]

// The shortest lead still in service. Derived from REMINDERS rather than indexed
// into it, so adding or removing an entry above cannot leave this reading the
// wrong element (or undefined).
const SHORTEST_LEAD_MS = Math.min(...REMINDERS.map(r => r.leadMs))

// How far back to keep looking at events. An event that already ended is still
// loaded briefly so a late edit (a mentor fixing the location afterwards) still
// reaches the posted message.
const LOOKBACK_MS = 3 * DAY

/**
 * @param {object} o
 * @param {object} o.supabase   service-role supabase-js client
 * @param {object} o.discord    createDiscord() instance
 * @param {object} o.config     { guildId, calendarChannel, announceChannel, horizonDays, reportOnly, runId }
 * @param {Date}   [o.now]
 * @returns {Promise<object>} summary
 */
export async function runCalendarSync({ supabase, discord, config, now = new Date() }) {
  const { runId, reportOnly } = config
  const logRows = []
  const summary = {
    run_id: runId,
    report_only: reportOnly,
    events_considered: 0,
    created: 0, edited: 0, cancelled: 0, superseded: 0,
    skipped: 0, planned: 0, errors: 0,
  }

  const log = (action, { eventId = null, postKind = null, ...detail } = {}) => {
    logRows.push({
      run_id: runId,
      event_id: eventId,
      post_kind: postKind,
      action,
      report_only: reportOnly,
      detail: Object.keys(detail).length ? detail : null,
    })
  }
  // Wire the REST layer's 429 handling into the same log table.
  if (discord.onEventSink) discord.onEventSink(log)

  const flush = async () => {
    if (!logRows.length) return
    const batch = logRows.splice(0, logRows.length)
    const { error } = await supabase.from('discord_calendar_log').insert(batch)
    // A logging failure must never take down the run; surface it and continue.
    if (error) console.error('[discord-calendar] log insert failed:', error.message)
  }

  log('run_start', { now: now.toISOString(), horizon_days: config.horizonDays })

  try {
    // ── 1. Resolve channels and roles BY NAME ────────────────────────────────
    // No snowflake is stored anywhere in this repo. A renamed or recreated
    // channel is picked up on the next run instead of posting into a dead ID.
    const { channelsByName, rolesByName } = await discord.resolveGuild(config.guildId)
    const calendarChannel = channelsByName.get(norm(config.calendarChannel))
    const announceChannel = channelsByName.get(norm(config.announceChannel))

    log('resolve', {
      calendar_channel: calendarChannel ? { id: calendarChannel.id, name: calendarChannel.name } : null,
      announce_channel: announceChannel ? { id: announceChannel.id, name: announceChannel.name } : null,
      roles_seen: rolesByName.size,
    })

    if (!calendarChannel) throw new Error(`guild has no text channel named #${config.calendarChannel}`)
    if (!announceChannel) throw new Error(`guild has no text channel named #${config.announceChannel}`)

    // ── 2. Cancellation sweep ────────────────────────────────────────────────
    // public.events has no `cancelled` column — staff cancel by deleting the
    // row. So "cancelled" is detected as: we posted about this event, and the
    // event no longer exists. The tracking row deliberately has no FK, which is
    // the only reason the evidence survives the delete.
    await cancellationSweep({ supabase, discord, config, now, log, summary })

    // ── 3. Load the event window ─────────────────────────────────────────────
    const windowStart = new Date(now.getTime() - LOOKBACK_MS).toISOString()
    const windowEnd = new Date(now.getTime() + config.horizonDays * DAY).toISOString()

    const { data: events, error: evErr } = await supabase
      .from('events')
      .select('id, title, kind, starts_at, ends_at, location, notes, updated_at')
      .gte('starts_at', windowStart)
      .lte('starts_at', windowEnd)
      .order('starts_at', { ascending: true })
    if (evErr) throw new Error(`loading events: ${evErr.message}`)

    summary.events_considered = events?.length || 0

    const ids = (events || []).map(e => e.id)
    const tracking = await loadTracking(supabase, ids)
    const keyOf = (eventId, kind) => `${eventId}:${kind}`

    // ── 4. #calendar posts ───────────────────────────────────────────────────
    for (const event of events || []) {
      const payload = calendarMessage(event)
      await upsertPost({
        supabase, discord, config, log, summary,
        event, postKind: 'calendar', payload,
        channel: calendarChannel,
        existing: tracking.get(keyOf(event.id, 'calendar')),
      })
    }

    // ── 5. #announcements reminders ──────────────────────────────────────────
    for (const event of events || []) {
      const msUntil = new Date(event.starts_at).getTime() - now.getTime()

      // Which roles does this event NAME? (No subteam column exists; see
      // render.js.) Unresolvable names simply do not ping.
      const wanted = namedSubteamRoles(event)
      const roleIds = []
      const unresolved = []
      const unmentionable = []
      for (const name of wanted) {
        const role = rolesByName.get(norm(name))
        if (!role) { unresolved.push(name); continue }
        roleIds.push(role.id)
        if (role.mentionable === false) unmentionable.push(role.name)
      }
      if (unresolved.length || unmentionable.length) {
        log('skipped', {
          eventId: event.id, reason: 'role_lookup',
          unresolved_roles: unresolved, not_mentionable: unmentionable,
        })
      }

      for (const r of REMINDERS) {
        const existing = tracking.get(keyOf(event.id, r.kind))
        const payload = reminderMessage(event, { lead: r.lead, roleIds })

        if (existing) {
          // Already handled once. Only an edit (content changed) is possible.
          await upsertPost({
            supabase, discord, config, log, summary,
            event, postKind: r.kind, payload,
            channel: announceChannel, existing,
          })
          continue
        }

        // Not posted yet — is it due?
        const due = msUntil > 0 && msUntil <= r.leadMs
        if (!due) {
          if (msUntil <= 0) {
            // Event already started and this reminder never fired (the cron was
            // down, or the event was created late). Firing now is noise, so the
            // slot is closed permanently rather than left to fire next hour.
            await markSuperseded({ supabase, config, log, summary, event, postKind: r.kind, channel: announceChannel, payload, reason: 'event_already_started' })
          }
          continue
        }

        // A 24h reminder that first becomes visible when the event is already
        // inside 2h is late, not a 24h reminder. Close it and let the 2h fire.
        if (r.kind === 'reminder_24h' && msUntil <= SHORTEST_LEAD_MS) {
          await markSuperseded({ supabase, config, log, summary, event, postKind: r.kind, channel: announceChannel, payload, reason: 'inside_2h_window' })
          continue
        }

        await upsertPost({
          supabase, discord, config, log, summary,
          event, postKind: r.kind, payload,
          channel: announceChannel, existing: null,
        })
      }
    }

    log('run_end', { ...summary })
  } catch (err) {
    summary.errors += 1
    summary.fatal = err.message
    log('error', { fatal: true, message: err.message, status: err.status ?? null })
  } finally {
    await flush()
  }

  return summary
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracking rows
// ─────────────────────────────────────────────────────────────────────────────

async function loadTracking(supabase, eventIds) {
  const map = new Map()
  if (!eventIds.length) return map
  // Chunked so a long horizon cannot blow the URL length on the `in` filter.
  for (let i = 0; i < eventIds.length; i += 200) {
    const chunk = eventIds.slice(i, i + 200)
    const { data, error } = await supabase
      .from('discord_calendar_posts')
      .select('*')
      .in('event_id', chunk)
    if (error) throw new Error(`loading tracking rows: ${error.message}`)
    for (const row of data || []) map.set(`${row.event_id}:${row.post_kind}`, row)
  }
  return map
}

/**
 * Create-or-edit one tracked message.
 *
 * Create is reserve-then-post:
 *   1. insert the tracking row with status 'pending'  ← the unique constraint
 *      is the gate; a concurrent run loses here and posts nothing.
 *   2. POST the message.
 *   3. update the row to 'posted' with the message_id.
 *
 * If step 2 fails with a definitive 4xx (Discord rejected it, so no message was
 * created) the reservation is released so the next run can retry. If it fails
 * ambiguously (network drop, exhausted 429/5xx retries — the message may or may
 * not exist) the reservation is deliberately KEPT as 'pending' and never
 * auto-retried. "Nothing double-posts" is the requirement; a stale pending row
 * is a visible, fixable state, and a duplicate ping to sixty people is not.
 */
async function upsertPost({ supabase, discord, config, log, summary, event, postKind, payload, channel, existing }) {
  const hash = payloadHash(payload)
  const base = {
    event_id: event.id,
    post_kind: postKind,
    channel_id: channel.id,
    channel_name: channel.name,
    content_hash: hash,
    event_snapshot: event,
    event_starts_at: event.starts_at,
    event_ends_at: event.ends_at,
  }

  // ── EDIT ──────────────────────────────────────────────────────────────────
  if (existing) {
    if (existing.status === 'pending') {
      summary.skipped += 1
      log('skipped', { eventId: event.id, postKind, reason: 'pending_stale', tracking_id: existing.id })
      return
    }
    if (existing.status !== 'posted' || !existing.message_id) {
      // superseded / cancelled / archived are terminal. Counted, not logged —
      // an hourly cron would otherwise write the same "still terminal" row every
      // hour for every event still inside the window.
      summary.skipped += 1
      return
    }
    if (existing.content_hash === hash) {
      summary.skipped += 1
      return
    }

    if (config.reportOnly) {
      summary.planned += 1
      log('plan_edit', { eventId: event.id, postKind, channel: channel.name, message_id: existing.message_id, preview: preview(payload) })
      return
    }

    try {
      await discord.editMessage(existing.channel_id, existing.message_id, payload)
    } catch (err) {
      // 10008 Unknown Message — somebody deleted it in Discord. We do not
      // resurrect it (deleting was a human decision); we stop trying.
      if (err instanceof DiscordError && err.code === 10008) {
        await supabase.from('discord_calendar_posts')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        log('message_missing', { eventId: event.id, postKind, message_id: existing.message_id })
        return
      }
      summary.errors += 1
      log('error', { eventId: event.id, postKind, phase: 'edit', message: err.message, status: err.status ?? null })
      return
    }

    await supabase.from('discord_calendar_posts')
      .update({ ...base, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    summary.edited += 1
    log('edited', { eventId: event.id, postKind, channel: channel.name, message_id: existing.message_id })
    return
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (config.reportOnly) {
    summary.planned += 1
    log('plan_create', { eventId: event.id, postKind, channel: channel.name, preview: preview(payload) })
    return
  }

  const { data: reserved, error: resErr } = await supabase
    .from('discord_calendar_posts')
    .insert({ ...base, status: 'pending' })
    .select('id')
    .single()

  if (resErr) {
    if (resErr.code === '23505') {
      // Another run (or another region) claimed it first. Correct outcome.
      summary.skipped += 1
      log('skipped', { eventId: event.id, postKind, reason: 'already_reserved' })
      return
    }
    summary.errors += 1
    log('error', { eventId: event.id, postKind, phase: 'reserve', message: resErr.message })
    return
  }

  let message
  try {
    message = await discord.createMessage(channel.id, payload)
  } catch (err) {
    const definitive = err instanceof DiscordError && err.status >= 400 && err.status < 500 && err.status !== 429
    if (definitive) {
      await supabase.from('discord_calendar_posts').delete().eq('id', reserved.id)
      log('error', { eventId: event.id, postKind, phase: 'create', released: true, message: err.message, status: err.status })
    } else {
      log('error', {
        eventId: event.id, postKind, phase: 'create', released: false,
        message: err.message, status: err.status ?? null,
        note: 'reservation kept as pending — outcome unknown, will not auto-retry',
      })
    }
    summary.errors += 1
    return
  }

  await supabase.from('discord_calendar_posts')
    .update({ status: 'posted', message_id: message.id, updated_at: new Date().toISOString() })
    .eq('id', reserved.id)
  summary.created += 1
  log('created', { eventId: event.id, postKind, channel: channel.name, message_id: message.id })
}

/** Close a reminder slot without posting, so it can never fire late. */
async function markSuperseded({ supabase, config, log, summary, event, postKind, channel, payload, reason }) {
  if (config.reportOnly) {
    summary.planned += 1
    log('superseded', { eventId: event.id, postKind, reason, planned: true })
    return
  }
  const { error } = await supabase.from('discord_calendar_posts').insert({
    event_id: event.id,
    post_kind: postKind,
    channel_id: channel.id,
    channel_name: channel.name,
    content_hash: payloadHash(payload),
    event_snapshot: event,
    event_starts_at: event.starts_at,
    event_ends_at: event.ends_at,
    status: 'superseded',
  })
  if (error && error.code !== '23505') {
    summary.errors += 1
    log('error', { eventId: event.id, postKind, phase: 'supersede', message: error.message })
    return
  }
  summary.superseded += 1
  log('superseded', { eventId: event.id, postKind, reason })
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancellation
// ─────────────────────────────────────────────────────────────────────────────

async function cancellationSweep({ supabase, discord, config, now, log, summary }) {
  // Candidates: live messages about events that have not finished yet. An event
  // deleted after it already ended is not a cancellation, it is housekeeping —
  // those rows fall outside this filter and are simply left alone.
  const { data: candidates, error } = await supabase
    .from('discord_calendar_posts')
    .select('*')
    .eq('status', 'posted')
    .gte('event_ends_at', now.toISOString())
  if (error) throw new Error(`loading cancellation candidates: ${error.message}`)
  if (!candidates?.length) return

  const eventIds = [...new Set(candidates.map(r => r.event_id))]
  const alive = new Set()
  for (let i = 0; i < eventIds.length; i += 200) {
    const chunk = eventIds.slice(i, i + 200)
    const { data, error: aErr } = await supabase.from('events').select('id').in('id', chunk)
    if (aErr) throw new Error(`checking event existence: ${aErr.message}`)
    for (const e of data || []) alive.add(e.id)
  }

  for (const row of candidates) {
    if (alive.has(row.event_id)) continue

    // The event row is gone. Render from the snapshot — that is what it is for.
    const snap = row.event_snapshot
    const payload = row.post_kind === 'calendar'
      ? calendarMessage(snap, { cancelled: true })
      : reminderMessage(snap, {
          lead: row.post_kind === 'reminder_24h' ? '24h' : '2h',
          // No pings on a cancellation: the ping already happened.
          roleIds: [],
          cancelled: true,
        })

    if (config.reportOnly) {
      summary.planned += 1
      log('plan_cancel', { eventId: row.event_id, postKind: row.post_kind, message_id: row.message_id, title: snap?.title })
      continue
    }

    try {
      await discord.editMessage(row.channel_id, row.message_id, payload)
    } catch (err) {
      if (err instanceof DiscordError && err.code === 10008) {
        await supabase.from('discord_calendar_posts')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('id', row.id)
        log('message_missing', { eventId: row.event_id, postKind: row.post_kind, message_id: row.message_id })
        continue
      }
      summary.errors += 1
      log('error', { eventId: row.event_id, postKind: row.post_kind, phase: 'cancel', message: err.message, status: err.status ?? null })
      continue
    }

    // Never deleted — the message stays, struck through and marked cancelled.
    await supabase.from('discord_calendar_posts')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        content_hash: payloadHash(payload),
      })
      .eq('id', row.id)
    summary.cancelled += 1
    log('cancelled', { eventId: row.event_id, postKind: row.post_kind, message_id: row.message_id, title: snap?.title })
  }
}

/** Small, log-safe rendering of what would have been sent in report-only mode. */
function preview(payload) {
  const e = payload.embeds?.[0]
  return {
    content: payload.content || null,
    title: e?.title || null,
    when: e?.fields?.find(f => f.name === 'When')?.value || null,
    where: e?.fields?.find(f => f.name === 'Where')?.value || null,
    description: e?.description ? String(e.description).slice(0, 200) : null,
    mentions: payload.allowed_mentions?.roles || [],
  }
}
