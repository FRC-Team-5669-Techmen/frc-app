/**
 * THE TOOLS: every MCP tool the connector lists comes from the registry
 * (registry.generated.js, compiled from tools/connector/registry/tools.yaml),
 * and every one runs here, as him. Reads go through his own session (`select`
 * and `rpc`, so RLS and every function gate decide); writes go through
 * engine.write, which goes through connector_call. Nothing here writes a table.
 */
import { TOOLS, FUNCTIONS, liveFunction, levelFor, fitForm } from './registry.js'
import { write, undoLast, NotRegistered } from './engine.js'
import { RESOLVERS, roster, resolveMember, displayName } from './resolve.js'
import { laDateKey, laMidnightMs, addDays, laClock, laDay, laWallToIso } from './dates.js'
import { isSchemaMissing } from './errors.js'
import { batteryBoard, chargeLabel, statusLabel, kindLabel, brownoutLabel, CHECK_THRESHOLDS } from '../../../src/batteries.js'
import { leaderboard as driverLeaderboard, SCORE_RULES } from '../../../src/driverScore.js'
import { boardView, roleLabel } from '../../../src/roleBoard.js'

export class UnknownTool extends Error {}

const COMMON = {
  said: { type: 'string', description: 'His request in his own words, exactly as he said it, the same for every call made for that one request.' },
  request_id: { type: 'string', description: 'A fresh random id for each change he asks for; reuse it unchanged only when retrying that same change.' },
  dry_run: { type: 'boolean', description: 'Preview only: show what would change and write nothing.' },
  confirm_token: { type: 'string', description: 'The token a preview handed back, sent only after he said yes.' },
  again: { type: 'boolean', description: 'true only when he asks for the same change a second time on purpose.' },
}

function jsonSchemaOf(arg) {
  const s = { type: arg.type === 'integer' ? 'integer' : arg.type ?? 'string', description: arg.describe }
  if (arg.enum) s.enum = arg.enum
  if (arg.type === 'array') s.items = { type: arg.items ?? 'string' }
  return s
}

/** The MCP tool list: one entry per registry tool. */
export function toolList() {
  return Object.values(TOOLS).map((t) => {
    const properties = { said: COMMON.said }
    const required = ['said']
    for (const [name, a] of Object.entries(t.args ?? {})) {
      properties[name] = jsonSchemaOf(a)
      if (a.required) required.push(name)
    }
    if (t.kind === 'function' || t.name === 'call_app' || t.name === 'undo_last') {
      Object.assign(properties, { request_id: COMMON.request_id, dry_run: COMMON.dry_run, confirm_token: COMMON.confirm_token, again: COMMON.again })
    }
    const say = t.say?.length ? ` He might say: ${t.say.map((x) => `"${x}"`).join(', ')}.` : ''
    return {
      name: t.name,
      description: `${t.describe}${say}`,
      inputSchema: { type: 'object', properties, required, additionalProperties: false },
      annotations: { readOnlyHint: t.kind === 'read' || t.name === 'find_tool', destructiveHint: false },
    }
  })
}

