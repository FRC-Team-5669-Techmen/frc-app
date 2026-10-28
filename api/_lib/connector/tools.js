/**
 * THE TOOLS: every MCP tool the connector lists comes from the registry
 * (registry.generated.js, compiled from tools/connector/registry/tools.yaml),
 * and every one runs here, as him. Reads go through his own session (`select`
 * and `rpc`, so RLS and every function gate decide); writes go through
 * engine.write, which goes through connector_call. Nothing here writes a table.
 */
import { TOOLS, FUNCTIONS, liveFunction, levelFor, fitForm } from './registry.js'
import { write, writeGroup, undoLast, NotRegistered } from './engine.js'
import { reasonLabel as absenceReasonLabel } from '../../../src/standing.js'
import { RESOLVERS, roster, resolveMember, resolveEvent, resolveBattery, resolveRobotMatch, displayName } from './resolve.js'
import { laDateKey, laMidnightMs, addDays, laClock, laDay, laWallToIso } from './dates.js'
import { isSchemaMissing } from './errors.js'
import { batteryBoard, chargeLabel, statusLabel, kindLabel, brownoutLabel, CHECK_THRESHOLDS, ROBOT_R, REST_V, fleetLine, verdictItems } from '../../../src/batteries.js'
import { leaderboard as driverLeaderboard, SCORE_RULES } from '../../../src/driverScore.js'
import { leaderboard as hpLeaderboard, HP_RULES, needsText as hpNeedsText } from '../../../src/humanPlayerScore.js'
import { AUTO_READY_STREAK, RATE_WINDOW, resultLabel, routineBoard } from '../../../src/autos.js'
import { boardView, roleLabel } from '../../../src/roleBoard.js'
import { roleRuleIssues } from '../../../src/roleRules.js'
import { KIND_LABELS, REAL_KINDS, shots, counted, wasted, filterMatches, driverTrends, batteryTrends, compareMatches, notReadyReasons, parseMatchFile, planImport, importLinks, listRobotFiles, rawFileUrl,
  readPower, fetchBatteryHistory, parseBatteryHistory, planLoadTests, loadTestRows } from '../../../src/robotMatches.js'
import { groupByTeam, tagLabel } from '../../../src/meetTeam.js'

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

/** One hub trip by part of its title; the next one not over when none is said. */
async function pickTrip(ctx, said) {
  const evs = await ctx.backend.rpc(ctx.session, 'hub_member_events', {})
  if (evs.error) return isSchemaMissing(evs.error) ? notSetUp('The trip hub') : { status: 'refused', message: evs.error.message }
  const trips = Array.isArray(evs.data) ? evs.data : []
  if (!trips.length) return { status: 'not_found', message: 'There are no trips in the hub.' }
  if (said) {
    const want = String(said).toLowerCase()
    const hits = trips.filter((t) => String(t.title).toLowerCase().includes(want))
    if (!hits.length) return { status: 'not_found', message: `No trip matches "${said}". The trips are: ${trips.map((t) => t.title).join(', ')}.` }
    if (hits.length > 1) return { status: 'ambiguous', message: `${hits.length} trips match: ${hits.map((t) => t.title).join(', ')}. Ask him which.` }
    return { trip: hits[0] }
  }
  return { trip: trips.find((t) => !t.over) ?? trips[trips.length - 1] }
}

// ── The trip carpool by name (ledger 0028d) ─────────────────────────────────

const words = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
const ALL_DAYS = /^(all|all days|every ?day|each day|the whole trip|whole trip)$/i

/** The trip's days he named: a date, a weekday (or its first three letters), or every day. */
function pickTripDays(days, said) {
  const s = String(said ?? '').trim().toLowerCase()
  if (!s || ALL_DAYS.test(s)) return { days, all: true }
  const hits = days.filter((d) => d.date === s || (s.length >= 3 && weekdayOf(d.date).toLowerCase().startsWith(s.replace(/s$/, ''))))
  if (!hits.length) return { status: 'not_found', message: `The trip has no day "${said}". Its days are ${days.map((d) => `${weekdayOf(d.date)} ${d.date}`).join(', ')}. Nothing was changed.` }
  return { days: hits, all: false }
}

/** The staff board of one trip (hub_member_board answers staff the staff board, invite ids included). */
async function staffBoard(ctx, trip) {
  const b = await ctx.backend.rpc(ctx.session, 'hub_member_board', { p_event: trip.id })
  if (b.error) return isSchemaMissing(b.error) ? notSetUp('The trip hub') : { status: 'refused', message: b.error.details || b.error.message }
  const board = b.data?.board ?? b.data
  if (board?.viewer && board.viewer !== 'staff') return { status: 'refused', message: 'Only staff see who rides in which car. Nothing was read.' }
  return { board }
}

// A car he names by its driver ("Pina", "the Garcia family", "Mr. Pina's car")
// or its description: every word he said, honorifics and filler dropped,
// starts a word of the driver or the description.
const CAR_FILLER = new Set(['the', 'car', 'cars', 'family', 's', 'mr', 'mrs', 'ms', 'coach', 'in', 'with', 'van', 'suv'])
function carFits(car, q) {
  const want = words(q).filter((w) => !CAR_FILLER.has(w))
  if (!want.length) return false
  const have = words(`${car.driver ?? ''} ${car.description ?? ''}`)
  return want.every((w) => have.some((h) => h.startsWith(w)))
}
const OUT_OF_CAR = /^(none|no car|nobody|no one|out|remove|unseat|take (him|her|them) out|out of (the|their|his|her) car)$/i
const RUN_WORD = { to: 'there', home: 'home' }

/**
 * place_in_car: one student, by name, into a car (by its driver), out of
 * their car, or from one car to another, on one day or every day, there,
 * home or both. Each (day, way) is one hub_staff_call move, the mentor
 * page's own Move control, so every carpool rule (seats, the one-minor rule,
 * a car that left, the 72-hour lock that only staff pass, the 12-hour
 * freeze nobody passes) decides as it does on the page. Answers {plans,
 * summary} or {out} when nothing should be asked.
 */
