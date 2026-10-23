// Fixture: the human player leaderboard (supabase/migrations/0033_human_player_leaderboard.sql,
// ledger 0025). Contract: src/dev/fixture/README.md. Plain data, no side
// effects. A test-only PORT of the 0033 functions so /human-player can be
// driven in a browser; the rule is the SQL, proven by
// 0033_human_player_leaderboard_rls_test.sql and tools/sql-harness/mutants-0033.mjs.

const rows = (db, t) => (Array.isArray(db[t]) ? db[t] : (db[t] = []))
const iso = (now) => (now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now())).toISOString()
const ms = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now())
const refuse = (message, code) => ({ data: null, error: { code, message, details: null, hint: null } })
const AID = (n) => `33000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const laDay = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const eligible = ({ user, persona, db }) => !!user?.id && !persona?.isParent
  && rows(db, 'profiles').some((p) => p.id === user.id && p.approved && (p.status ?? 'active') === 'active')
  && (persona?.isStaff || (persona?.roles ?? []).includes('student'))
const staff = (ctx) => eligible(ctx) && !!ctx.persona?.isStaff
const targetOk = (db, id) => rows(db, 'profiles').some((p) => p.id === id && p.approved && (p.status ?? 'active') === 'active')
  && rows(db, 'member_roles').some((r) => r.member_id === id && ['student', 'mentor', 'lead', 'admin'].includes(r.role))

function check(a, now) {
  const inact = a.p_made_inactive ?? 0
  if (!['accuracy', 'rate', 'match'].includes(a.p_drill)) return 'The drill is accuracy, rate or match.'
  if (!Number.isInteger(a.p_made) || a.p_made < 0 || a.p_made > 1000) return 'Made is a whole number from 0 to 1000.'
  if (!Number.isInteger(a.p_attempted) || a.p_attempted < 1 || a.p_attempted > 1000) return 'Shots taken is a whole number from 1 to 1000.'
  if (!Number.isInteger(inact) || inact < 0) return 'Made while inactive is 0 or more.'
  if (a.p_made + inact > a.p_attempted) return 'More made than shots taken.'
  if (a.p_drill === 'accuracy' && (a.p_attempted > 200 || a.p_seconds != null)) return 'An accuracy set is at most 200 shots, with no clock.'
  if (a.p_drill !== 'accuracy' && (a.p_seconds == null || a.p_seconds < 5 || a.p_seconds > 600)) return 'Seconds are between 5 and 600.'
  if (a.p_drill !== 'match' && (inact !== 0 || a.p_alliance != null || a.p_inactive_first != null)) return 'Made while inactive and the HUB order are for a match run only.'
  if (!a.p_date || a.p_date > addDays(laDay(ms(now)), 1) || a.p_date < '2015-01-01') return 'The date is today or earlier.'
  return null
}

export default {
  migration: '0033',
  creates: {
    tables: ['hp_attempts'],
    rpcs: ['hp_log_attempt', 'hp_edit_attempt', 'hp_void_attempt'],
  },
  // Riley (student2): three of each drill, the most match FUEL and the
  // fastest rate. Sam (student): three of each, the most accurate, half
  // Riley's match FUEL, plus one voided match run that counts for nothing.
  // Casey (exempt): two match runs only (needs 1 more match run, 3 rate, 3
  // accuracy), plus a full set before the season (All time only).
  seed: ({ ids, now }) => {
    const today = laDay(ms(now))
    const t = (h) => new Date(ms(now) - h * 3600_000).toISOString()
    let n = 0
    const a = (member, daysAgo, drill, made, attempted, extra = {}) => {
      n += 1
      return { id: AID(n), member_id: member, attempt_date: addDays(today, -daysAgo), drill, made, attempted, made_inactive: 0, seconds: drill === 'accuracy' ? null : drill === 'rate' ? 30 : 163,
        alliance: drill === 'match' ? 'red' : null, inactive_first: drill === 'match' ? 'blue' : null, notes: null, logged_by: member, updated_by: member,
        voided_at: null, voided_by: null, void_reason: null, created_at: t(daysAgo * 24 + 3), updated_at: t(daysAgo * 24 + 3), ...extra }
    }
    const R = ids.student2, S = ids.student, C = ids.exempt
    return {
      hp_attempts: [
        a(R, 2, 'match', 40, 52, { made_inactive: 4, notes: 'Held through SHIFT 2' }), a(R, 4, 'match', 38, 50, { made_inactive: 2 }), a(R, 6, 'match', 42, 55, { made_inactive: 5, logged_by: ids.mentor }),
        a(R, 2, 'rate', 21, 28), a(R, 4, 'rate', 24, 30), a(R, 6, 'rate', 18, 26),
        a(R, 3, 'accuracy', 16, 20), a(R, 5, 'accuracy', 17, 20), a(R, 7, 'accuracy', 15, 20),
        a(S, 3, 'match', 20, 26, { made_inactive: 1 }), a(S, 5, 'match', 22, 27, { made_inactive: 0 }), a(S, 8, 'match', 18, 24, { made_inactive: 2 }),
        a(S, 1, 'match', 70, 80, { voided_at: t(20), voided_by: ids.mentor, void_reason: 'Counted both HUBS' }),
        a(S, 3, 'rate', 12, 14), a(S, 5, 'rate', 11, 13), a(S, 8, 'rate', 13, 15),
        a(S, 3, 'accuracy', 19, 20), a(S, 5, 'accuracy', 20, 20), a(S, 8, 'accuracy', 18, 20),
        a(C, 1, 'match', 30, 40, { made_inactive: 3 }), a(C, 2, 'match', 28, 36, { made_inactive: 2 }),
        a(C, 220, 'match', 60, 70), a(C, 221, 'match', 60, 70), a(C, 222, 'match', 60, 70),
        a(C, 220, 'rate', 30, 32), a(C, 221, 'rate', 30, 32), a(C, 222, 'rate', 30, 32),
        a(C, 220, 'accuracy', 20, 20), a(C, 221, 'accuracy', 20, 20), a(C, 222, 'accuracy', 20, 20),
      ],
    }
  },
  visible: {
    hp_attempts: eligible,
  },
  rpcs: {
    hp_log_attempt: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The human player leaderboard is for approved students and staff.', '42501')
      const member = a.p_member ?? user.id
      if (member !== user.id && !staff(ctx)) return refuse('You log your own attempts. A mentor can log them for someone else.', '42501')
      if (!targetOk(db, member)) return refuse('That member is not an approved, active student or staff member.', '22023')
      const date = a.p_date ?? laDay(ms(now))
      const problem = check({ ...a, p_date: date }, now)
      if (problem) return refuse(problem, '22023')
      if (!staff(ctx) && date < addDays(laDay(ms(now)), -60)) return refuse('Log an attempt within 60 days. Ask a mentor for anything older.', '22023')
      const row = engine.insertRow('hp_attempts', { member_id: member, attempt_date: date, drill: a.p_drill, made: a.p_made, attempted: a.p_attempted, made_inactive: a.p_made_inactive ?? 0,
        seconds: a.p_seconds ?? null, alliance: a.p_alliance ?? null, inactive_first: a.p_inactive_first ?? null, notes: a.p_notes?.trim() || null,
        logged_by: user.id, updated_by: user.id, voided_at: null, voided_by: null, void_reason: null, created_at: iso(now), updated_at: iso(now) })
      return { data: row, error: null }
    },
    hp_edit_attempt: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!staff(ctx)) return refuse('Only staff can change an attempt.', '42501')
      const x = rows(db, 'hp_attempts').find((r) => r.id === a.p_attempt)
      if (!x) return refuse('No such attempt.', 'P0002')
      const problem = check({ ...a, p_drill: x.drill, p_alliance: x.alliance, p_inactive_first: x.inactive_first }, now)
      if (problem) return refuse(problem, '22023')
      const patch = { attempt_date: a.p_date, made: a.p_made, attempted: a.p_attempted, made_inactive: a.p_made_inactive ?? 0, seconds: a.p_seconds ?? null, notes: a.p_notes?.trim() || null, updated_by: user.id, updated_at: iso(now) }
      engine.updateRows('hp_attempts', (r) => r.id === x.id, patch)
      return { data: { ...x, ...patch }, error: null }
    },
    hp_void_attempt: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The human player leaderboard is for approved students and staff.', '42501')
      const x = rows(db, 'hp_attempts').find((r) => r.id === a.p_attempt)
      if (!x) return refuse('No such attempt.', 'P0002')
      if (!staff(ctx) && (x.member_id !== user.id || Date.parse(x.created_at) < ms(now) - 24 * 3600_000)) return refuse('You can void your own attempt for 24 hours after logging it. Ask a mentor after that.', '42501')
      if (x.voided_at) return refuse('That attempt is already void.', '22023')
      const patch = { voided_at: iso(now), voided_by: user.id, void_reason: a.p_reason?.trim() || null, updated_by: user.id, updated_at: iso(now) }
      engine.updateRows('hp_attempts', (r) => r.id === x.id, patch)
      return { data: { ...x, ...patch }, error: null }
    },
  },
}