const short = (s, n = 160) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}...` : s)
const notSetUp = (what) => ({ status: 'not_set_up', message: `${what} is not set up yet: its SQL has not been pasted into Supabase. Nothing was changed.` })

// ── The hand reads ───────────────────────────────────────────────────────────

const READS = {
  async scouting_event(ctx, a) {
    const resolved = await RESOLVERS.event(ctx, a.event)
    if (!resolved.event) return resolved
    const spec = { table: 'scouting_records', columns: ['*'], eq: { event_id: resolved.event.id }, order: [['updated_at', 'desc']], limit: 1000 }
    const records = await ctx.backend.select(ctx.session, spec)
    if (records.error) return isSchemaMissing(records.error) ? notSetUp('Scouting') : { status: 'refused', message: records.error.message }
    const delivery = await ctx.backend.select(ctx.session, { table: 'scouting_delivery', columns: ['*'], eq: { event_id: resolved.event.id }, limit: 1000 })
    return { status: 'ok', event: resolved.event, records: records.data, delivery: delivery.error ? [] : delivery.data,
      truncated: records.data.length === 1000, delivery_error: delivery.error ? 'Delivery status unavailable.' : null,
      note: 'Claims, observations, official alliance results and statistical estimates are distinct evidence. Missing observations are not failures.' }
  },
  async preview_scouting_import(ctx, a) {
    const resolved = await RESOLVERS.event(ctx, a.event)
    if (!resolved.event) return resolved
    if (!ctx.backend.scoutingImport) return { status: 'not_available', message: 'Import preview is unavailable in this environment.' }
    const result = await ctx.backend.scoutingImport(ctx.session, { event_id: resolved.event.id, event_key: a.event_key, ...(a.mode ? { mode: a.mode } : {}) })
    if (result.error) return { status: 'unavailable', message: 'Import preview is unavailable. Existing scouting data is unchanged.' }
    return { status: 'ok', preview: result.data }
  },
  async find_member(ctx, a) {
    const r = await resolveMember(ctx, a.name)
    if (!r.member) return r
    const m = r.member
    return { status: 'ok', member: { id: m.id, name: m.name, full_name: m.full_name, email: m.email, status: m.status, approved: m.approved, roles: m.roles, subteams: m.subteams } }
  },

  async list_members(ctx, a) {
    const list = await roster(ctx)
    if (list.error) return { status: 'refused', message: list.error.message }
    const status = a.status ?? 'active'
    const rows = list.members
      .filter((m) => status === 'all' || (m.status ?? 'active') === status)
      .filter((m) => !a.role || (m.roles ?? []).includes(a.role))
      .sort((x, y) => x.name.localeCompare(y.name))
    return { status: 'ok', count: rows.length, members: rows.map((m) => ({ name: m.name, email: m.email, roles: m.roles, subteams: m.subteams, status: m.status })) }
  },

  async todays_signins(ctx) {
    const today = laDateKey(ctx.now())
    const since = new Date(laMidnightMs(today) - 26 * 3600_000).toISOString()
    const [ev, pend, list] = await Promise.all([
      ctx.backend.select(ctx.session, { table: 'attendance_events', columns: ['id', 'user_id', 'type', 'event_time', 'category', 'location'], gte: { event_time: since }, order: [['event_time', 'asc']], limit: 5000 }),
      ctx.backend.select(ctx.session, { table: 'signout_requests', columns: ['id', 'member_id', 'note', 'requested_at'], eq: { status: 'pending' }, order: [['requested_at', 'asc']], limit: 200 }),
      roster(ctx),
    ])
    if (ev.error) return { status: 'refused', message: ev.error.message }
    const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
    const byMember = new Map()
    for (const e of ev.data) {
      if (!byMember.has(e.user_id)) byMember.set(e.user_id, [])
      byMember.get(e.user_id).push(e)
    }
    const people = []
    for (const [id, events] of byMember) {
      const todays = events.filter((e) => laDateKey(e.event_time) === today)
      const last = events[events.length - 1]
      const inNow = last.type === 'in' && ctx.now() - Date.parse(last.event_time) < 12 * 3600_000
      if (!todays.length && !inNow) continue
      const firstIn = todays.find((e) => e.type === 'in') ?? (inNow ? last : null)
      people.push({
        name: names.get(id) ?? 'Member',
        in_shop: inNow,
        first_in: laClock(firstIn?.event_time),
        last: `${last.type === 'in' ? 'in' : 'out'} at ${laClock(last.event_time)}`,
        category: last.category ?? 'build',
      })
    }
    people.sort((x, y) => Number(y.in_shop) - Number(x.in_shop) || x.name.localeCompare(y.name))
    const waiting = pend.error
      ? (isSchemaMissing(pend.error) ? 'not set up yet' : pend.error.message)
      : pend.data.map((p) => ({ name: names.get(p.member_id) ?? 'Member', note: short(p.note), asked_at: laClock(p.requested_at) }))
    return { status: 'ok', date: today, signed_in_today: people.length, in_shop_now: people.filter((p) => p.in_shop).length, people, signouts_waiting: waiting }
  },

  async member_hours(ctx, a) {
    const m = await resolveMember(ctx, a.member)
    if (!m.member) return m
    const r = await ctx.backend.rpc(ctx.session, 'member_standing', { p_member: m.member.id })
    if (r.error) return isSchemaMissing(r.error) ? notSetUp('Member standing') : { status: 'refused', message: r.error.message }
    const s = r.data ?? {}
    const adj = await ctx.backend.select(ctx.session, { table: 'hour_adjustments', columns: ['category', 'hours', 'reason', 'created_at'], eq: { member_id: m.member.id }, order: [['created_at', 'desc']], limit: 5 })
    return {
      status: 'ok',
      member: m.member.name,
      standing: s.standing,
      this_week: s.week ? { starts: s.week.start, hours: Number(s.week.hours ?? 0), required: Number(s.week.required ?? 0) } : null,
      this_month_meetings: s.month ? { counted: s.month.counted, attended: s.month.attended, lates: s.month.lates } : null,
      recent_weeks: (s.weeks ?? []).slice(0, 4).map((w) => ({ week: w.week_start, hours: Number(w.hours), required: Number(w.required), ok: w.ok })),
      open_records: (s.records ?? []).filter((x) => ['open', 'proposed'].includes(x.status)).map((x) => ({ kind: x.kind, reason: short(x.reason), since: x.opened_on })),
      recent_corrections: adj.error ? [] : adj.data.map((x) => ({ category: x.category, hours: Number(x.hours), reason: short(x.reason, 80), on: laDateKey(x.created_at) })),
      note: 'Totals across seasons are on the My Hours page; this is the week and month the handbook rules count.',
    }
  },

  async list_events(ctx, a) {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(a.from ?? '') ? a.from : laDateKey(ctx.now())
    const to = /^\d{4}-\d{2}-\d{2}$/.test(a.to ?? '') ? a.to : addDays(from, 13)
    const r = await ctx.backend.select(ctx.session, {
      table: 'events', columns: ['id', 'title', 'kind', 'starts_at', 'ends_at', 'location', 'notes'],
      lt: { starts_at: new Date(laMidnightMs(addDays(to, 1))).toISOString() }, gte: { ends_at: new Date(laMidnightMs(from)).toISOString() },
      order: [['starts_at', 'asc']], limit: 300,
    })
    if (r.error) return { status: 'refused', message: r.error.message }
    return {
      status: 'ok', from, to, count: r.data.length,
      events: r.data.map((e) => ({ id: e.id, title: e.title, kind: e.kind, day: laDay(e.starts_at), starts: laClock(e.starts_at), ends: laClock(e.ends_at), location: e.location, notes: short(e.notes, 120) })),
    }
  },

  // The role board (0031) for one event, read with the page's own model
  // (src/roleBoard.js): per slot and role who is assigned, backup and asked,
  // and what is still unfilled (assigned below needed).
  async role_board(ctx, a) {
    const ev = await RESOLVERS.event(ctx, a.event)
    if (!ev.event) return ev
    const r = await ctx.backend.rpc(ctx.session, 'role_board', { p_event: ev.event.id })
    if (r.error) return isSchemaMissing(r.error) ? notSetUp('The role board') : { status: 'refused', message: r.error.message }
    const v = boardView(r.data, null)
    const want = a.day ? String(a.day).toLowerCase() : null
    const days = v.days.filter((d) => !want || d.day === want || new Date(`${d.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase() === want)
    const names = (c, st) => c.requests.filter((q) => q.status === st).map((q) => q.name)
    return {
      status: 'ok', event: { id: ev.event.id, title: r.data.event.title },
      unfilled_boxes: days.reduce((n, d) => n + d.unfilled.length, 0),
      days: days.map((d) => ({
        day: d.day,
        weekday: new Date(`${d.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        slots: d.slots.map((s) => ({
          slot_id: s.id, slot: s.label, starts: laClock(s.starts_at), ends: s.ends_at ? laClock(s.ends_at) : null,
          roles: s.cells.filter((c) => c.needed > 0).map((c) => ({
            role: c.role, label: roleLabel(c.role), needed: c.needed, assigned: names(c, 'assigned'), backup: names(c, 'backup'), asked: names(c, 'asked'),
            ...(a.ids ? { requests: c.requests.map((q) => ({ request_id: q.id, member: q.name, status: q.status })) } : {}),
            short: Math.max(0, c.needed - c.assigned),
          })),
        })),
      })),
      how_to_change: 'assign_roles: items of {member, role, status: assigned|backup|asked|removed} with slot (label), or day (date or weekday) for every slot that day needing the role.',
    }
  },

  async event_signups(ctx, a) {
    const ev = await RESOLVERS.event(ctx, a.event)
    if (!ev.event) return ev
    const [s, list] = await Promise.all([
      ctx.backend.select(ctx.session, { table: 'event_signups', columns: ['member_id', 'response', 'item', 'updated_at'], eq: { event_id: ev.event.id }, limit: 1000 }),
      roster(ctx),
    ])
    if (s.error) return { status: 'refused', message: s.error.message }
    const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
    const by = { going: [], maybe: [], declined: [] }
    for (const row of s.data) (by[row.response] ??= []).push(row.item ? `${names.get(row.member_id) ?? 'Member'} (${row.item})` : (names.get(row.member_id) ?? 'Member'))
    for (const k of Object.keys(by)) by[k].sort()
    return { status: 'ok', event: { title: ev.event.title, day: laDay(ev.event.starts_at), starts: laClock(ev.event.starts_at) }, going: by.going, maybe: by.maybe, not_going: by.declined, counts: { going: by.going.length, maybe: by.maybe.length, not_going: by.declined.length } }
  },

  async trip_boards(ctx, a) {
    const evs = await ctx.backend.rpc(ctx.session, 'hub_member_events', {})
    if (evs.error) return isSchemaMissing(evs.error) ? notSetUp('The trip hub') : { status: 'refused', message: evs.error.message }
    const trips = Array.isArray(evs.data) ? evs.data : []
    if (!trips.length) return { status: 'not_found', message: 'There are no trips in the hub.' }
    let trip
    if (a.trip) {
      const want = String(a.trip).toLowerCase()
      const hits = trips.filter((t) => String(t.title).toLowerCase().includes(want))
      if (!hits.length) return { status: 'not_found', message: `No trip matches "${a.trip}". The trips are: ${trips.map((t) => t.title).join(', ')}.` }
      if (hits.length > 1) return { status: 'ambiguous', message: `${hits.length} trips match: ${hits.map((t) => t.title).join(', ')}. Ask him which.` }
      trip = hits[0]
    } else {
      trip = trips.find((t) => !t.over) ?? trips[trips.length - 1]
    }
    const b = await ctx.backend.rpc(ctx.session, 'hub_member_board', { p_event: trip.id })
    if (b.error) return { status: 'refused', message: b.error.message }
    const board = b.data?.board ?? b.data
    if (a.full === true) return { status: 'ok', trip: { title: trip.title, starts_on: trip.starts_on, over: trip.over }, board, note: 'The whole board as staff see it.' }
    return { status: 'ok', trip: { title: trip.title, starts_on: trip.starts_on, over: trip.over }, ...summarizeBoard(board), note: 'A summary. Pass full: true for every field (pickups, phones, allergy detail).' }
  },

  async parent_responses(ctx, a) {
    let member = null
    if (a.member) {
      const m = await resolveMember(ctx, a.member)
      if (!m.member) return m
      member = m.member
    }
    const seasons = await ctx.backend.select(ctx.session, { table: 'seasons', columns: ['id', 'name', 'start_date', 'end_date'], order: [['start_date', 'desc']], limit: 20 })
    if (seasons.error) return { status: 'refused', message: seasons.error.message }
    const today = laDateKey(ctx.now())
    const season = seasons.data.find((s) => s.start_date <= today && s.end_date >= today) ?? seasons.data[0]
    if (!season) return { status: 'not_found', message: 'There is no season set up.' }
    const apps = await ctx.backend.select(ctx.session, {
      table: 'member_applications', columns: ['id', 'member_id', 'parent_name', 'submitted_at'],
      eq: { season_id: season.id, ...(member ? { member_id: member.id } : {}) }, order: [['submitted_at', 'desc']], limit: 500,
    })
    if (apps.error) return { status: 'refused', message: apps.error.message }
    if (!apps.data.length) return { status: 'ok', season: season.name, families: [], message: 'No applications this season.' }
    const pr = await ctx.backend.select(ctx.session, {
      table: 'parent_responses', columns: ['application_id', 'weekend_supervision', 'meal_support', 'travel_driving', 'employer_name', 'employer_contact_consent', 'donation_offer', 'submitted_at'],
      in: { application_id: apps.data.map((x) => x.id) }, limit: 1000,
    })
    if (pr.error) return isSchemaMissing(pr.error) ? notSetUp('The parent questionnaire') : { status: 'refused', message: pr.error.message }
    const list = await roster(ctx)
    const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
    const byApp = new Map(pr.data.map((x) => [x.application_id, x]))
    const families = apps.data.map((app) => {
      const r = byApp.get(app.id)
      return {
        student: names.get(app.member_id) ?? 'Member',
        parent: app.parent_name,
        answered: !!r,
        ...(r ? { weekends: r.weekend_supervision, meals: r.meal_support, driving: r.travel_driving, employer: r.employer_name ? `${r.employer_name}${r.employer_contact_consent ? ' (may contact)' : ''}` : null, donation: short(r.donation_offer, 100) } : {}),
      }
    })
    return { status: 'ok', season: season.name, answered: families.filter((f) => f.answered).length, waiting: families.filter((f) => !f.answered).length, families }
  },

  // The battery board (0026), read with the app's own rules (src/batteries.js).
  async list_batteries(ctx, a) {
    const [b, r] = await Promise.all([
      ctx.backend.select(ctx.session, { table: 'batteries', columns: ['*'], limit: 500 }),
      ctx.backend.select(ctx.session, { table: 'battery_runs', columns: ['*'], order: [['ran_at', 'desc']], limit: 3000 }),
    ])
    if (b.error || r.error) {
      const e = b.error || r.error
      return isSchemaMissing(e) ? notSetUp('The battery log') : { status: 'refused', message: e.message }
    }
    let board = batteryBoard(b.data, r.data)
    const show = a.show ?? 'in_service'
    if (show === 'match_ready') board = board.filter((x) => x.matchReady)
    else if (show === 'check') board = board.filter((x) => x.check)
    else if (show === 'in_service') board = board.filter((x) => x.status !== 'retired')
    if (a.battery) {
      const want = String(a.battery).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]*)0+(\d)/, '$1$2')
      board = board.filter((x) => x.label.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]*)0+(\d)/, '$1$2') === want)
    }
    const runsShown = a.battery ? 10 : 1
    return {
      status: 'ok', showing: show, count: board.length,
      thresholds: { brownout_in_last_runs: CHECK_THRESHOLDS.BROWNOUT_LOOKBACK, min_resting_volts: CHECK_THRESHOLDS.MIN_RESTING_VOLTS, max_resistance_mohm: CHECK_THRESHOLDS.MAX_RESISTANCE_MOHM, note: 'Proposed defaults.' },
      batteries: board.map((x) => ({
        label: x.label, status: statusLabel(x.status), charge: chargeLabel(x.charge_state), check: x.check, reasons: x.reasons, match_ready: x.matchReady,
        resting_volts: x.restingVolts, resistance_mohm: x.resistance, brownouts: x.brownouts, runs: x.runCount, last_used: x.lastUsed ? laClock(x.lastUsed) : null,
        recent: x.runs.slice(0, runsShown).map((run) => ({ kind: kindLabel(run.kind), match: run.match_label, on: laClock(run.ran_at), volts_before: run.voltage_before, volts_after: run.voltage_after, resistance_mohm: run.resistance_mohm, brownout: brownoutLabel(run.brownout) })),
      })),
      note: 'Blank voltage or resistance means not measured, never zero.',
    }
  },

  // The driver leaderboard (0029), scored with the app's own rule (src/driverScore.js).
  async list_drivers(ctx, a) {
    const [ds, sc, se] = await Promise.all([
      ctx.backend.select(ctx.session, { table: 'drive_sessions', columns: ['member_id', 'session_date', 'minutes', 'kind', 'sim_score', 'voided_at'], limit: 5000 }),
      ctx.backend.rpc(ctx.session, 'driver_rating_scores', {}),
      ctx.backend.select(ctx.session, { table: 'seasons', columns: ['id', 'name', 'start_date', 'end_date'], order: [['start_date', 'desc']], limit: 20 }),
    ])
    const e = ds.error || sc.error
    if (e) return isSchemaMissing(e) ? notSetUp('The driver leaderboard') : { status: 'refused', message: e.message }
    const today = laDateKey(ctx.now())
    const season = a.season === 'all' ? null : (se.data ?? []).find((s) => s.start_date <= today && (s.end_date == null || s.end_date >= today)) ?? null
    const list = await roster(ctx)
    const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
    const rows = driverLeaderboard(ds.data ?? [], sc.data ?? [], season, (id) => names.get(id) ?? '')
    const limit = Math.max(1, Math.min(50, Number(a.limit) || 10))
    const h = (x) => Math.round(x * 10) / 10
    return {
      status: 'ok', season: season ? season.name : 'All time', ranked: rows.length,
      drivers: rows.slice(0, limit).map((r) => ({ rank: r.rank, name: r.name, driver_score: r.score, robot_hours: h(r.realHours), mosim_hours: h(r.simHours), coach_average: r.coachAvg == null ? 'unrated' : Math.round(r.coachAvg * 100) / 100, coaches: r.coaches, sessions: r.sessions, best_mosim_score: r.bestSim })),
      formula: `Practice hours = robot hours + ${SCORE_RULES.SIM_WEIGHT} x MoSim hours; experience = 1 - e^(-hours/${SCORE_RULES.HOURS_SCALE}); Driver Score = 100 x (${SCORE_RULES.EXPERIENCE_WEIGHT} x experience + ${SCORE_RULES.COACH_WEIGHT} x coach), coach = newest rating per coach, 1-5 scaled to 0-1, unrated 0.`,
    }
  },

  async feedback_inbox(ctx, a) {
    const status = a.status ?? 'new'
    const limit = Math.max(1, Math.min(50, Number(a.limit) || 10))
    const spec = { table: 'feedback', columns: ['id', 'member_id', 'category', 'message', 'route', 'status', 'created_at', 'image_paths'], order: [['created_at', 'desc']], limit }
    if (status !== 'all') spec.in = { status: status === 'new' ? ['new', 'open'] : status === 'seen' ? ['seen', 'reviewed'] : status === 'wont_do' ? ['wont_do', 'dismissed'] : [status] }
    const r = await ctx.backend.select(ctx.session, spec)
    if (r.error) return { status: 'refused', message: r.error.message }
    const list = await roster(ctx)
    const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
    return {
      status: 'ok', showing: status, count: r.data.length,
      reports: r.data.map((f) => ({ id: f.id, from: names.get(f.member_id) ?? 'Member', type: f.category ?? 'untyped', status: f.status, page: f.route, on: laDateKey(f.created_at), message: short(f.message, 300), screenshots: Array.isArray(f.image_paths) ? f.image_paths.length : 0 })),
    }
  },
}

/** The trip board cut to what a phone answer needs: seats, who rides with whom, and open food. */
export function summarizeBoard(board) {
  const days = (board?.days ?? []).map((d) => ({
    day: d.label ?? d.date,
    runs: (d.runs ?? []).map((r) => ({
      run: r.run === 'to' ? 'there' : r.run,
      open_seats: r.open_seats ?? null,
      needs_seat: Array.isArray(r.needs_seat) ? r.needs_seat.map((x) => x?.name ?? x) : r.needs_seat ?? null,
      unplaced: Array.isArray(r.unplaced) ? r.unplaced.map((x) => x?.name ?? x) : r.unplaced ?? null,
      cars: (r.cars ?? []).map((c) => ({
        driver: c.driver,
        car: c.description ?? null,
        seats: c.seats,
        riders: (c.riders ?? []).map((x) => x.name),
        status: c.status,
        ...(c.problem ? { problem: c.problem } : {}),
      })),
    })),
  }))
  const meals = (board?.meals ?? []).map((m) => ({
    meal: m.label,
    items: (m.needs ?? []).map((n) => (n.claim ? `${n.label}: ${n.claim.what} (${n.claim.family})` : `${n.label}: OPEN`)),
    open: (m.needs ?? []).filter((n) => !n.claim).length,
  }))
  return { days, meals }
}

// ── find_tool / call_app over every reachable function ───────────────────────

const STOP = new Set(['the', 'a', 'an', 'to', 'for', 'of', 'and', 'on', 'in', 'is', 'my', 'me', 'can', 'you', 'please', 'there', 'way', 'how', 'do', 'i'])
const tokens = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w))
const stem = (w) => w.replace(/(ings|ing|ies|es|s|ed)$/, '')

export function findTools(query, limit = 5) {
  // A stem under two letters (the s of "member's") would prefix-match every action.
  const q = tokens(query).map(stem).filter((w) => w.length >= 2)
  if (!q.length) return []
  const scored = []
  for (const f of Object.values(FUNCTIONS)) {
    if (f.excluded || f.connector_only) continue
    const nameParts = f.name.split('_').map(stem)
    const hay = [...nameParts, ...tokens(f.describe)].map(stem).filter((h) => h.length >= 2)
    // A word in the action's own name counts most: "void session" is staff_void_session.
    const score = q.reduce((n, w) => n + (nameParts.includes(w) ? 3 : hay.includes(w) ? 2 : hay.some((h) => h.startsWith(w) || w.startsWith(h)) ? 1 : 0), 0)
    if (score > 0) scored.push({ f, score })
  }
  scored.sort((x, y) => y.score - x.score || x.f.name.localeCompare(y.f.name))
  return scored.slice(0, limit).map(({ f }) => ({
    name: f.name,
    does: f.describe,
    asks_first: f.level === 'confirm' || !!f.level_when,
    call: {
      tool: 'call_app',
      name: f.name,
      args: Object.fromEntries((f.forms[0]?.args ?? []).map((x) => [x.name, `<${x.type}${x.optional ? ', optional' : ''}>`])),
    },
  }))
}

// ── The runner ───────────────────────────────────────────────────────────────

const writeOpts = (a) => ({ dryRun: a.dry_run === true, requestId: a.request_id, confirmToken: a.confirm_token, again: a.again === true })

class InvalidArgument extends Error {}

function mapArgs(tool, a, resolved) {
  const out = {}
  for (const [k, tmpl] of Object.entries(tool.map ?? {})) {
    if (tmpl === '$said') { out[k] = a.said ?? ''; continue }
    let m = /^\$args\.([a-z_]+)$/.exec(tmpl)
    if (m) { if (a[m[1]] !== undefined) out[k] = a[m[1]]; continue }
    // $la.x: a time he said, read as Los Angeles wall-clock time.
    m = /^\$la\.([a-z_]+)$/.exec(tmpl)
    if (m) {
      if (a[m[1]] === undefined) continue
      const iso = laWallToIso(a[m[1]])
      if (!iso) throw new InvalidArgument(`"${a[m[1]]}" is not a time I can read for ${m[1]}. Send it as YYYY-MM-DD HH:MM, Los Angeles time. Nothing was changed.`)
      out[k] = iso
      continue
    }
    m = /^\$resolved\.([a-z_]+)\.([a-z_]+)$/.exec(tmpl)
    if (m) { out[k] = resolved[m[1]]?.[m[2]]; continue }
    out[k] = tmpl
  }
  return out
}

export async function runTool(ctx, name, a = {}) {
  const tool = TOOLS[name]
  if (!tool) throw new UnknownTool(`There is no tool named ${name}.`)
  try {
    if (tool.kind === 'read') return await READS[name](ctx, a)
    if (tool.kind === 'unavailable') {
      return { status: 'not_available', message: `${tool.gap} Tell him plainly, then call report_gap with what he asked so it gets built.` }
    }
    if (name === 'undo_last') return await undoLast(ctx, writeOpts(a))
    if (name === 'find_tool') {
      const hits = findTools(a.query)
      return hits.length
        ? { status: 'ok', matches: hits, next: 'Call call_app with one of these names and its arguments. Ask him for any value you do not have.' }
        : { status: 'no_match', message: 'Nothing in the app does that. Tell him so plainly and call report_gap with what he asked.' }
    }
    if (name === 'call_app') return await callApp(ctx, a)
    if (tool.kind === 'function') {
      const resolved = {}
      for (const [argName, spec] of Object.entries(tool.args ?? {})) {
        if (spec.resolve && a[argName] !== undefined) {
          const r = await RESOLVERS[spec.resolve](ctx, a[argName])
          if (r.status) return r
          resolved[argName] = r.member ?? r.event ?? r.battery
        }
      }
      let args
      try {
        args = mapArgs(tool, a, resolved)
      } catch (e) {
        if (e instanceof InvalidArgument) return { status: 'invalid', message: e.message }
        throw e
      }
      if (args.p_starts_at && args.p_ends_at && Date.parse(args.p_ends_at) < Date.parse(args.p_starts_at)) {
        return { status: 'invalid', message: 'The end is before the start. Ask him for the times again. Nothing was changed.' }
      }
      const out = await write(ctx, { tool: name, fn: tool.function, args }, writeOpts(a))
      if (name === 'approve_signout' && resolved.member) {
        out.signout = { member: resolved.member.name, note: resolved.member.note, cleanup_confirmed: resolved.member.cleanup_confirmed, asked_at: laClock(resolved.member.requested_at) }
      }
      if (out.status === 'refused' && isSchemaMissing({ code: out.code })) return notSetUp('That part of the app')
      return out
    }
    throw new UnknownTool(`Tool ${name} has no runner.`)
  } catch (e) {
    if (e instanceof NotRegistered) return { status: 'refused', message: e.message }
    throw e
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEMBER_ARGS = new Set(['p_member', 'p_student', 'p_parent', 'target_member'])
const EVENT_ARGS = new Set(['p_event'])

async function callApp(ctx, a) {
  const fname = String(a.name ?? '')
  const entry = liveFunction(fname)
  if (!entry || entry.connector_only) {
    const excluded = FUNCTIONS[fname]?.excluded
    return excluded
      ? { status: 'not_available', message: `The connector does not run ${fname}: ${excluded}. Tell him, and call report_gap if he needs it.` }
      : { status: 'not_found', message: `The app has no action named ${fname}. Call find_tool with his words; if nothing fits, call report_gap.` }
  }
  const args = { ...(a.args && typeof a.args === 'object' && !Array.isArray(a.args) ? a.args : {}) }
  // Bind scouting operations to the token account, never a user-supplied actor.
  if (fname === 'scouting_save') args.p_actor = ctx.session.user.id
  // A name where a member or event id goes is resolved the way the hand
  // entries resolve it; an unknown or ambiguous one writes nothing.
  for (const form of entry.forms) {
    for (const x of form.args) {
      const v = args[x.name]
      if (x.type !== 'uuid' || typeof v !== 'string' || UUID.test(v)) continue
      const kind = MEMBER_ARGS.has(x.name) ? 'member' : EVENT_ARGS.has(x.name) ? 'event' : null
      if (!kind) continue
      const r = await RESOLVERS[kind](ctx, v)
      if (r.status) return r
      args[x.name] = (r.member ?? r.event).id
    }
  }
  const fit = fitForm(entry, args)
  if (!fit.ok) {
    const forms = entry.forms.map((f) => f.args.map((x) => `${x.name}${x.optional ? '?' : ''}`).join(', '))
    return { status: 'invalid', message: `${fname} takes (${forms.join(') or (')}). Send exactly those names; ask him for anything missing. Nothing was changed.` }
  }
  return write(ctx, { tool: 'call_app', fn: fname, args }, writeOpts(a))
}

/** Every tool name the runner handles, for the coverage test. */
export const handledToolNames = () => Object.keys(TOOLS).filter((n) => TOOLS[n].kind !== 'read' || READS[n])
export const readRunners = READS
export { levelFor }