async function placeInCarPlan(ctx, a, resolved) {
  const picked = await pickTrip(ctx, a.trip)
  if (!picked.trip) return { out: picked }
  const trip = picked.trip
  const student = resolved.student
  const inv = await ctx.backend.select(ctx.session, { table: 'hub_invites', columns: ['id', 'student_id'], eq: { event_id: trip.id, student_id: student.id }, limit: 1 })
  if (inv.error) return { out: isSchemaMissing(inv.error) ? notSetUp('The trip hub') : { status: 'refused', message: inv.error.message } }
  if (!inv.data.length) return { out: { status: 'not_found', message: `${student.name} is not signed up for ${trip.title}. Nothing was changed.` } }
  const invite = inv.data[0].id
  const sb = await staffBoard(ctx, trip)
  if (!sb.board) return { out: sb }
  const days = (sb.board.days ?? []).map((d) => ({ ...d, date: String(d.date).slice(0, 10) }))
  const pickedDays = pickTripDays(days, a.day)
  if (!pickedDays.days) return { out: pickedDays }
  const runs = a.run === 'there' ? ['to'] : a.run === 'home' ? ['home'] : ['to', 'home']
  const ans = await ctx.backend.select(ctx.session, { table: 'hub_day_answers', columns: ['day_id', 'attending', 'to_mode', 'home_mode'], eq: { invite_id: invite }, limit: 50 })
  if (ans.error) return { out: { status: 'refused', message: ans.error.message } }
  const answerOf = (dayId) => ans.data.find((x) => x.day_id === dayId) ?? {}
  const removing = OUT_OF_CAR.test(String(a.car ?? '').trim())
  const single = !pickedDays.all && pickedDays.days.length === 1 && runs.length === 1
  const plans = []
  const summary = []
  const skipped = []
  const seen = new Set()
  let looked = 0
  for (const d of pickedDays.days) {
    const day = `${weekdayOf(d.date)} ${d.date}`
    const answer = answerOf(d.id)
    for (const run of runs) {
      const r = (d.runs ?? []).find((x) => x.run === run) ?? { cars: [] }
      const cars = r.cars ?? []
      const now = cars.find((c) => (c.riders ?? []).some((x) => x.invite_id === invite))
      const way = RUN_WORD[run]
      if (removing) {
        if (now) {
          plans.push({ fn: 'hub_staff_call', args: { p_action: 'move', p_args: { invite_id: invite, day_id: d.id, run, car_id: null } } })
          summary.push({ day, way, from: now.driver, to: 'no car (needs a seat again)' })
        } else skipped.push({ day, way, why: 'not in a car' })
        continue
      }
      if (answer.attending !== 'yes') {
        if (single) return { out: { status: 'refused', message: `${student.name} is not marked coming on ${day}. The family, or a mentor on the trip page, marks the day first. Nothing was changed.` } }
        skipped.push({ day, way, why: 'not marked coming that day' }); continue
      }
      if ((run === 'to' ? answer.to_mode : answer.home_mode) === 'driving') {
        if (single) return { out: { status: 'refused', message: `${student.name}'s family is driving ${way} on ${day}, so the student rides in the family car. Nothing was changed.` } }
        skipped.push({ day, way, why: 'the family is driving' }); continue
      }
      looked += 1
      const fits = cars.filter((c) => carFits(c, a.car))
      for (const c of fits) seen.add(c.driver)
      if (fits.length > 1) {
        return { out: { status: 'ambiguous', message: `${fits.length} cars on ${day} (${way}) match "${a.car}": ${fits.map((c) => `${c.driver} (${c.description ?? 'car'})`).join(', ')}. Ask him which. Nothing was changed.` } }
      }
      if (!fits.length) {
        if (single) return { out: { status: 'not_found', message: `No car on ${day} (${way}) matches "${a.car}". The cars are: ${cars.map((c) => c.driver).join(', ') || 'none yet'}. Nothing was changed.` } }
        skipped.push({ day, way, why: `no car from ${a.car} that way` }); continue
      }
      const car = fits[0]
      if (now && now.id === car.id) { skipped.push({ day, way, why: `already in ${car.driver}'s car` }); continue }
      const args = { invite_id: invite, day_id: d.id, run, car_id: car.id }
      if (a.override_reason && String(a.override_reason).trim()) args.override_reason = String(a.override_reason).trim()
      plans.push({ fn: 'hub_staff_call', args: { p_action: 'move', p_args: args } })
      summary.push({ day, way, from: now ? now.driver : 'no car', to: car.driver, seats_taken: `${car.riders_count ?? (car.riders ?? []).length} of ${car.seats}` })
    }
  }
  if (!removing && looked && !seen.size) {
    const drivers = [...new Set(pickedDays.days.flatMap((d) => (d.runs ?? []).filter((r) => runs.includes(r.run)).flatMap((r) => (r.cars ?? []).map((c) => c.driver))))]
    return { out: { status: 'not_found', message: `No car on those days matches "${a.car}". The drivers are: ${drivers.join(', ') || 'none yet'}. Nothing was changed.` } }
  }
  if (!plans.length) {
    return { out: { status: 'already', message: `Nothing to change for ${student.name}.`, skipped } }
  }
  return { plans, summary: { trip: trip.title, student: student.name, changes: summary, skipped } }
}

