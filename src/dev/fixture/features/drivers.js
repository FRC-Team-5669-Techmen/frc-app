// Fixture: the driver leaderboard (supabase/migrations/0029_driver_leaderboard.sql,
// ledger 0020). Contract: src/dev/fixture/README.md. Plain data, no side
// effects. A test-only PORT of the 0029 functions so /drivers can be driven in
// a browser; the rule is the SQL, proven by 0029_driver_leaderboard_rls_test.sql
// and tools/sql-harness/mutants-0029.mjs.

const rows = (db, t) => (Array.isArray(db[t]) ? db[t] : (db[t] = []))
const iso = (now) => (now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now())).toISOString()
const ms = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now())
const refuse = (message, code) => ({ data: null, error: { code, message, details: null, hint: null } })
const SID = (n) => `29000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const RID = (n) => `29100000-0000-4000-8000-${String(n).padStart(12, '0')}`
const laDay = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const eligible = ({ user, persona, db }) => !!user?.id && !persona?.isParent
  && rows(db, 'profiles').some((p) => p.id === user.id && p.approved && (p.status ?? 'active') === 'active')
  && (persona?.isStaff || (persona?.roles ?? []).includes('student'))
const staff = (ctx) => eligible(ctx) && !!ctx.persona?.isStaff
const KINDS = ['practice_field', 'match', 'test', 'mosim']
const CRIT = ['control', 'awareness', 'scoring', 'defense', 'consistency']
const targetOk = (db, id) => rows(db, 'profiles').some((p) => p.id === id && p.approved && (p.status ?? 'active') === 'active')
  && rows(db, 'member_roles').some((r) => r.member_id === id && ['student', 'mentor', 'lead', 'admin'].includes(r.role))

function checkSession(a, now) {
  if (!KINDS.includes(a.p_kind)) return 'Kind is practice_field, match, test or mosim.'
  if (!Number.isInteger(a.p_minutes) || a.p_minutes < 1 || a.p_minutes > 600) return 'Minutes are between 1 and 600.'
  if (a.p_score != null && a.p_kind !== 'mosim') return 'A score is for a MoSim session only.'
  if (a.p_score != null && (a.p_score < 0 || a.p_score > 100000)) return 'A MoSim score is between 0 and 100000.'
  if (!a.p_date || a.p_date > addDays(laDay(ms(now)), 1) || a.p_date < '2015-01-01') return 'The date is today or earlier.'
  return null
}

export default {
  migration: '0029',
  creates: {
    tables: ['drive_sessions', 'driver_ratings'],
    rpcs: ['driver_rating_scores', 'driver_log_session', 'driver_edit_session', 'driver_void_drive', 'driver_rate'],
  },
  // Riley (student2) has the most robot time and a strong rating; Sam
  // (student) a little robot time, MoSim and a middling rating; Casey (exempt)
  // MoSim only, unrated, plus a session before the current season (All time
  // only); one voided session of Sam's that counts for nothing.
  seed: ({ ids, now }) => {
    const today = laDay(ms(now))
    const d = (n) => addDays(today, -n)
    const t = (h) => new Date(ms(now) - h * 3600_000).toISOString()
    const s = (n, member, daysAgo, minutes, kind, extra = {}) => ({ id: SID(n), member_id: member, session_date: d(daysAgo), minutes, kind, sim_score: null, notes: null,
      logged_by: member, updated_by: member, voided_at: null, voided_by: null, void_reason: null, created_at: t(daysAgo * 24 + 2), updated_at: t(daysAgo * 24 + 2), ...extra })
    const r = (n, driver, coach, daysAgo, v, note) => ({ id: RID(n), driver_id: driver, coach_id: coach, control: v[0], awareness: v[1], scoring: v[2], defense: v[3], consistency: v[4],
      note, rated_at: t(daysAgo * 24), created_at: t(daysAgo * 24) })
    return {
      drive_sessions: [
        s(1, ids.student2, 3, 90, 'practice_field', { notes: 'Cycling drills' }),
        s(2, ids.student2, 5, 60, 'match', { logged_by: ids.mentor }),
        s(3, ids.student2, 9, 45, 'test'),
        s(4, ids.student, 4, 30, 'practice_field'),
        s(5, ids.student, 2, 120, 'mosim', { sim_score: 1840, notes: 'Defense drills' }),
        s(6, ids.student, 6, 200, 'match', { voided_at: t(140), voided_by: ids.mentor, void_reason: 'Logged twice' }),
        s(7, ids.exempt, 1, 180, 'mosim', { sim_score: 2210 }),
        s(8, ids.exempt, 220, 300, 'practice_field', { notes: 'Last season' }),
      ],
      driver_ratings: [
        r(1, ids.student2, ids.mentor, 20, [3, 3, 3, 3, 3], 'Early days'),
        r(2, ids.student2, ids.mentor, 2, [5, 4, 4, null, 5], 'Calm under pressure'),
        r(3, ids.student2, ids.admin, 4, [4, 4, 5, 3, 4], null),
        r(4, ids.student, ids.mentor, 3, [3, 3, 2, 3, 3], 'Watch the wall on turns'),
      ],
    }
  },
  visible: {
    drive_sessions: eligible,
    driver_ratings: (ctx) => eligible(ctx) && (!!ctx.persona?.isStaff || ctx.row?.driver_id === ctx.user?.id),
  },
  rpcs: {
    driver_rating_scores: (ctx) => {
      if (!eligible(ctx)) return refuse('The driver leaderboard is for approved students and staff.', '42501')
      const data = rows(ctx.db, 'driver_ratings').map(({ note, created_at, ...x }) => x).sort((a, b) => (a.rated_at < b.rated_at ? 1 : -1))
      return { data, error: null }
    },
    driver_log_session: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The driver leaderboard is for approved students and staff.', '42501')
      const member = a.p_member ?? user.id
      if (member !== user.id && !staff(ctx)) return refuse('You log your own drive time. A mentor can log it for someone else.', '42501')
      if (!targetOk(db, member)) return refuse('That member is not an approved, active student or staff member.', '22023')
      const date = a.p_date ?? laDay(ms(now))
      const problem = checkSession({ ...a, p_date: date }, now)
      if (problem) return refuse(problem, '22023')
      if (!staff(ctx) && date < addDays(laDay(ms(now)), -60)) return refuse('Log a session within 60 days. Ask a mentor for anything older.', '22023')
      const row = engine.insertRow('drive_sessions', { member_id: member, session_date: date, minutes: a.p_minutes, kind: a.p_kind, sim_score: a.p_score ?? null,
        notes: a.p_notes?.trim() || null, logged_by: user.id, updated_by: user.id, voided_at: null, voided_by: null, void_reason: null, created_at: iso(now), updated_at: iso(now) })
      return { data: row, error: null }
    },
    driver_edit_session: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!staff(ctx)) return refuse('Only staff can change a drive session.', '42501')
      const problem = checkSession(a, now)
      if (problem) return refuse(problem, '22023')
      const s = rows(db, 'drive_sessions').find((x) => x.id === a.p_session)
      if (!s) return refuse('No such session.', 'P0002')
      const patch = { session_date: a.p_date, minutes: a.p_minutes, kind: a.p_kind, sim_score: a.p_score ?? null, notes: a.p_notes?.trim() || null, updated_by: user.id, updated_at: iso(now) }
      engine.updateRows('drive_sessions', (x) => x.id === s.id, patch)
      return { data: { ...s, ...patch }, error: null }
    },
    driver_void_drive: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The driver leaderboard is for approved students and staff.', '42501')
      const s = rows(db, 'drive_sessions').find((x) => x.id === a.p_session)
      if (!s) return refuse('No such session.', 'P0002')
      if (!staff(ctx) && (s.member_id !== user.id || Date.parse(s.created_at) < ms(now) - 24 * 3600_000)) return refuse('You can void your own session for 24 hours after logging it. Ask a mentor after that.', '42501')
      if (s.voided_at) return refuse('That session is already void.', '22023')
      const patch = { voided_at: iso(now), voided_by: user.id, void_reason: a.p_reason?.trim() || null, updated_by: user.id, updated_at: iso(now) }
      engine.updateRows('drive_sessions', (x) => x.id === s.id, patch)
      return { data: { ...s, ...patch }, error: null }
    },
    driver_rate: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!staff(ctx)) return refuse('Only staff can rate a driver.', '42501')
      if (!a.p_driver || a.p_driver === user.id) return refuse('Rate another member, not yourself.', '22023')
      if (!targetOk(db, a.p_driver)) return refuse('That member is not an approved, active student or staff member.', '22023')
      const v = CRIT.map((c) => a[`p_${c}`] ?? null)
      if (v.every((x) => x == null)) return refuse('Give at least one rating from 1 to 5.', '22023')
      if (v.some((x) => x != null && (x < 1 || x > 5))) return refuse('Each rating is 1 to 5.', '22023')
      const row = engine.insertRow('driver_ratings', { driver_id: a.p_driver, coach_id: user.id, ...Object.fromEntries(CRIT.map((c, i) => [c, v[i]])),
        note: a.p_note?.trim() || null, rated_at: iso(now), created_at: iso(now) })
      return { data: row, error: null }
    },
  },
}
