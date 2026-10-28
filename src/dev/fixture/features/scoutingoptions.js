// Fixture: observation options (supabase/migrations/0037_scouting_observation_options.sql,
// ledger 0029). A port of 0037's rules for browser workflows; the SQL is proven
// by 0037_scouting_observation_options_rls_test.sql. features/scouting.js's
// save calls customProblem while 0037 is applied.
import { validAnswer } from '../../../scouting/options.js'

const id = (n) => `24000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const rows = (db, name) => db[name] ?? []
const ok = (data) => ({ data, error: null })
const fail = (message, code = '22023') => ({ data: null, error: { message, code } })
const stamp = (now) => new Date(now).toISOString()
const TYPES = ['yesno', 'choice', 'count', 'rating', 'note']
const PHASES = ['auto', 'teleop', 'endgame', 'reliability', 'strategy']
const STATUSES = ['requested', 'active', 'declined', 'retired']
const eligible = ({ user, persona, db }) => !!user?.id && !persona?.isParent && rows(db, 'profiles').some(p => p.id === user.id && p.approved && p.status === 'active') && (persona?.isStaff || persona?.roles?.includes('student'))
const managesOptions = (ctx) => eligible(ctx) && (ctx.persona?.isStaff
  || rows(ctx.db, 'member_permissions').some(r => r.member_id === ctx.user.id && r.capability === 'scouting.manage')
  || rows(ctx.db, 'event_roles').some(r => r.member_id === ctx.user.id && r.role === 'scouting_lead' && rows(ctx.db, 'events').some(e => e.id === r.event_id && Date.parse(e.ends_at) > ctx.now)))

const validChoices = (c) => Array.isArray(c) && c.length >= 2 && c.length <= 8 && new Set(c.map(x => x?.[0])).size === c.length
  && c.every(x => Array.isArray(x) && x.length === 2 && /^[a-z][a-z0-9_]{0,29}$/.test(x[0]) && x[0] !== 'did_not_see' && typeof x[1] === 'string' && x[1].trim().length >= 1 && x[1].trim().length <= 60)

export function customProblem(db, custom) {
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return 'Observation option answers must be an object.'
  for (const [k, v] of Object.entries(custom)) {
    if (v === null) return 'Leave an observation option out when it was not recorded; null is not an answer.'
    const o = rows(db, 'scouting_options').find(x => x.key === k && ['active', 'retired'].includes(x.status))
    if (!o) return 'That observation option is not turned on.'
    if (!validAnswer(o, v)) return 'That answer does not fit the option.'
  }
  return null
}
function keyFor(db, label) {
  let base = String(label ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36)
  if (!/^[a-z]/.test(base)) base = `opt_${base}`.replace(/_+$/, '').slice(0, 36)
  if (base.length < 2) base = 'option'
  let k = base, n = 1
  while (rows(db, 'scouting_options').some(o => o.key === k)) { n += 1; k = `${base}_${n}` }
  return k
}
const nameOf = (db, uid) => { const p = rows(db, 'profiles').find(x => x.id === uid); return (p?.nickname || '').trim() || (p?.full_name || '').trim() || 'Member' }
const json = (db, o, uid) => ({ ...o, requested_by_name: o.requested_by ? nameOf(db, o.requested_by) : null, mine: o.requested_by === uid })

export default {
  migration: '0037',
  creates: { tables: ['scouting_options'], rpcs: ['scouting_options_list', 'scouting_option_request', 'scouting_option_save'] },
  seed: ({ ids, now }) => {
    const at = stamp(now)
    const base = { help: null, choices: null, was_active: true, requested_by: null, request_note: null, example_record: null, example_team: null, decided_by: ids.mentor, decided_at: at, decline_reason: null, created_at: at, updated_at: at }
    return {
      scouting_options: [
        { ...base, id: id(1), key: 'passing_zone', label: 'Passes FUEL from', type: 'choice', choices: [['alliance', 'Alliance zone'], ['neutral', 'Neutral zone'], ['both', 'Both']], phase: 'teleop', status: 'active', position: 10, help: 'Where the robot launches passes to a partner.' },
        { ...base, id: id(2), key: 'passing_works', label: 'Passes reach a partner', type: 'rating', phase: 'teleop', status: 'active', position: 20 },
        { ...base, id: id(3), key: 'handles_shifts', label: 'Ready for each phase shift', type: 'yesno', phase: 'strategy', status: 'requested', position: 100, was_active: false, requested_by: ids.student2, request_note: 'Some robots sit idle when the hub turns off.', decided_by: null, decided_at: null },
      ],
    }
  },
  visible: { scouting_options: () => false },
  rpcs: {
    scouting_options_list: (ctx) => {
      if (!eligible(ctx)) return fail('Scouting is for approved active team members.', '42501')
      const mgr = managesOptions(ctx)
      const list = rows(ctx.db, 'scouting_options').filter(o => ['active', 'retired'].includes(o.status) || mgr || o.requested_by === ctx.user.id)
        .sort((a, b) => (b.status === 'active') - (a.status === 'active') || a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)))
      return ok({ can_manage: mgr, options: list.map(o => json(ctx.db, o, ctx.user.id)) })
    },
    scouting_option_request: (ctx) => {
      const { args: a, db, engine, now, uuid, user } = ctx
      if (!eligible(ctx)) return fail('Scouting is for approved active team members.', '42501')
      if (rows(db, 'scouting_options').filter(o => o.requested_by === user.id && o.status === 'requested').length >= 20) return fail('You already have 20 open requests. Wait for the scouting lead to answer some.')
      const label = String(a.p_label ?? '').trim()
      if (label.length < 2 || label.length > 120) return fail('Name the option in 2 to 120 characters.')
      if (!TYPES.includes(a.p_type)) return fail('Choose an answer type.')
      if (a.p_type === 'choice' && !validChoices(a.p_choices)) return fail('A choice needs 2 to 8 different answers.')
      const at = stamp(now)
      const o = { id: uuid(), key: keyFor(db, label), label, help: null, type: a.p_type, choices: a.p_type === 'choice' ? a.p_choices : null, phase: PHASES.includes(a.p_phase) ? a.p_phase : 'teleop',
        status: 'requested', position: 100, was_active: false, requested_by: user.id, request_note: a.p_note ? String(a.p_note).trim().slice(0, 500) : null,
        example_record: a.p_example_record ?? null, example_team: a.p_example_team ?? null, decided_by: null, decided_at: null, decline_reason: null, created_at: at, updated_at: at }
      engine.insertRow('scouting_options', o)
      return ok(json(db, o, user.id))
    },
    scouting_option_save: (ctx) => {
      const { args: a, db, engine, now, uuid, user } = ctx
      if (!managesOptions(ctx)) return fail('Only the scouting lead or staff manage observation options.', '42501')
      if (!STATUSES.includes(a.p_status)) return fail('Choose active, declined, retired or requested.')
      const label = String(a.p_label ?? '').trim()
      if (label.length < 2 || label.length > 120) return fail('Name the option in 2 to 120 characters.')
      if (!TYPES.includes(a.p_type)) return fail('Choose an answer type.')
      if (a.p_type === 'choice' && !validChoices(a.p_choices)) return fail('A choice needs 2 to 8 different answers.')
      const at = stamp(now)
      if (!a.p_id) {
        const o = { id: uuid(), key: keyFor(db, label), label, help: a.p_help ? String(a.p_help).trim() : null, type: a.p_type, choices: a.p_type === 'choice' ? a.p_choices : null, phase: PHASES.includes(a.p_phase) ? a.p_phase : 'teleop',
          status: a.p_status, position: a.p_position ?? 100, was_active: a.p_status === 'active', requested_by: null, request_note: null, example_record: null, example_team: null,
          decided_by: user.id, decided_at: at, decline_reason: null, created_at: at, updated_at: at }
        engine.insertRow('scouting_options', o)
        return ok(json(db, o, user.id))
      }
      const old = rows(db, 'scouting_options').find(o => o.id === a.p_id)
      if (!old) return fail('That observation option was not found.', 'P0002')
      if (old.was_active && a.p_type !== old.type) return fail('The answer type cannot change once the option has been used. Retire it and add a new one.')
      if (old.was_active && old.type === 'choice' && old.choices.some(([v]) => !(a.p_choices ?? []).some(([x]) => x === v))) return fail('A choice cannot be removed once the option has been used. Rename it instead.')
      const changed = a.p_status !== old.status
      const next = { ...old, label, help: a.p_help ? String(a.p_help).trim() : null, type: a.p_type, choices: a.p_type === 'choice' ? a.p_choices : null, phase: PHASES.includes(a.p_phase) ? a.p_phase : old.phase,
        status: a.p_status, position: a.p_position ?? old.position, was_active: old.was_active || a.p_status === 'active',
        decline_reason: a.p_status === 'declined' ? (a.p_decline_reason ? String(a.p_decline_reason).trim() : null) : null,
        decided_by: changed ? user.id : old.decided_by, decided_at: changed ? at : old.decided_at, updated_at: at }
      engine.updateRows('scouting_options', o => o.id === a.p_id, next)
      return ok(json(db, next, user.id))
    },
  },
}

