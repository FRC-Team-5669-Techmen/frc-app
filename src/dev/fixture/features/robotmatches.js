// Fixture: the robot match log (supabase/migrations/0038_robot_match_log.sql,
// ledger 0028). Contract: src/dev/fixture/README.md. Plain data, no side
// effects. A test-only PORT of the 0038 functions so /robot/matches can be
// driven in a browser; the rule is the SQL, proven by
// 0038_robot_match_log_rls_test.sql and tools/sql-harness/mutants-0038.mjs.
//
// It reads the robot file with src/robotMatches.js (pure), and writes the
// battery run through the battery log's own port, so the two never disagree.
// sim_save_match is wrapped while 0038 is applied: the SQL's trigger keeps a
// robot_matches row in step with every Match Sim save, and so does this.

import { parseMatchFile, eventFor, REAL_KINDS, SIM_MERGE_SECONDS } from '../../../robotMatches.js'
import batteries from './batteries.js'
import partd from './partd.js'

const rows = (db, t) => (Array.isArray(db[t]) ? db[t] : (db[t] = []))
const ms = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now())
const iso = (now) => new Date(ms(now)).toISOString()
const refuse = (message, code) => ({ data: null, error: { code, message, details: null, hint: null } })
const MID = (n) => `38000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const BID = (n) => `26000000-0000-4000-8000-${String(n).padStart(12, '0')}` // features/batteries.js
const AID = (n) => `28100000-0000-4000-8000-${String(n).padStart(12, '0')}` // features/partd.js
const laWall = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' }).replace(' ', 'T')
const eligible = ({ user, persona, db }) => !!user?.id && !persona?.isParent
  && rows(db, 'profiles').some((p) => p.id === user.id && p.approved && (p.status ?? 'active') === 'active')
  && (persona?.isStaff || (persona?.roles ?? []).includes('student'))
const writer = (ctx) => eligible(ctx) && (!!ctx.persona?.isStaff
  || rows(ctx.db, 'member_permissions').some((r) => r.member_id === ctx.user.id && r.capability === 'robot.matches'))
const targetOk = (db, id) => rows(db, 'profiles').some((p) => p.id === id && p.approved && (p.status ?? 'active') === 'active')
  && rows(db, 'member_roles').some((r) => r.member_id === id && ['student', 'mentor', 'lead', 'admin'].includes(r.role))
const COLS = ['kind', 'started_at', 'fms', 'event_code', 'fms_match_type', 'alliance', 'auto_name', 'auto_winner', 'auto_winner_random', 'crew_typed',
  'schema_version', 'robot_match', 'fms_match_number', 'station', 'auto_balls', 'open_balls', 'closed_balls', 'passes', 'balls_total', 'ready_pct',
  'battery_start', 'battery_min', 'battery_end', 'brownouts', 'hang_at_seconds', 'distance_m', 'duration_s', 'match_label']
const EMPTY = { sim_match_id: null, event_id: null, routine_id: null, driver_id: null, operator_id: null, coach_id: null, human_player_id: null, battery_id: null,
  scorer_balls_in: null, tower: null, fouls: null, match_score: null, ranking_points: null, official_source: null, notes_driver: null, notes_operator: null,
  notes_coach: null, notes_human_player: null, notes_pit: null, video_url: null, wpilog_file: null, battery_run_id: null, drive_session_id: null, auto_run_id: null }

/** A robot file shaped like MatchTelemetry.java schema 1, with the numbers given. */
export function robotFile(o) {
  const phase = (p, s, shots, min, avg) => ({ phase: p, seconds: s, shots, batteryMin: min, batteryAvg: avg })
  return {
    schema: 1, kind: o.kind ?? 'practice', robotMatch: o.robotMatch ?? 1, startedAt: o.startedAt, fms: !!o.fms, event: o.event ?? '',
    fmsMatchType: o.fmsMatchType ?? 'None', fmsMatchNumber: o.fmsMatchNumber ?? 0, fmsReplay: 0, alliance: o.alliance ?? 'red', station: o.station ?? 1,
    autoName: o.autoName ?? '', driver: o.driver ?? '', operator: o.operator ?? '', coach: o.coach ?? '', batteryLabel: o.battery ?? '',
    durationSeconds: o.duration ?? 160, autoWinner: o.autoWinner ?? null, autoWinnerRandom: false, batteryEndAtRest: o.end ?? 12.4, logDir: '/U/logs',
    scoring: { autoBalls: o.auto ?? 0, ballsHubOpen: o.open ?? 0, ballsHubClosed: o.closed ?? 0, passes: o.passes ?? 0, ballsTotal: (o.auto ?? 0) + (o.open ?? 0) + (o.closed ?? 0),
      rtHeldSeconds: 40, readyWhileRtHeldPct: o.ready ?? 0, firingSeconds: 22, ballsPerFiringSecond: 0.9, launchRpmErrorMean: 41,
      notReadySecondsByReason: o.reasons ?? { 'flywheel spinning up': 4.2, 'turret not on hub tag': 2.1, '-': 0 } },
    battery: { start: o.start ?? 12.9, end: o.end ?? 12.1, min: o.min ?? 11.2, minWhere: 'TELEOP 1:12', avg: 12.2, secondsBelow10V: o.below10 ?? 0, secondsBelow8V: 0, brownouts: o.brownouts ?? 0, powerSagSeconds: 0.4 },
    drive: { distanceMeters: o.distance ?? 210, topSpeedMps: 4.4, driveSupplyAmpsAvg: 38, driveSupplyAmpsPeak: 160, defenseSeconds: o.defense ?? 0, vacuumSeconds: 30, dumpSeconds: 8 },
    aim: { aimOnPct: 91, positionKnownPct: 88, longestSecondsWithoutVisionFix: 3.2 },
    climb: { liftAtSeconds: o.hang ? o.hang - 3 : null, hangAtSeconds: o.hang ?? null, hangingAtEnd: !!o.hang },
    can: { busOffEvents: 0, utilizationMaxPct: 61 },
    phases: [phase('AUTO', 20, o.auto ?? 0, o.start ?? 12.9, 12.6), phase('TRANSITION', 10, 0, 12.3, 12.4), phase('SHIFT 1', 25, 4, 11.9, 12.1),
      phase('SHIFT 2', 25, 5, o.min ?? 11.2, 11.8), phase('SHIFT 3', 25, 4, 11.6, 11.9), phase('SHIFT 4', 25, 3, 11.5, 11.8), phase('END GAME', 30, 2, 11.4, 11.7)],
    events: [{ t: 0, clock: '0:20', phase: 'AUTO', text: 'Match start' }, { t: 21, clock: '2:20', phase: 'TRANSITION', text: 'Auto ended' },
      ...(o.brownouts ? [{ t: 88, clock: '1:12', phase: 'SHIFT 2', text: 'Brownout' }] : []), { t: 160, clock: '0:00', phase: 'END GAME', text: 'Match end' }],
    ...(o.extra ?? {}),
  }
}

// One row from a parsed file, as 0038's _rm_extract fills it.
function fromFile(fileName, raw, base = {}) {
  const p = parseMatchFile(raw, fileName)
  const cols = Object.fromEntries(COLS.map((c) => [c, p.cols[c] ?? null]))
  return { ...EMPTY, ...base, ...cols, crew_typed: p.cols.crew_typed ?? {}, file_name: fileName, raw, match_label: p.cols.match_label }
}

export default {
  migration: '0038',
  creates: {
    tables: ['robot_matches'],
    rpcs: ['robot_match_import', 'robot_match_update', 'robot_match_fill_official', 'sim_save_match'],
  },
  // Three practice files from this week (Riley twice on B01/B02, Sam once on
  // B01), one auto test, and one Match Sim save from 20 minutes ago with no
  // file yet, so an import of the matching file merges into it.
  seed: ({ ids, now }) => {
    const t = ms(now)
    const at = (h) => t - h * 3600e3
    const stamp = (h) => iso(at(h))
    const file = (n, h, o) => {
      const startedAt = laWall(at(h))
      const name = `${startedAt.slice(0, 10).replace(/-/g, '')}-${startedAt.slice(11, 19).replace(/:/g, '')}_${o.kind ?? 'practice'}_${n}.json`
      return { name, raw: robotFile({ ...o, startedAt, robotMatch: n }) }
    }
    const f1 = file(1, 50, { driver: 'Riley', operator: 'Sam Student', battery: 'B01', autoName: 'Two-piece left', auto: 2, open: 18, closed: 3, passes: 4, ready: 78, start: 12.95, min: 10.9, end: 12.0, hang: 12.4, distance: 240, extra: { futureField: { kept: true } } })
    const f2 = file(2, 26, { driver: 'Riley', battery: 'B02', autoName: 'Two-piece left', auto: 3, open: 22, closed: 1, passes: 6, ready: 84, start: 12.8, min: 10.2, end: 11.4, brownouts: 1, hang: 9.8, distance: 262 })
    const f3 = file(3, 24, { driver: 'Sam', battery: 'B 1', autoName: 'Center climb', auto: 1, open: 11, closed: 6, passes: 1, ready: 61, start: 12.7, min: 11.1, end: 12.1, distance: 190 })
    const f4 = file(4, 3, { kind: 'auto_test', autoName: 'Two-piece left', auto: 2, duration: 20, start: 12.9, min: 12.4, end: 12.6, distance: 14 })
    const by = { created_by: ids.mentor, updated_by: ids.mentor }
    const r = (n, f, base) => ({ id: MID(n), source: 'robot_file', ...fromFile(f.name, f.raw, base), ...by, created_at: stamp(1), updated_at: stamp(1) })
    return {
      robot_matches: [
        r(1, f1, { driver_id: ids.student2, operator_id: ids.student, battery_id: BID(1), routine_id: AID(1), tower: 'level2', notes_driver: 'Lost the turret lock twice on the far side.', video_url: 'https://www.youtube.com/watch?v=practice1' }),
        r(2, f2, { driver_id: ids.student2, battery_id: BID(2), routine_id: AID(1), scorer_balls_in: 24, notes_pit: 'Brownout at 1:12 on B02. Check the main breaker lead.' }),
        r(3, f3, { driver_id: ids.student, battery_id: BID(1), routine_id: AID(2) }),
        r(4, f4, { routine_id: AID(1) }),
        { id: MID(5), ...EMPTY, source: 'sim_page', file_name: null, raw: null, schema_version: null, kind: 'practice', started_at: stamp(1 / 3), duration_s: 160,
          alliance: 'blue', driver_id: ids.student2, battery_id: BID(5), scorer_balls_in: 15, tower: 'level1', match_label: 'sim practice', crew_typed: {},
          robot_match: null, fms: null, event_code: null, fms_match_type: null, fms_match_number: null, station: null, auto_name: null, auto_winner: null,
          auto_winner_random: null, auto_balls: null, open_balls: null, closed_balls: null, passes: null, balls_total: null, ready_pct: null, battery_start: 12.8,
          battery_min: null, battery_end: 12.0, brownouts: 0, hang_at_seconds: null, distance_m: null, created_by: ids.student2, updated_by: ids.student2, created_at: stamp(1 / 3), updated_at: stamp(1 / 3) },
      ],
    }
  },
  visible: {
    robot_matches: eligible,
  },
  rpcs: {
    robot_match_import: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!writer(ctx)) return refuse('Only staff or a drive-team lead can import robot matches.', '42501')
      const p = parseMatchFile(a.p_raw, a.p_file_name)
      if (p.fileName !== a.p_file_name || !p.ok) return refuse(p.ok ? 'A match file name ends in .json and has no spaces or slashes.' : p.error, '22023')
      if (JSON.stringify(a.p_raw).length > 2000000) return refuse('The match file must be a JSON object under 2 MB.', '22023')
      const l = a.p_links ?? {}
      const old = rows(db, 'robot_matches').find((m) => m.file_name === a.p_file_name)
      if (old) return { data: { status: 'already', match: old }, error: null }
      let simId = null
      if ('sim_match' in l) simId = l.sim_match || null
      else {
        const t0 = Date.parse(p.cols.started_at)
        const c = rows(db, 'robot_matches').filter((m) => m.source === 'sim_page' && !m.file_name && Math.abs(Date.parse(m.started_at) - t0) <= SIM_MERGE_SECONDS * 1000 && (!m.alliance || m.alliance === p.cols.alliance))
        simId = c.length === 1 ? c[0].id : null
      }
      let routine = l.routine || null
      const nr = typeof l.new_routine === 'string' ? l.new_routine.trim() : ''
      if (!routine && nr) {
        routine = rows(db, 'auto_routines').find((x) => x.name.trim().toLowerCase() === nr.toLowerCase())?.id ?? null
        if (!routine) {
          if (nr.length > 60) return refuse('A routine name is at most 60 characters.', '22023')
          routine = engine.insertRow('auto_routines', { name: nr, start_position: null, description: 'Added from a robot match file', active: true, created_by: user.id, updated_by: user.id, created_at: iso(now), updated_at: iso(now) }).id
        }
      }
      let base
      let status = 'imported'
      if (simId) {
        base = rows(db, 'robot_matches').find((m) => m.id === simId && m.source === 'sim_page' && !m.file_name)
        if (!base) return refuse('That Match Sim record already has a robot file, or does not exist.', '22023')
        base = { ...base, source: 'both' }
        status = 'merged'
      } else {
        base = { ...EMPTY, id: undefined, source: 'robot_file', created_by: user.id, created_at: iso(now) }
      }
      const m = fromFile(a.p_file_name, a.p_raw, base)
      for (const [col, key] of [['driver_id', 'driver'], ['operator_id', 'operator'], ['coach_id', 'coach'], ['human_player_id', 'human_player'], ['battery_id', 'battery']]) m[col] = l[key] || m[col] || null
      m.routine_id = routine || m.routine_id || null
      m.event_id = 'event' in l ? l.event || null : m.event_id || (REAL_KINDS.includes(m.kind) || m.fms ? eventFor(m, rows(db, 'events'))?.id ?? null : null)
      for (const id of [m.driver_id, m.operator_id, m.coach_id, m.human_player_id]) if (id && !targetOk(db, id)) return refuse('A crew member is not an approved, active student or staff member.', '22023')
      m.updated_by = user.id
      m.updated_at = iso(now)
      let row
      if (status === 'merged') {
        engine.updateRows('robot_matches', (x) => x.id === simId, m)
        row = rows(db, 'robot_matches').find((x) => x.id === simId)
      } else {
        delete m.id
        row = engine.insertRow('robot_matches', m)
      }
      const notes = []
      const minutes = Math.max(1, Math.min(600, Math.round((row.duration_s ?? 160) / 60)))
      if (row.battery_id && !row.battery_run_id && l.battery_run !== false) {
        if (Date.parse(row.started_at) < ms(now) - 60 * 864e5) notes.push('Battery run not logged: the match is more than 60 days old.')
        else {
          const kind = REAL_KINDS.includes(row.kind) ? 'match' : row.kind === 'practice' ? 'practice_match' : 'drive_practice'
          const br = batteries.rpcs.battery_log_run({ ...ctx, args: { p_battery: row.battery_id, p_kind: kind, p_event: row.event_id, p_match: row.match_label?.slice(0, 40),
            p_voltage_before: row.battery_start, p_voltage_after: row.battery_end, p_minutes: minutes, p_brownout: row.brownouts > 0 ? 'yes' : row.brownouts === 0 ? 'no' : 'unknown', p_notes: `Robot match file ${a.p_file_name}` } })
          if (br.error) return br
          engine.updateRows('battery_runs', (x) => x.id === br.data.id, { ran_at: row.started_at })
          engine.updateRows('robot_matches', (x) => x.id === row.id, { battery_run_id: br.data.id })
        }
      }
      if (row.driver_id && !row.drive_session_id && l.drive_session !== false) {
        const ds = engine.insertRow('drive_sessions', { member_id: row.driver_id, session_date: new Date(row.started_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }),
          minutes, kind: REAL_KINDS.includes(row.kind) ? 'match' : 'practice_field', sim_score: null, notes: `Robot match file ${a.p_file_name}`, logged_by: user.id, updated_by: user.id,
          voided_at: null, voided_by: null, void_reason: null, created_at: iso(now), updated_at: iso(now) })
        engine.updateRows('robot_matches', (x) => x.id === row.id, { drive_session_id: ds.id })
      }
      return { data: { status, match: rows(db, 'robot_matches').find((x) => x.id === row.id), notes }, error: null }
    },
    robot_match_update: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!writer(ctx)) return refuse('Only staff or a drive-team lead can change robot matches.', '42501')
      const f = a.p_fields ?? {}
      const allowed = ['driver_id', 'operator_id', 'coach_id', 'human_player_id', 'battery_id', 'routine_id', 'event_id', 'match_label', 'scorer_balls_in', 'tower',
        'fouls', 'match_score', 'ranking_points', 'notes_driver', 'notes_operator', 'notes_coach', 'notes_human_player', 'notes_pit', 'video_url', 'wpilog_file']
      const bad = Object.keys(f).find((k) => !allowed.includes(k))
      if (bad) return refuse(`Unknown robot match field ${bad}.`, '22023')
      const m = rows(db, 'robot_matches').find((x) => x.id === a.p_id)
      if (!m) return refuse('No such robot match.', 'P0002')
      for (const k of ['driver_id', 'operator_id', 'coach_id', 'human_player_id']) if (f[k] && !targetOk(db, f[k])) return refuse('A crew member is not an approved, active student or staff member.', '22023')
      if (f.tower && !['none', 'level1', 'level2', 'level3', 'failed'].includes(f.tower)) return refuse('TOWER is none, level1, level2, level3 or failed.', '23514')
      if (f.video_url && !/^https:\/\/\S+$/.test(f.video_url)) return refuse('A video link starts with https://.', '23514')
      const patch = {}
      for (const [k, v] of Object.entries(f)) patch[k] = typeof v === 'string' ? v.trim() || null : v ?? null
      for (const k of ['scorer_balls_in', 'match_score']) if (k in patch && patch[k] !== null) patch[k] = Number.isFinite(Number(patch[k])) ? Math.round(Number(patch[k])) : null
      if ('ranking_points' in patch && patch.ranking_points !== null) patch.ranking_points = Number.isFinite(Number(patch.ranking_points)) ? Number(patch.ranking_points) : null
      if ('match_score' in f || 'ranking_points' in f) patch.official_source = patch.match_score == null && patch.ranking_points == null ? null : 'manual'
      engine.updateRows('robot_matches', (x) => x.id === m.id, { ...patch, updated_by: user.id, updated_at: iso(now) })
      return { data: rows(db, 'robot_matches').find((x) => x.id === m.id), error: null }
    },
    robot_match_fill_official: (ctx) => {
      const { args: a, db } = ctx
      if (!writer(ctx)) return refuse('Only staff or a drive-team lead can change robot matches.', '42501')
      const m = rows(db, 'robot_matches').find((x) => x.id === a.p_id)
      if (!m) return refuse('No such robot match.', 'P0002')
      return { data: { ...m, official: 'not_available' }, error: null }
    },
    // 0038's trigger: every Match Sim save is a robot match row too.
    sim_save_match: (ctx) => {
      const res = partd.rpcs.sim_save_match(ctx)
      if (res.error || !res.data) return res
      const s = res.data
      const ended = s.ended_at ? (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000 : null
      ctx.engine.insertRow('robot_matches', { ...EMPTY, source: 'sim_page', file_name: null, raw: null, schema_version: null, sim_match_id: s.id, kind: 'practice',
        started_at: s.started_at, duration_s: ended, alliance: s.alliance, driver_id: s.driver_id, operator_id: s.operator_id, coach_id: s.drive_coach_id,
        human_player_id: s.human_player_id, battery_id: s.battery_id, routine_id: s.routine_id,
        scorer_balls_in: s.auto_fuel == null && s.teleop_fuel == null ? null : (s.auto_fuel ?? 0) + (s.teleop_fuel ?? 0), tower: s.tower,
        battery_start: s.voltage_before, battery_end: s.voltage_after, brownouts: s.brownout === 'yes' ? 1 : s.brownout === 'no' ? 0 : null,
        notes_human_player: s.human_notes, notes_pit: s.problems, battery_run_id: s.battery_run_id, auto_run_id: s.auto_run_id, match_label: 'sim practice',
        crew_typed: {}, created_by: ctx.user.id, updated_by: ctx.user.id, created_at: iso(ctx.now), updated_at: iso(ctx.now) })
      return res
    },
  },
}