/** decide_absences: every request id must be one waiting for a decision, read as him; one that is not writes nothing. */
async function decideAbsencesPlan(ctx, a) {
  const ids = [...new Set((Array.isArray(a.requests) ? a.requests : String(a.requests ?? '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean))]
  if (!ids.length) return { out: { status: 'invalid', message: 'Name at least one request (absences_waiting lists their ids). Nothing was changed.' } }
  if (ids.length > 100) return { out: { status: 'invalid', message: 'At most 100 absence requests in one change. Nothing was changed.' } }
  const bad = ids.filter((x) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))
  if (bad.length) return { out: { status: 'not_found', message: `${bad.join(', ')} is not a request id. Use the ids absences_waiting lists. Nothing was changed.` } }
  const r = await ctx.backend.select(ctx.session, { table: 'absence_requests', columns: ['id', 'member_id', 'event_id', 'reason', 'status'], in: { id: ids }, limit: 200 })
  if (r.error) return { out: isSchemaMissing(r.error) ? notSetUp('Absence requests') : { status: 'refused', message: r.error.message } }
  const byId = new Map(r.data.map((x) => [x.id, x]))
  const missing = ids.filter((x) => !byId.has(x))
  if (missing.length) return { out: { status: 'not_found', message: `No absence request has the id ${missing.join(', ')}. Nothing was changed for anyone.` } }
  const decided = ids.filter((x) => byId.get(x).status !== 'pending')
  if (decided.length) return { out: { status: 'already', message: `${decided.length} of these were already decided or withdrawn (${decided.map((x) => `${x}: ${byId.get(x).status}`).join(', ')}). Nothing was changed for anyone; send only waiting ones.` } }
  const [list, evs] = await Promise.all([
    roster(ctx),
    ctx.backend.select(ctx.session, { table: 'events', columns: ['id', 'title', 'starts_at'], in: { id: [...new Set(r.data.map((x) => x.event_id))] }, limit: 200 }),
  ])
  const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
  const events = new Map((evs.data ?? []).map((e) => [e.id, e]))
  const note = a.note && String(a.note).trim() ? String(a.note).trim() : undefined
  const plans = ids.map((id) => ({ fn: 'decide_absence', args: { p_request: id, p_approve: a.approve === true, ...(note ? { p_note: note } : {}) } }))
  const lines = ids.map((id) => {
    const x = byId.get(id)
    const ev = events.get(x.event_id)
    return { request_id: id, who: names.get(x.member_id) ?? 'Member', event: ev?.title ?? 'Event', day: ev ? laDay(ev.starts_at) : null, reason: absenceReasonLabel(x.reason) }
  })
  return { plans, summary: { decision: a.approve === true ? 'approve' : 'deny', decision_note: note ?? null, requests: lines } }
}

const GROUPED = { place_in_car: placeInCarPlan, decide_absences: decideAbsencesPlan }

const round1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10)
const ROBOT_MATCH_COLUMNS = ['id', 'source', 'file_name', 'kind', 'started_at', 'match_label', 'event_id', 'alliance', 'station', 'auto_name', 'routine_id', 'auto_balls', 'open_balls',
  'closed_balls', 'passes', 'ready_pct', 'battery_start', 'battery_min', 'battery_end', 'brownouts', 'hang_at_seconds', 'distance_m', 'duration_s', 'driver_id', 'operator_id',
  'coach_id', 'human_player_id', 'battery_id', 'scorer_balls_in', 'tower', 'match_score', 'ranking_points', 'battery_run_id', 'drive_session_id']

/** The match list plus the names, labels and events it is read with. */
async function robotMatchContext(ctx) {
  if (ctx.cache.has('robot_matches')) return ctx.cache.get('robot_matches')
  const [m, b, r, e] = await Promise.all([
    ctx.backend.select(ctx.session, { table: 'robot_matches', columns: ROBOT_MATCH_COLUMNS, order: [['started_at', 'desc']], limit: 2000 }),
    ctx.backend.select(ctx.session, { table: 'batteries', columns: ['id', 'label', 'status'], limit: 500 }),
    ctx.backend.select(ctx.session, { table: 'auto_routines', columns: ['id', 'name', 'active'], limit: 500 }),
    ctx.backend.select(ctx.session, { table: 'events', columns: ['id', 'title', 'kind', 'starts_at', 'ends_at'], eq: { kind: 'competition' }, order: [['starts_at', 'desc']], limit: 60 }),
  ])
  if (m.error) return isSchemaMissing(m.error) ? notSetUp('The match log') : { status: 'refused', message: m.error.message }
  const list = await roster(ctx)
  const members = (list.members ?? []).filter((x) => (x.status ?? 'active') === 'active')
  const names = new Map((list.members ?? []).map((x) => [x.id, x.name]))
  const out = {
    matches: m.data, members, batteries: b.data ?? [], routines: r.data ?? [], events: e.data ?? [],
    nameOf: (id) => names.get(id) ?? 'Unknown', labelOf: (id) => (b.data ?? []).find((x) => x.id === id)?.label ?? 'Unknown',
    routineOf: (id) => (r.data ?? []).find((x) => x.id === id)?.name ?? null, eventOf: (id) => (e.data ?? []).find((x) => x.id === id)?.title ?? null,
  }
  ctx.cache.set('robot_matches', out)
  return out
}

function robotMatchLine(m, c) {
  return {
    label: m.match_label, kind: KIND_LABELS[m.kind] ?? m.kind, real_field: REAL_KINDS.includes(m.kind), at: laClock(m.started_at), event: m.event_id ? c.eventOf(m.event_id) : null,
    from: m.source === 'both' ? 'robot file and Match Sim' : m.source === 'sim_page' ? 'Match Sim only' : 'robot file',
    alliance: m.alliance, driver: m.driver_id ? c.nameOf(m.driver_id) : null, operator: m.operator_id ? c.nameOf(m.operator_id) : null, coach: m.coach_id ? c.nameOf(m.coach_id) : null,
    human_player: m.human_player_id ? c.nameOf(m.human_player_id) : null, battery: m.battery_id ? c.labelOf(m.battery_id) : null, auto: (m.routine_id && c.routineOf(m.routine_id)) || m.auto_name || null,
    shots: shots(m), shots_at_closed_hub: wasted(m), balls_in_counted: counted(m), passes: m.passes, auto_balls: m.auto_balls, ready_pct: m.ready_pct, hang_at_s: m.hang_at_seconds,
    battery_volts: { start: m.battery_start, min: m.battery_min, end: m.battery_end }, brownouts: m.brownouts, distance_m: m.distance_m, seconds: m.duration_s,
    tower: m.tower, score: m.match_score, rp: m.ranking_points,
  }
}

async function pickRobotMatch(ctx, q) {
  if (/^(last|latest|newest)( match)?$/i.test(String(q ?? '').trim())) {
    const c = await robotMatchContext(ctx)
    if (c.status) return c
    return c.matches[0] ? { match: c.matches[0] } : { status: 'not_found', message: 'No robot matches are logged yet.' }
  }
  return resolveRobotMatch(ctx, q)
}

/**
 * import_robot_matches_from_github: with no file, list the new files and what
 * each would link (writes nothing); with one, fetch it from the public robot
 * repo and send it to robot_match_import, which always asks first. A typed
 * crew name that is not one member must be named in the call, never guessed.
 */
async function robotImportPlan(ctx, a, resolved) {
  const c = await robotMatchContext(ctx)
  if (c.status) return { out: c }
  const fetchImpl = ctx.fetch ?? globalThis.fetch
  const existing = new Set(c.matches.map((m) => m.file_name).filter(Boolean))
  const planCtx = { members: c.members, batteries: c.batteries, routines: c.routines, events: c.events, simRows: c.matches.filter((m) => m.source === 'sim_page' && !m.file_name), existing }
  const describe = (p) => ({
    file: p.fileName, status: p.status, ...(p.error ? { problem: p.error } : {}),
    ...(p.cols ? { label: p.cols.match_label, kind: KIND_LABELS[p.cols.kind], at: laClock(p.cols.started_at), typed: p.cols.crew_typed } : {}),
    ...(p.crew ? { links: { driver: p.crew.driver.member?.name ?? null, operator: p.crew.operator.member?.name ?? null, coach: p.crew.coach.member?.name ?? null, battery: p.battery.battery?.label ?? null, auto: p.routine.routine?.name ?? null, event: p.event?.title ?? null, joins_match_sim: !!p.sim }, check: p.confirm } : {}),
  })
  // The pit load tests in battery-history.csv (0041): listed with the match
  // files; imported as one asks-first call with load_tests.
  const loadTests = async () => {
    const got = await fetchBatteryHistory(fetchImpl)
    if (got.error || got.missing) return { plans: [], note: got.error ?? 'The robot has not pushed a battery history yet.' }
    const parsed = parseBatteryHistory(got.text)
    if (parsed.error) return { plans: [], note: parsed.error }
    const runs = await ctx.backend.select(ctx.session, { table: 'battery_runs', columns: ['battery_id', 'kind', 'ran_at'], eq: { kind: 'bench_test' }, limit: 3000 })
    return { plans: planLoadTests(parsed.rows, { batteries: c.batteries, runs: runs.data ?? [], now: ctx.now() }) }
  }
  const describeLoad = (p) => ({ battery: p.battery?.label ?? p.typed ?? null, at: p.at ? laClock(p.at) : p.time, robot_resistance_mohm: p.resistance, status: p.status, ...(p.reason ? { reason: p.reason } : {}) })
  if (a.load_tests) {
    const lt = await loadTests()
    const fresh = lt.plans.filter((p) => p.status === 'new')
    if (!fresh.length) return { out: { status: 'already', message: `${lt.note ? `${lt.note} ` : ''}No new pit load tests to import. Nothing was changed.`, load_tests: lt.plans.map(describeLoad) } }
    return { fn: 'battery_import_load_tests', args: { p_rows: loadTestRows(lt.plans) }, summary: { load_tests: fresh.map(describeLoad), skipped: lt.plans.filter((p) => p.status === 'skip').map(describeLoad) } }
  }
  if (!a.file) {
    const lt = await loadTests()
    const ltOut = { load_tests: { new: lt.plans.filter((p) => p.status === 'new').map(describeLoad), already_imported: lt.plans.filter((p) => p.status === 'already').length,
      skipped: lt.plans.filter((p) => p.status === 'skip').map(describeLoad), ...(lt.note ? { note: lt.note } : {}) } }
    const list = await listRobotFiles(fetchImpl)
    if (list.error) return { out: { status: 'refused', message: list.error } }
    if (list.empty || !list.files.length) return { out: { status: 'ok', new_files: [], message: 'No match files have been pushed yet. The driver station laptop pushes them with Sync Match Data.', ...ltOut } }
    const fresh = list.files.filter((f) => !existing.has(f.name))
    const plans = await Promise.all(fresh.slice(0, 20).map(async (f) => {
      try { const r = await fetchImpl(f.url); return planImport(parseMatchFile(r.ok ? await r.text() : '', f.name), planCtx) } catch { return { fileName: f.name, status: 'error', error: 'Could not download this file.' } }
    }))
    return { out: { status: 'ok', files_on_github: list.files.length, already_imported: list.files.length - fresh.length, new_files: plans.map(describe), more: Math.max(0, fresh.length - 20), ...ltOut,
      next: 'To import one, call again with its file name. Where check lists a name that could be more than one member, ask him who it was and pass driver, operator or coach. To import the new pit load tests, call again with load_tests true (it asks first).' } }
  }
  let parsed
  try { const r = await fetchImpl(rawFileUrl(a.file)); parsed = parseMatchFile(r.ok ? await r.text() : (r.status === 404 ? null : ''), a.file); if (r.status === 404) parsed = { ok: false, fileName: a.file, error: 'There is no match file with that name on GitHub.' } } catch { parsed = { ok: false, fileName: a.file, error: 'GitHub could not be reached. Nothing was changed.' } }
  const plan = planImport(parsed, planCtx)
  if (plan.status === 'error') return { out: { status: 'invalid', message: `${plan.error} Nothing was changed.` } }
  if (plan.status === 'already') return { out: { status: 'already', message: `${a.file} is already in the match log. Nothing was changed.` } }
  const choice = {}
  for (const role of ['driver', 'operator', 'coach']) {
    if (resolved[role]) choice[role] = resolved[role].id
    else if (plan.crew[role].status === 'confirm') {
      return { out: { status: 'ambiguous', message: `The robot says the ${role} was "${plan.cols.crew_typed[role]}". That could be ${plan.crew[role].candidates.map((m) => m.name).join(' or ')}. Ask him who, then call again with ${role}. Nothing was changed.` } }
    }
  }
  if (resolved.battery) choice.battery = resolved.battery.id
  if (a.add_routine) choice.addRoutine = true
  return { plan, args: { p_file_name: plan.fileName, p_raw: plan.raw, p_links: importLinks(plan, choice) }, summary: describe(plan) }
}

const NOTE_COLUMN = { driver: 'notes_driver', operator: 'notes_operator', coach: 'notes_coach', human_player: 'notes_human_player', pit: 'notes_pit' }
function robotNoteFields(a) {
  const f = {}
  if (a.notes !== undefined) f[NOTE_COLUMN[a.role ?? 'pit']] = a.notes
  if (a.video !== undefined) f.video_url = a.video
  if (a.score !== undefined) f.match_score = a.score
  if (a.rp !== undefined) f.ranking_points = a.rp
  if (a.tower !== undefined) f.tower = a.tower
  if (a.fouls !== undefined) f.fouls = a.fouls
  if (a.balls_in !== undefined) f.scorer_balls_in = a.balls_in
  return f
}

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

  // ledger 0024: every member attendance in one read (team_attendance_summary, 0032).
  async team_attendance(ctx, a) {
    const DATE = /^\d{4}-\d{2}-\d{2}$/
    for (const k of ['since', 'no_checkin_since']) {
      if (a[k] !== undefined && !DATE.test(String(a[k]))) return { status: 'invalid', message: `${k} must be a date, YYYY-MM-DD. Nothing was read.` }
    }
    const since = a.since ?? a.no_checkin_since ?? null
    const r = await ctx.backend.rpc(ctx.session, 'team_attendance_summary', since ? { p_since: since } : {})
    if (r.error) return isSchemaMissing(r.error) ? notSetUp('The team attendance read') : { status: 'refused', message: r.error.message }
    const all = Array.isArray(r.data) ? r.data : []
    const status = a.status ?? 'active'
    const include = a.include ?? 'members'
    const num = (x) => (x == null ? null : Number(x))
    const rows = all
      .filter((m) => include === 'all' || (m.has_account && !m.is_parent_only))
      .filter((m) => status === 'all' || (m.status ?? 'active') === status)
      .filter((m) => !a.role || (m.roles ?? []).includes(a.role))
      .filter((m) => a.min_hours == null || num(m.hours_total) >= a.min_hours)
      .filter((m) => a.max_hours == null || num(m.hours_total) <= a.max_hours)
      .filter((m) => !a.no_checkin_since || !m.last_check_in || laDateKey(m.last_check_in) < a.no_checkin_since)
      .map((m) => ({
        name: m.member_id ? displayName(m) : (m.email ?? 'Approved email'),
        full_name: m.full_name ?? null,
        email: m.email ?? null,
        roles: m.roles ?? [],
        status: m.status ?? 'active',
        approved: m.approved,
        has_account: m.has_account,
        parent_only: m.is_parent_only,
        joined: m.created_at ? laDateKey(m.created_at) : null,
        hours: num(m.hours_total) ?? 0,
        ...(since ? { hours_since: num(m.hours_since) ?? 0, check_ins_since: m.check_ins_since ?? 0 } : {}),
        check_ins: m.check_ins ?? 0,
        first_check_in: m.first_check_in ? laDateKey(m.first_check_in) : null,
        last_check_in: m.last_check_in ? laDateKey(m.last_check_in) : null,
        logged_hours_verified: num(m.logged_hours_verified) ?? 0,
        applied_this_season: m.has_season_application === true,
        trip_invites: m.trip_invites ?? 0,
        trip_answers: m.trip_answers ?? 0,
        last_app_sign_in: m.last_sign_in ? laDateKey(m.last_sign_in) : null,
        id: m.member_id ?? null,
      }))
    const sort = a.sort ?? 'hours'
    const cmp = {
      hours: (x, y) => x.hours - y.hours || x.name.localeCompare(y.name),
      hours_desc: (x, y) => y.hours - x.hours || x.name.localeCompare(y.name),
      last_check_in: (x, y) => (x.last_check_in ?? '').localeCompare(y.last_check_in ?? '') || x.name.localeCompare(y.name),
      name: (x, y) => x.name.localeCompare(y.name),
    }[sort] ?? ((x, y) => x.hours - y.hours)
    rows.sort(cmp)
    const limit = Math.max(1, Math.min(Number(a.limit) || 300, 300))
    return {
      status: 'ok',
      count: rows.length,
      never_checked_in: rows.filter((m) => m.check_ins === 0).length,
      ...(since ? { since } : {}),
      filters: { status, include, role: a.role ?? null, min_hours: a.min_hours ?? null, max_hours: a.max_hours ?? null, no_checkin_since: a.no_checkin_since ?? null, sort },
      note: 'hours are signed-in shop hours (closed sessions, FLL time and voided or under-review sessions left out); logged_hours_verified is separate. Nothing was changed. To mark people inactive, use set_member_status, which asks first.',
      members: rows.slice(0, limit),
      truncated: rows.length > limit,
    }
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
      rule_issues: roleRuleIssues(r.data).filter((i) => days.some((d) => d.day === i.day)).map((i) => ({ day: i.day, rule: i.rule, severity: i.severity, member: i.name, slots: i.slots, roles: i.roles, text: i.text })),
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

  // Meet a team (0035, ledger 0026): the shared notes for one event, grouped
  // by team with the page's own model (src/meetTeam.js groupByTeam).
  async meet_team_notes(ctx, a) {
    const ev = await RESOLVERS.event(ctx, a.event)
    if (!ev.event) return ev
    const r = await ctx.backend.rpc(ctx.session, 'meet_team_event', { p_event: ev.event.id })
    if (r.error) return isSchemaMissing(r.error) ? notSetUp('Meet a team') : { status: 'refused', message: r.error.message }
    const groups = groupByTeam(r.data.connections ?? []).filter((g) => !a.team || g.team_number === Number(a.team))
    return {
      status: 'ok', event: { id: ev.event.id, title: r.data.event.title },
      teams_met: groups.length, notes: groups.reduce((n, g) => n + g.notes.length, 0),
      teams: groups.map((g) => ({
        team: g.team_number, name: g.team_name || null,
        notes: g.notes.map((c) => ({
          logged_by: c.logged_by, does_well: c.does_well,
          organized: [...(c.org_tags ?? []).map(tagLabel), c.org_note].filter(Boolean).join('; ') || null,
          offers: [...(c.resource_tags ?? []).map(tagLabel), c.resource_note].filter(Boolean).join('; ') || null,
          copy_this: c.copy_this, follow_up: c.follow_up ? (c.follow_up_note || 'yes') : null,
          contact: c.contact ? [c.contact.name, c.contact.role, c.contact.email, c.contact.discord, c.contact.social].filter(Boolean).join(', ') || null : null,
        })),
      })),
    }
  },

  async meet_team_progress(ctx, a) {
    const ev = await RESOLVERS.event(ctx, a.event)
    if (!ev.event) return ev
    const r = await ctx.backend.rpc(ctx.session, 'meet_team_progress', { p_event: ev.event.id })
    if (r.error) return isSchemaMissing(r.error) ? notSetUp('Meet a team') : { status: 'refused', message: r.error.message }
    const by = (s) => (r.data.people ?? []).filter((x) => x.state === s)
    const slot = (x) => (x.slots?.[0] ? `${x.slots[0].label}, ${laDay(x.slots[0].starts_at)} ${laClock(x.slots[0].starts_at)}` : null)
    return {
      status: 'ok', event: { id: ev.event.id, title: r.data.event.title },
      done: r.data.done, slotted_not_logged: r.data.slotted, no_slot: r.data.no_slot,
      not_logged_yet: by('slotted').map((x) => ({ name: x.name, slot: slot(x) })),
      without_slot: by('no_slot').map((x) => x.name),
      done_by: by('done').map((x) => ({ name: x.name, teams: x.teams })),
      how_to_fill: 'give_meet_team_slots puts everyone without a slot into the Meet a team boxes (asks first).',
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
    const picked = await pickTrip(ctx, a.trip)
    if (!picked.trip) return picked
    const trip = picked.trip
    const b = await ctx.backend.rpc(ctx.session, 'hub_member_board', { p_event: trip.id })
    if (b.error) return { status: 'refused', message: b.error.message }
    const board = b.data?.board ?? b.data
    if (a.full === true) return { status: 'ok', trip: { title: trip.title, starts_on: trip.starts_on, over: trip.over }, board, note: 'The whole board as staff see it.' }
    return { status: 'ok', trip: { title: trip.title, starts_on: trip.starts_on, over: trip.over }, ...summarizeBoard(board), note: 'A summary. Pass full: true for every field (pickups, phones, allergy detail).' }
  },

  // ledger 0024 Part 2: which families on a trip have not answered, and the
  // FIRST registration and school form ticks they gave (hub_invites and
  // hub_responses, staff read only by 0005).
  async trip_signups(ctx, a) {
    const picked = await pickTrip(ctx, a.trip)
    if (!picked.trip) return picked
    const trip = picked.trip
    const inv = await ctx.backend.select(ctx.session, { table: 'hub_invites', columns: ['id', 'student_id', 'emails'], eq: { event_id: trip.id }, limit: 1000 })
    if (inv.error) return isSchemaMissing(inv.error) ? notSetUp('The trip hub') : { status: 'refused', message: inv.error.message }
    const ids = inv.data.map((i) => i.id)
    const resp = ids.length
      ? await ctx.backend.select(ctx.session, { table: 'hub_responses', columns: ['invite_id', 'first_reg_done', 'school_form_done', 'parent_name'], in: { invite_id: ids }, limit: 1000 })
      : { data: [], error: null }
    if (resp.error) return { status: 'refused', message: resp.error.message }
    const list = await roster(ctx)
    const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
    const byInvite = new Map(resp.data.map((r) => [r.invite_id, r]))
    const rows = inv.data.map((i) => {
      const r = byInvite.get(i.id)
      return { student: names.get(i.student_id) ?? 'Member', answered: !!r, first_registration: r ? r.first_reg_done ?? null : null, school_form: r ? r.school_form_done ?? null : null, emails_on_file: (i.emails ?? []).length }
    }).sort((x, y) => Number(x.answered) - Number(y.answered) || x.student.localeCompare(y.student))
    return {
      status: 'ok', trip: { title: trip.title, starts_on: trip.starts_on, over: trip.over },
      invited: rows.length, answered: rows.filter((r) => r.answered).length,
      not_answered: rows.filter((r) => !r.answered).map((r) => r.student),
      first_registration_not_done: rows.filter((r) => r.answered && r.first_registration !== true).map((r) => r.student),
      families: rows,
      note: 'FIRST registration and the school form are what each family ticked on the trip form, not a check against FIRST. send_family_link resends a link (asks first).',
    }
  },

  // ledger 0028d: per trip day, every student coming by name, how each gets
  // there and home, and the times the trip has for them. The car comes from
  // the staff board (a seat, or needs a seat); the family car from the cars
  // the family listed; nothing re-derives the board's default-ride rule.
  async trip_day_roster(ctx, a) {
    const picked = await pickTrip(ctx, a.trip)
    if (!picked.trip) return picked
    const trip = picked.trip
    const sb = await staffBoard(ctx, trip)
    if (!sb.board) return sb
    const days = (sb.board.days ?? []).map((d) => ({ ...d, date: String(d.date).slice(0, 10) }))
    const want = a.day ? pickTripDays(days, a.day) : { days }
    if (!want.days) return { ...want, message: want.message.replace(' Nothing was changed.', '') }
    const [inv, cars, list] = await Promise.all([
      ctx.backend.select(ctx.session, { table: 'hub_invites', columns: ['id', 'student_id'], eq: { event_id: trip.id }, limit: 1000 }),
      ctx.backend.select(ctx.session, { table: 'hub_cars', columns: ['id', 'day_id', 'run', 'driver_invite_id', 'leave_by'], eq: { event_id: trip.id }, limit: 1000 }),
      roster(ctx),
    ])
    const err = inv.error ?? cars.error
    if (err) return isSchemaMissing(err) ? notSetUp('The trip hub') : { status: 'refused', message: err.message }
    const ids = inv.data.map((i) => i.id)
    const ans = ids.length
      ? await ctx.backend.select(ctx.session, { table: 'hub_day_answers', columns: ['invite_id', 'day_id', 'attending', 'to_mode', 'home_mode', 'home_option', 'pit_setup'], in: { invite_id: ids }, limit: 5000 })
      : { data: [], error: null }
    if (ans.error) return { status: 'refused', message: ans.error.message }
    const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
    const studentOf = new Map(inv.data.map((i) => [i.id, i.student_id]))
    const boardName = new Map()
    for (const d of days) for (const r of d.runs ?? []) {
      for (const c of r.cars ?? []) for (const x of c.riders ?? []) if (x.invite_id) boardName.set(x.invite_id, x.name)
      for (const x of r.unplaced ?? []) if (x?.invite_id) boardName.set(x.invite_id, x.name)
    }
    const nameOf = (invite) => names.get(studentOf.get(invite)) ?? boardName.get(invite) ?? 'Student'
    const ride = (d, run, answer) => {
      const r = (d.runs ?? []).find((x) => x.run === run) ?? {}
      const seat = (r.cars ?? []).find((c) => (c.riders ?? []).some((x) => x.invite_id === answer.invite_id))
      if (seat) return { how: 'team carpool', in_car: true, car: seat.driver, car_leaves: laClock(seat.leave_by) }
      const own = cars.data.find((c) => c.day_id === d.id && c.run === run && c.driver_invite_id === answer.invite_id)
      if (own) return { how: 'family car', in_car: true, car: (r.cars ?? []).find((c) => c.id === own.id)?.driver ?? 'their family', car_leaves: laClock(own.leave_by) }
      if ((r.unplaced ?? []).some((x) => x?.invite_id === answer.invite_id)) return { how: 'needs a seat', in_car: false, car: null, car_leaves: null }
      const mode = run === 'to' ? answer.to_mode : answer.home_mode
      return { how: mode === 'driving' ? 'family driving (car not listed yet)' : 'on their own', in_car: false, car: null, car_leaves: null }
    }
    const out = want.days.map((d) => {
      const today = ans.data.filter((x) => x.day_id === d.id)
      const choice = (key) => (Array.isArray(d.home_options) ? d.home_options.find((o) => o.key === key)?.label : null) ?? null
      const students = today.filter((x) => x.attending === 'yes').map((x) => {
        const there = ride(d, 'to', x)
        const home = ride(d, 'home', x)
        const homeChoice = choice(x.home_option)
        return {
          name: nameOf(x.invite_id),
          arrives: there.how === 'on their own' ? null : laClock(d.target_arrival_at),
          leaves: home.car_leaves ?? homeChoice ?? null,
          in_car_there: there.in_car, in_car_home: home.in_car,
          there, home,
          ...(homeChoice ? { home_choice: homeChoice } : {}),
          ...(d.ask_pit_setup ? { pit_setup: x.pit_setup === true } : {}),
        }
      }).sort((x, y) => x.name.localeCompare(y.name))
      return {
        day: `${weekdayOf(d.date)} ${d.date}`, title: d.title ?? null,
        times: { meet: laClock(d.meet_at), meet_place: d.meet_place ?? null, target_arrival: laClock(d.target_arrival_at), venue_opens: laClock(d.venue_opens_at), pits_close: laClock(d.pits_close_at), venue_closes: laClock(d.venue_closes_at) },
        coming: students.length,
        students,
        not_sure: today.filter((x) => x.attending === 'unsure').map((x) => nameOf(x.invite_id)).sort(),
        not_answered: inv.data.filter((i) => !today.some((x) => x.invite_id === i.id && x.attending)).length,
      }
    })
    return {
      status: 'ok', trip: { title: trip.title, starts_on: trip.starts_on, over: trip.over }, days: out,
      note: 'The trip form asks no arrival or leave time per student. arrives is the day\'s target arrival for anyone coming with the team or a family car (null on their own); leaves is their ride home\'s leave time, else the ride-home choice they picked. place_in_car seats someone (asks first).',
    }
  },

  // ledger 0028d: the absence requests waiting for a decision, oldest first,
  // read as him (staff see every member's), with the ids decide_absences takes.
  async absences_waiting(ctx, a) {
    let member = null
    if (a.member) {
      const m = await resolveMember(ctx, a.member)
      if (!m.member) return m
      member = m.member
    }
    const r = await ctx.backend.select(ctx.session, {
      table: 'absence_requests', columns: ['id', 'member_id', 'event_id', 'reason', 'emergency', 'note', 'requested_at'],
      eq: { status: 'pending', ...(member ? { member_id: member.id } : {}) }, order: [['requested_at', 'asc']], limit: 500,
    })
    if (r.error) return isSchemaMissing(r.error) ? notSetUp('Absence requests') : { status: 'refused', message: r.error.message }
    const evIds = [...new Set(r.data.map((x) => x.event_id))]
    const [evs, list] = await Promise.all([
      evIds.length ? ctx.backend.select(ctx.session, { table: 'events', columns: ['id', 'title', 'kind', 'starts_at'], in: { id: evIds }, limit: 500 }) : { data: [], error: null },
      roster(ctx),
    ])
    const events = new Map((evs.data ?? []).map((e) => [e.id, e]))
    const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
    const wantEvent = a.event ? words(a.event).join(' ') : null
    const rows = r.data.map((x) => {
      const ev = events.get(x.event_id)
      const started = ev && Date.parse(ev.starts_at) <= ctx.now()
      return {
        request_id: x.id, who: names.get(x.member_id) ?? 'Member',
        event: ev?.title ?? 'Event', event_day: ev ? laDateKey(ev.starts_at) : null, event_starts: ev ? `${laDay(ev.starts_at)} ${laClock(ev.starts_at)}` : null,
        reason: absenceReasonLabel(x.reason), emergency: x.emergency === true, note: x.note ?? null,
        filed: `${laDay(x.requested_at)} ${laClock(x.requested_at)}`,
        ...(started && Date.parse(x.requested_at) <= Date.parse(ev.starts_at) ? { counts_as_approved: true } : {}),
      }
    }).filter((x) => !wantEvent || words(x.event).join(' ').includes(wantEvent) || x.event_day === String(a.event).trim())
    return {
      status: 'ok', waiting: rows.length, requests: rows,
      note: 'counts_as_approved: still unanswered when its event started, so the handbook already counts it approved; it can be approved, not denied. decide_absences approves or denies several at once (asks first, once).',
    }
  },

  // ledger 0024 Part 2: auto routine streaks, ranked with the page rule (src/autos.js).
  async auto_routines(ctx, a) {
    const [rt, rn] = await Promise.all([
      ctx.backend.select(ctx.session, { table: 'auto_routines', columns: ['*'], limit: 500 }),
      ctx.backend.select(ctx.session, { table: 'auto_runs', columns: ['*'], order: [['ran_at', 'desc']], limit: 2000 }),
    ])
    const err = rt.error ?? rn.error
    if (err) return isSchemaMissing(err) ? notSetUp('The auto routine log') : { status: 'refused', message: err.message }
    let board = routineBoard(rt.data, rn.data)
    if (a.show !== 'all') board = board.filter((r) => r.active !== false)
    if (a.show === 'ready') board = board.filter((r) => r.ready)
    return {
      status: 'ok', ready_at: AUTO_READY_STREAK, rate_over_last: RATE_WINDOW,
      routines: board.map((r) => ({
        name: r.name, ready: r.ready, streak: r.streak, best_streak: r.best, runs: r.runCount,
        success_rate: r.rate == null ? null : Math.round(r.rate * 100), rate_of_runs: r.rateN, retired: r.active === false,
        last: r.last ? { result: resultLabel(r.last.result), when: laDay(r.last.ran_at), problem: short(r.last.problem) ?? null } : null,
      })),
    }
  },

  // ledger 0024 Part 2: an announcement checked by the Discord function as a
  // dry run (action preview). It never sends; sending stays on /announce.
  async preview_announcement(ctx, a) {
    if (!ctx.backend.announcePreview) return { status: 'not_available', message: 'Announcement preview is unavailable in this environment.' }
    const roleNames = Array.isArray(a.roles) ? a.roles : a.roles ? String(a.roles).split(/\s*,\s*/) : []
    let roleIds = []
    if (roleNames.length) {
      const r = await ctx.backend.select(ctx.session, { table: 'discord_announce_roles', columns: ['name', 'role_id', 'active'], limit: 200 })
      if (r.error) return isSchemaMissing(r.error) ? notSetUp('Discord announcements') : { status: 'refused', message: r.error.message }
      const missing = []
      for (const n of roleNames) {
        const hit = r.data.find((x) => String(x.name).toLowerCase() === String(n).toLowerCase().replace(/^@/, ''))
        if (hit) roleIds.push(hit.role_id); else missing.push(n)
      }
      if (missing.length) return { status: 'not_found', message: `No announcement role named ${missing.join(', ')}. The roles are: ${r.data.filter((x) => x.active !== false).map((x) => x.name).join(', ')}. Nothing was posted.` }
    }
    const draft = { channel: a.channel, content: a.message ?? '', roleIds }
    const out = await ctx.backend.announcePreview(ctx.session, draft)
    if (out.error) return { status: 'unavailable', message: 'The Discord function did not answer the preview. Nothing was posted.' }
    return { status: 'ok', preview: out.data, posted: false, note: 'A dry run: nothing was posted. Posting to Discord is done on the Announce page (/announce), where he confirms it himself.' }
  },

  // ledger 0024 Part 2: an event's roster as staff see it (0016): roles by
  // member, whether it is posted, and the conflicts members declared.
  async event_roster(ctx, a) {
    const resolved = await RESOLVERS.event(ctx, a.event)
    if (!resolved.event) return resolved
    const ev = resolved.event
    const [roles, posted, conflicts, list] = await Promise.all([
      ctx.backend.select(ctx.session, { table: 'event_roles', columns: ['member_id', 'role', 'reason'], eq: { event_id: ev.id }, limit: 500 }),
      ctx.backend.select(ctx.session, { table: 'event_rosters', columns: ['posted_at', 'note'], eq: { event_id: ev.id }, limit: 1 }),
      ctx.backend.select(ctx.session, { table: 'member_conflicts', columns: ['member_id', 'note', 'withdrawn_at'], eq: { event_id: ev.id }, limit: 500 }),
      roster(ctx),
    ])
    if (roles.error) return isSchemaMissing(roles.error) ? notSetUp('Event rosters') : { status: 'refused', message: roles.error.message }
    const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
    const byMember = new Map()
    for (const r of roles.data) {
      if (!byMember.has(r.member_id)) byMember.set(r.member_id, [])
      byMember.get(r.member_id).push(r.role.replace(/_/g, ' '))
    }
    const people = [...byMember].map(([id, rs]) => ({ name: names.get(id) ?? 'Member', roles: rs.sort() })).sort((x, y) => x.name.localeCompare(y.name))
    const post = posted.error ? null : posted.data[0] ?? null
    return {
      status: 'ok', event: { title: ev.title, starts: laDay(ev.starts_at) },
      posted: !!post, posted_on: post ? laDay(post.posted_at) : null, note: post?.note ?? null,
      on_roster: people.length, people,
      conflicts: conflicts.error ? [] : conflicts.data.filter((c) => !c.withdrawn_at).map((c) => ({ name: names.get(c.member_id) ?? 'Member', note: short(c.note) })),
    }
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
    const fleet = fleetLine(board)
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
      thresholds: { brownout_in_last_runs: CHECK_THRESHOLDS.BROWNOUT_LOOKBACK, min_resting_volts: CHECK_THRESHOLDS.MIN_RESTING_VOLTS, max_resistance_mohm: CHECK_THRESHOLDS.MAX_RESISTANCE_MOHM,
        robot_resistance_mohm: { ok_under: ROBOT_R.OK_UNDER, pull_over: ROBOT_R.PULL_OVER, or_over_fleet_median_plus: ROBOT_R.FLEET_MARGIN, stands_out_at_fleet_median_times: ROBOT_R.FLEET_RATIO, robot_wiring_when_fleet_median_over: ROBOT_R.WIRING_MEDIAN },
        rested_volts: { ok_from: REST_V.OK, pull_under: REST_V.PULL_UNDER }, note: 'Proposed defaults.' },
      fleet: { median_robot_resistance_mohm: fleet.median, batteries_with_readings: fleet.readings, diagnosis: fleet.diagnosis, stands_out: fleet.standOut.map((x) => ({ battery: x.label, robot_resistance_mohm: x.robotR })), says: fleet.says },
      batteries: board.map((x) => ({
        label: x.label, status: statusLabel(x.status), charge: chargeLabel(x.charge_state), check: x.check, reasons: x.reasons, match_ready: x.matchReady,
        resting_volts: x.restingVolts, resting_level: x.restLevel, resistance_mohm: x.resistance, robot_resistance_mohm: x.robotR, robot_resistance_level: x.robotLevel, stands_out: x.standsOut,
        robot_resistance_trend: x.robotTrend, lowest_volts: x.minVolts, latest_verdict: x.verdict, latest_verdict_items: verdictItems(x.verdict).map((v) => v.label ?? v.text), latest_verdict_on: x.verdictAt ? laClock(x.verdictAt) : null,
        brownouts: x.brownouts, runs: x.runCount, last_used: x.lastUsed ? laClock(x.lastUsed) : null,
        recent: x.runs.slice(0, runsShown).map((run) => ({ kind: kindLabel(run.kind), match: run.match_label, on: laClock(run.ran_at), volts_before: run.voltage_before, volts_after: run.voltage_after, resistance_mohm: run.resistance_mohm,
          robot_resistance_mohm: run.robot_resistance_mohm ?? null, lowest_volts: run.min_volts ?? null, verdict: run.verdict ?? null, brownout: brownoutLabel(run.brownout) })),
      })),
      note: 'Blank voltage or resistance means not measured, never zero. resistance_mohm is a Battery Beak reading on the battery alone; robot_resistance_mohm is the robot\'s own reading of battery plus main wiring (5 to 10 higher), with its own thresholds. One battery high while the others read normal = that battery; most high = the robot wiring.',
    }
  },

  // The robot match log (0038), read with the app's own rules (src/robotMatches.js).
  async list_robot_matches(ctx, a) {
    const ctxm = await robotMatchContext(ctx)
    if (ctxm.status) return ctxm
    const f = { kind: a.kind, from: a.from, to: a.to }
    if (a.event) { const ev = await resolveEvent(ctx, a.event); if (ev.status) return ev; f.event = ev.event.id }
    if (a.driver) { const m = await resolveMember(ctx, a.driver); if (m.status) return m; f.driver = m.member.id }
    if (a.battery) { const b = await resolveBattery(ctx, a.battery); if (b.status) return b; f.battery = b.battery.id }
    const shown = filterMatches(ctxm.matches, f)
    const limit = Math.max(1, Math.min(200, Number(a.limit) || 25))
    return {
      status: 'ok', count: shown.length, listed: Math.min(limit, shown.length),
      matches: shown.slice(0, limit).map((m) => robotMatchLine(m, ctxm)),
      ...(a.trends ? {
        drivers: driverTrends(shown, ctxm.nameOf).map((d) => ({ driver: d.name, matches: d.matches, avg_shots: round1(d.avg.shots), avg_shots_at_closed_hub: round1(d.avg.wasted), avg_balls_in_counted: round1(d.avg.counted), avg_ready_pct: round1(d.avg.ready), avg_hang_s: round1(d.avg.hang), shots_by_match: d.points.map((p) => p.shots) })),
        batteries: batteryTrends(shown, ctxm.labelOf).map((b) => ({ battery: b.label, matches: b.runs, lowest_volts: b.lowest, avg_min_volts: round1(b.avgMin), brownouts: b.brownouts, min_volts_by_match: b.points.map((p) => p.min) })),
      } : {}),
      note: 'shots is the robot\'s own count of balls fired at an active HUB (auto plus open); it cannot see makes. balls_in_counted is set only where someone counted from video. A blank number means not recorded, never zero.',
    }
  },

  async get_robot_match(ctx, a) {
    const r = await pickRobotMatch(ctx, a.match)
    if (r.status) return r
    const one = await ctx.backend.select(ctx.session, { table: 'robot_matches', columns: ['*'], eq: { id: r.match.id }, limit: 1 })
    if (one.error) return { status: 'refused', message: one.error.message }
    const m = one.data[0]
    const ctxm = await robotMatchContext(ctx)
    if (ctxm.status) return ctxm
    return {
      status: 'ok', match: robotMatchLine(m, ctxm),
      people: { tower: m.tower, fouls: m.fouls, score: m.match_score, rp: m.ranking_points, score_from: m.official_source, video: m.video_url, wpilog: m.wpilog_file,
        notes: { driver: m.notes_driver, operator: m.notes_operator, coach: m.notes_coach, human_player: m.notes_human_player, pit: m.notes_pit },
        crew_typed_on_robot: m.crew_typed, battery_run_logged: !!m.battery_run_id, drive_time_logged: !!m.drive_session_id },
      not_ready_seconds: notReadyReasons(m.raw),
      power: (() => {
        const p = readPower(m.power ?? m.raw?.power ?? null)
        return p ? { ...p, verdict_items: verdictItems(p.verdict).map((v) => ({ tag: v.label, text: v.text })), note: 'resistance is battery plus main wiring (robot-measured), not a Battery Beak reading. Times are seconds; matchTime is the match clock.' } : null
      })(),
      robot_file: m.raw, file_name: m.file_name, schema_version: m.schema_version,
      note: m.raw ? 'robot_file is the whole file the robot wrote, every field kept.' : 'This match was logged on the Match Sim page only; the robot file has not been imported.',
    }
  },

  async compare_robot_matches(ctx, a) {
    const ctxm = await robotMatchContext(ctx)
    if (ctxm.status) return ctxm
    const want = String(a.matches ?? '').trim()
    let picked = []
    const lastN = /^last\s*(\d+)?$/i.exec(want)
    if (lastN) picked = ctxm.matches.slice(0, Math.max(2, Math.min(6, Number(lastN[1]) || 2)))
    else {
      for (const q of want.split(/\s*(?:,|;|\band\b|\bvs\.?\b)\s*/i).filter(Boolean)) {
        const r = await resolveRobotMatch(ctx, q)
        if (r.status) return r
        picked.push(ctxm.matches.find((m) => m.id === r.match.id))
      }
    }
    picked = picked.filter(Boolean)
    if (picked.length < 2) return { status: 'invalid', message: 'Name two or more matches to compare, such as qm12, qm18.' }
    return {
      status: 'ok', matches: picked.map((m) => ({ label: m.match_label, at: laClock(m.started_at), driver: m.driver_id ? ctxm.nameOf(m.driver_id) : null, battery: m.battery_id ? ctxm.labelOf(m.battery_id) : null })),
      rows: compareMatches(picked).map((row) => ({ metric: row.label, values: row.values, best: row.best })),
      note: 'best is marked only where higher or lower is better and the matches differ. null means not recorded.',
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

  // The human player leaderboard (0033), scored with the app's own rule (src/humanPlayerScore.js).
  async list_human_players(ctx, a) {
    const [at, se] = await Promise.all([
      ctx.backend.select(ctx.session, { table: 'hp_attempts', columns: ['member_id', 'attempt_date', 'drill', 'made', 'attempted', 'made_inactive', 'seconds', 'voided_at', 'created_at'], limit: 5000 }),
      ctx.backend.select(ctx.session, { table: 'seasons', columns: ['id', 'name', 'start_date', 'end_date'], order: [['start_date', 'desc']], limit: 20 }),
    ])
    if (at.error) return isSchemaMissing(at.error) ? notSetUp('The human player leaderboard') : { status: 'refused', message: at.error.message }
    const today = laDateKey(ctx.now())
    const season = a.season === 'all' ? null : (se.data ?? []).find((s) => s.start_date <= today && (s.end_date == null || s.end_date >= today)) ?? null
    const list = await roster(ctx)
    const names = new Map((list.members ?? []).map((m) => [m.id, m.name]))
    const board = hpLeaderboard(at.data ?? [], season, (id) => names.get(id) ?? '')
    const limit = Math.max(1, Math.min(50, Number(a.limit) || 10))
    const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100)
    return {
      status: 'ok', season: season ? season.name : 'All time', ranked: board.ranked.length,
      players: board.ranked.slice(0, limit).map((r) => ({ rank: r.rank, name: r.name, human_player_score: r.score, match_fuel_active: r2(r.drills.match.value), rate_fuel_per_second: r2(r.drills.rate.value), accuracy_percent: r.drills.accuracy.value == null ? null : Math.round(r.drills.accuracy.value * 100) })),
      not_ranked_yet: board.unranked.map((r) => ({ name: r.name, needs: hpNeedsText(r.needs) })),
      formula: `Per drill, the mean of the best ${HP_RULES.BEST} of the last ${HP_RULES.RECENT} attempts (accuracy = made/shots, rate = made/second, match run = FUEL made while the HUB was active), divided by the team best; ranked after ${HP_RULES.MIN_ATTEMPTS} attempts of every drill; Human Player Score = 100 x (${HP_RULES.MATCH_WEIGHT} x match + ${HP_RULES.RATE_WEIGHT} x rate + ${HP_RULES.ACCURACY_WEIGHT} x accuracy).`,
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
      if (name === 'sign_in_out') a = { category: 'build', reason: 'Signed in or out by staff through Claude', ...a, at: a.at ?? new Date(ctx.now()).toISOString() }
      const resolved = {}
      for (const [argName, spec] of Object.entries(tool.args ?? {})) {
        if (spec.resolve && a[argName] !== undefined) {
          const r = await RESOLVERS[spec.resolve](ctx, a[argName])
          if (r.status) return r
          resolved[argName] = r.member ?? r.members ?? r.event ?? r.battery ?? r.routine ?? r.match
        }
      }
      let args
      try {
        args = mapArgs(tool, a, resolved)
      } catch (e) {
        if (e instanceof InvalidArgument) return { status: 'invalid', message: e.message }
        throw e
      }
      if (name === 'sign_in_out') {
        const pre = await signInOutCheck(ctx, resolved.member, a.direction)
        if (pre) return pre
      }
      // Several asks-first changes asked as one question (engine writeGroup).
      if (GROUPED[name]) {
        const g = await GROUPED[name](ctx, a, resolved)
        if (g.out) return g.out
        const out = await writeGroup(ctx, name, g.plans, writeOpts(a))
        return { ...out, ...g.summary }
      }
      let robotSummary = null
      let fn = tool.function
      if (name === 'import_robot_matches_from_github') {
        const r = await robotImportPlan(ctx, a, resolved)
        if (r.out) return r.out
        args = r.args
        robotSummary = r.summary
        if (r.fn) fn = r.fn
      }
      if (name === 'set_robot_match_notes') {
        args = { p_id: resolved.match.id, p_fields: robotNoteFields(a) }
        if (!Object.keys(args.p_fields).length) return { status: 'invalid', message: 'Say what to add: a note, a video link, the score, RP, TOWER, fouls or the ball count. Nothing was changed.' }
      }
      if (args.p_starts_at && args.p_ends_at && Date.parse(args.p_ends_at) < Date.parse(args.p_starts_at)) {
        return { status: 'invalid', message: 'The end is before the start. Ask him for the times again. Nothing was changed.' }
      }
      const out = await write(ctx, { tool: name, fn, args }, writeOpts(a))
      if (robotSummary) out.file = robotSummary
      if (name === 'approve_signout' && resolved.member) {
        out.signout = { member: resolved.member.name, note: resolved.member.note, cleanup_confirmed: resolved.member.cleanup_confirmed, asked_at: laClock(resolved.member.requested_at) }
      }
      if (name === 'set_member_status' && resolved.members) {
        out.members = resolved.members.list.map((m) => ({ name: m.name, email: m.email, status_now: m.status ?? 'active' }))
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

/**
 * Before a staff sign-in or sign-out (ledger 0024): refuse what would make a
 * double IN (an orphan the hours never count) or an OUT with nothing open,
 * and send a waiting sign-out request to approve_signout, the way the quick
 * pulse control does. Answers null when the change may go ahead.
 */
async function signInOutCheck(ctx, member, direction) {
  const last = await ctx.backend.select(ctx.session, { table: 'attendance_events', columns: ['type', 'event_time'], eq: { user_id: member.id }, order: [['event_time', 'desc']], limit: 1 })
  if (last.error) return { status: 'refused', message: last.error.message }
  const ev = last.data[0]
  const open = ev?.type === 'in' && ctx.now() - Date.parse(ev.event_time) < 12 * 3600_000
  if (direction === 'in' && open) return { status: 'already', message: `${member.name} is already signed in (since ${laClock(ev.event_time)}). Nothing was changed.` }
  if (direction === 'out' && !open) return { status: 'already', message: `${member.name} is not signed in. Nothing was changed.` }
  if (direction === 'out') {
    const pend = await ctx.backend.select(ctx.session, { table: 'signout_requests', columns: ['id'], eq: { member_id: member.id, status: 'pending' }, limit: 1 })
    if (!pend.error && pend.data.length) return { status: 'use_approve_signout', message: `${member.name} has a sign-out request waiting. Use approve_signout for them instead. Nothing was changed.` }
  }
  return null
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
