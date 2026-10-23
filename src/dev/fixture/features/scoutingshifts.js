// Fixture: super scouts and the shared "now" match number
// (supabase/migrations/0030_scouting_shifts_super.sql, ledger 0022). A port
// of 0030's rules for browser workflows; the SQL is proven by
// 0030_scouting_shifts_super_rls_test.sql and mutants-0030.mjs.
// features/scouting.js's save calls superProblem while 0030 is applied.
import { SUPER_RATINGS, SUPER_NOTE_KEY } from '../../../scouting/superscout.js'

const EVENT = '16000000-0000-4000-8000-000000000001'
const id = (n) => `23000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const rows = (db, name) => db[name] ?? []
const ok = (data) => ({ data, error: null })
const fail = (message, code = '22023') => ({ data: null, error: { message, code } })
const RATING_KEYS = SUPER_RATINGS.map(r => r.key)
const eligible = ({ user, persona, db }) => !!user?.id && !persona?.isParent && rows(db, 'profiles').some(p => p.id === user.id && p.approved && p.status === 'active') && (persona?.isStaff || persona?.roles?.includes('student'))
const manages = (ctx, event) => eligible(ctx) && (ctx.persona?.isStaff
  || rows(ctx.db, 'event_roles').some(r => r.event_id === event && r.member_id === ctx.user.id && r.role === 'scouting_lead')
  || rows(ctx.db, 'member_permissions').some(r => r.member_id === ctx.user.id && r.capability === 'scouting.manage'))

export function superProblem(a, p) {
  if ('role' in p && !['scout', 'super'].includes(p.role)) return 'Choose scout or super scout.'
  if (a.p_kind === 'observation') {
    if (p.role === 'super') {
      const s = p.super
      if (!s || typeof s !== 'object' || Array.isArray(s) || !Object.keys(s).length) return 'A super-scout note needs a rating or a failure note.'
      if ('match' in p || Object.keys(p.answers ?? {}).length) return 'A super-scout note carries no counts or capability answers.'
      for (const [k, v] of Object.entries(s)) {
        if (RATING_KEYS.includes(k)) { if (!Number.isInteger(v) || v < 1 || v > 5) return 'A super-scout rating is a whole number from 1 to 5.' }
        else if (k === SUPER_NOTE_KEY) { if (typeof v !== 'string' || !v.trim() || v.length > 1000) return 'Failure notes are 1 to 1000 characters.' }
        else return 'Unknown super-scout field.'
      }
    } else if ('super' in p) return 'Only a super-scout note carries super-scout ratings.'
    if ('alliance' in p || 'teams' in p) return 'Unknown scouting field.'
  } else if (a.p_kind === 'assignment') {
    if (p.role === 'super') {
      if (!['red', 'blue'].includes(p.alliance)) return 'A super-scout assignment names the red or blue alliance.'
      const t = p.teams
      if (!Array.isArray(t) || !t.length || t.length > 3 || t.some(n => !Number.isInteger(n) || n < 1 || n > 99999) || new Set(t).size !== t.length || !t.includes(a.p_team)) return 'A super-scout assignment lists one to three different teams, including its own team.'
    } else if ('alliance' in p || 'teams' in p) return 'Only a super-scout assignment names an alliance.'
    if ('super' in p) return 'Unknown scouting field.'
  } else return 'Unknown scouting field.'
  return null
}

const shape = (r) => r && ({ event_id: r.event_id, match_number: r.match_number, block_size: r.block_size, updated_at: r.updated_at })

export default {
  migration: '0030',
  creates: { tables: ['scouting_now'], rpcs: ['scouting_now_get', 'scouting_now_set'] },
  // The field is on Q3 in blocks of 12. Sam (the student persona) has a super-
  // scout assignment on Q5's red alliance and a robot in Q8, so "you're up in
  // 2 matches" shows; Riley and the mentor are a redundant pair on 1538 in qm5
  // (scoutingmatch.js seeds their two sheets).
  seed: ({ ids, now }) => {
    const at = new Date(now).toISOString()
    const asg = (n, assignee, team, match, payload = {}) => ({ id: id(n), event_id: EVENT, member_id: ids.mentor, kind: 'assignment', team_number: team, match_key: match, version: 1, created_at: at, updated_at: at,
      payload: { assignee, status: 'assigned', instructions: '', video_url: '', ...payload } })
    const records = [
      asg(1, ids.student, 4414, 'qm5', { role: 'super', alliance: 'red', teams: [4414, 1538, 5669], instructions: 'Super scout this alliance. No counts: rate driver skill, defense, speed and intake reliability for each robot, and note every failure.' }),
      asg(2, ids.student, 1323, 'qm8'),
    ]
    return {
      scouting_records: records,
      scouting_revisions: records.map((r) => ({ record_id: r.id, event_id: EVENT, member_id: r.member_id, changed_by: r.member_id, version: 1, snapshot: structuredClone(r), created_at: at })),
      scouting_now: [{ event_id: EVENT, match_number: 3, block_size: 12, updated_at: at }],
    }
  },
  rpcs: {
    scouting_now_get: (ctx) => {
      if (!eligible(ctx)) return fail('Scouting is available to approved student and staff accounts.', '42501')
      return ok(shape(rows(ctx.db, 'scouting_now').find(r => r.event_id === ctx.args.p_event)) ?? null)
    },
    scouting_now_set: (ctx) => {
      const { args: a, db, engine, now } = ctx
      if (!manages(ctx, a.p_event)) return fail('Only scouting managers can move the current match.', '42501')
      const has = (v) => v !== null && v !== undefined
      if (has(a.p_match) === has(a.p_delta) && !has(a.p_block)) return fail('Set a match number, or bump it by a step.')
      if (has(a.p_match) && has(a.p_delta)) return fail('Set a match number or bump it, not both.')
      if (has(a.p_match) && (!Number.isInteger(a.p_match) || a.p_match < 0 || a.p_match > 999)) return fail('A match number is 0 to 999.')
      if (has(a.p_delta) && (!Number.isInteger(a.p_delta) || Math.abs(a.p_delta) > 50)) return fail('Bump by at most 50 matches.')
      if (has(a.p_block) && (!Number.isInteger(a.p_block) || a.p_block < 1 || a.p_block > 200)) return fail('A shift block is 1 to 200 matches.')
      const old = rows(db, 'scouting_now').find(r => r.event_id === a.p_event)
      const base = old?.match_number ?? 0
      const next = { event_id: a.p_event, match_number: has(a.p_match) ? a.p_match : has(a.p_delta) ? Math.max(0, Math.min(999, base + a.p_delta)) : base, block_size: has(a.p_block) ? a.p_block : old?.block_size ?? 12, updated_at: new Date(now).toISOString() }
      if (old) engine.updateRows('scouting_now', r => r.event_id === a.p_event, next)
      else engine.insertRow('scouting_now', next)
      return ok(shape(next))
    },
  },
}
