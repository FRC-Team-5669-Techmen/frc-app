import { matchIdentity } from '../../../scouting/provenance.js'
// Fixture-only port of scouting rules. This proves browser workflows; SQL and
// RLS are independently exercised by 0022_scouting_rls_test.sql.
const EVENT = '16000000-0000-4000-8000-000000000001'
const id = (n) => `22000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const rows = (db, name) => db[name] ?? []
const ok = (data) => ({ data, error: null })
const fail = (message, code = '22023') => ({ data: null, error: { message, code } })
const stamp = (now) => new Date(now).toISOString()
const eligible = ({ user, persona, db }) => !!user?.id && !persona?.isParent && rows(db, 'profiles').some(p => p.id === user.id && p.approved && p.status === 'active') && (persona?.isStaff || persona?.roles?.includes('student'))
const manages = (ctx, event) => eligible(ctx) && (ctx.persona?.isStaff
  || rows(ctx.db, 'event_roles').some(r => r.event_id === event && r.member_id === ctx.user.id && r.role === 'scouting_lead')
  || rows(ctx.db, 'member_permissions').some(r => r.member_id === ctx.user.id && r.capability === 'scouting.manage'))

function save(ctx) {
  const { args: a, db, user, engine, now, uuid } = ctx
  if (!eligible(ctx)) return fail('Scouting is available to approved students and staff.', '42501')
  if (a.p_actor !== user.id) return fail('This save belongs to another account.', '42501')
  if (!rows(db, 'events').some(e => e.id === a.p_event)) return fail('Event not found.')
  const oldOperation = rows(db, 'scouting_operations').find(r => r.operation_id === a.p_operation && r.member_id === user.id)
  if (oldOperation) return JSON.stringify(oldOperation.request) === JSON.stringify(a) ? ok(oldOperation.result) : fail('This operation was already used with different data.')
  const old = rows(db, 'scouting_records').find(r => r.id === a.p_id)
  const manager = manages(ctx, a.p_event)
  if (['assignment', 'team'].includes(a.p_kind) && !manager) return fail('Scouting manager required.', '42501')
  if (old && old.member_id !== user.id && (!manager || ['observation', 'pick_list'].includes(old.kind))) return fail('Only the author can change that record.', '42501')
  if (old && (old.event_id !== a.p_event || old.kind !== a.p_kind || old.team_number !== a.p_team || old.match_key !== a.p_match)) return fail('The identity of a record cannot change.')
  if ((old?.version ?? 0) !== a.p_expected_version) return fail('This record changed. Review the newer version before applying your edit.', '40001')
  const p = a.p_payload
  if (!p || Array.isArray(p) || typeof p !== 'object') return fail('A record needs an object payload.')
  if (!['pit', 'observation', 'assignment', 'message', 'pick_list', 'team'].includes(a.p_kind)) return fail('Unknown record kind.')
  if (a.p_kind !== 'pick_list' && (!Number.isInteger(a.p_team) || a.p_team < 1)) return fail('Choose a team.')
  if (['assignment', 'observation'].includes(a.p_kind) && !a.p_match?.trim()) return fail('Enter the match.')
  if (a.p_kind === 'observation' && (!['live', 'video'].includes(p.source) || Object.values(p.answers ?? {}).some(v => !['yes', 'no', 'did_not_see', 'not_applicable'].includes(v)))) return fail('Choose an observation state explicitly.')
  if (['observation', 'assignment'].includes(a.p_kind)) {
    if ('source_scope' in p && !['current', 'external'].includes(p.source_scope)) return fail('Invalid footage scope.')
    if ('source_event' in p && p.source_scope !== 'external') return fail('A source event needs external scope.')
    if (p.source_scope === 'external' && (!/^\d{4}[a-z0-9]{2,40}$/.test(p.source_event || '') || !a.p_match.startsWith(`${p.source_event}_`) || !/^https:\/\/[^\s]+$/.test(p.video_url || '') || (a.p_kind === 'observation' && p.source !== 'video'))) return fail('Prior-event footage needs its source event, full match key and video URL.')
    if (a.p_kind === 'observation' && p.assignment_id && !rows(db, 'scouting_records').some(r => r.id === p.assignment_id && r.kind === 'assignment' && r.event_id === a.p_event && r.team_number === a.p_team && r.match_key === a.p_match && r.payload.assignee === user.id && r.payload.status !== 'cancelled' && (r.payload.source_scope || 'current') === (p.source_scope || 'current') && (r.payload.source_event || null) === (p.source_event || null))) return fail('This assignment does not match your observation.')
  }
  if (a.p_kind === 'pit' && Object.values(p.capabilities ?? {}).some(v => !['yes', 'no', 'unknown'].includes(v))) return fail('Choose a pit claim state.')
  if (a.p_kind === 'message' && (!p.text?.trim() || !['open', 'resolved'].includes(p.status))) return fail('Enter a message and status.')
  if (a.p_kind === 'message' && p.reply_to && !rows(db, 'scouting_records').some(r => r.id === p.reply_to && r.kind === 'message' && r.event_id === a.p_event && r.team_number === a.p_team && !r.payload.reply_to)) return fail('A reply must reference an original pit message for the same team and event.')
  if (old && a.p_kind === 'message' && old.payload.reply_to !== p.reply_to) return fail('A reply cannot move to another conversation.')
  if (a.p_kind === 'pick_list') {
    if (!Array.isArray(p.entries) || new Set(p.entries.map(e => e.team)).size !== p.entries.length || p.entries.some(e => !Number.isInteger(e.team) || e.team <= 0 || ![1, 2, 3, 'dnp'].includes(e.tier) || !Number.isInteger(e.rank) || e.rank <= 0)) return fail('A pick list needs unique teams, tiers, and positive ranks.')
    if (!old && rows(db, 'scouting_records').some(r => r.event_id === a.p_event && r.member_id === user.id && r.kind === 'pick_list')) return fail('Your pick list already exists. Reload it before editing.', '40001')
  }
  if (!old && rows(db, 'scouting_records').some(r => r.event_id === a.p_event && r.kind === a.p_kind && (
    (['team', 'pit'].includes(a.p_kind) && r.team_number === a.p_team)
    || (a.p_kind === 'observation' && r.member_id === user.id && r.team_number === a.p_team && matchIdentity(r) === matchIdentity({ match_key: a.p_match, payload: p }))
    || (a.p_kind === 'assignment' && p.status !== 'cancelled' && r.payload.status !== 'cancelled' && r.payload.assignee === p.assignee && r.team_number === a.p_team && matchIdentity(r) === matchIdentity({ match_key: a.p_match, payload: p }))
  ))) return fail('A record already exists. Refresh and edit it.', '40001')
  const at = stamp(now)
  const record = { id: a.p_id, event_id: a.p_event, member_id: old?.member_id ?? user.id, kind: a.p_kind, team_number: a.p_team, match_key: a.p_match, payload: structuredClone(p), version: (old?.version ?? 0) + 1, created_at: old?.created_at ?? at, updated_at: at }
  if (old) engine.updateRows('scouting_records', r => r.id === record.id, record)
  else engine.insertRow('scouting_records', record)
  engine.insertRow('scouting_revisions', { record_id: record.id, event_id: record.event_id, member_id: record.member_id, changed_by: user.id, version: record.version, snapshot: structuredClone(record), created_at: at })
  engine.insertRow('scouting_operations', { operation_id: a.p_operation, member_id: user.id, request: structuredClone(a), result: structuredClone(record), created_at: at })
  if (['message', 'observation'].includes(a.p_kind) && p.request_delivery) engine.insertRow('scouting_delivery', { id: uuid(), record_id: record.id, event_id: record.event_id, record_version: record.version, status: 'queued', created_at: at, updated_at: at })
  return ok(record)
}

export default {
  migration: '0022',
  creates: {
    tables: ['scouting_records', 'scouting_revisions', 'scouting_operations', 'scouting_delivery'],
    rpcs: ['scouting_save', 'scouting_can_manage', 'scouting_can_access', 'scouting_roster'],
  },
  seed: ({ ids, now }) => {
    const at = stamp(now)
    const record = (n, kind, team, payload, member = ids.mentor, match = null) => ({ id: id(n), event_id: EVENT, member_id: member, kind, team_number: team, match_key: match, payload, version: 1, created_at: at, updated_at: at })
    const records = [
      ...[[4414, 'HighTide', 86], [5669, 'Techmen', 62], [1538, 'The Holy Cows', 74], [1323, 'MadTown Robotics', null]].map(([team, name, epa], i) => record(i + 1, 'team', team, { name, pit_location: `A${i + 10}`, source: 'manual', source_url: '', fetched_at: at, epa, epa_source: 'statbotics', epa_fetched_at: at })),
      record(10, 'pit', 4414, { capabilities: { trench: 'yes', bump: 'yes', ground_intake: 'yes' }, notes: 'Claims all three capabilities. Verify in matches.', pit_location: 'A10' }),
      record(11, 'pit', 5669, { capabilities: { trench: 'unknown', bump: 'yes', ground_intake: 'yes' }, notes: '', pit_location: 'A11' }),
      record(20, 'assignment', 4414, { assignee: ids.student, status: 'assigned', instructions: 'Watch their intake and crossing routes.', video_url: '' }, ids.mentor, 'qm1'),
      record(21, 'assignment', 1538, { assignee: ids.student2, status: 'assigned', instructions: 'Review a previous match.', video_url: 'https://www.youtube.com/watch?v=XM7l9Z1HiDs' }, ids.mentor, 'qm2'),
      record(30, 'message', 1538, { text: 'Ask whether the intake jam was repaired.', status: 'open', request_delivery: true }, ids.student2),
      record(40, 'observation', 4414, { answers: { trench: 'yes', bump: 'did_not_see', ground_intake: 'yes' }, notes: 'Clean trench crossing.', source: 'live', video_url: '' }, ids.student2, 'qm3'),
      record(41, 'observation', 4414, { answers: { trench: 'no', bump: 'yes', ground_intake: 'yes' }, notes: 'Stopped at the trench.', source: 'live', video_url: '' }, ids.student2, 'qm4'),
      record(50, 'pick_list', null, { entries: [{ team: 4414, tier: 1, rank: 1 }, { team: 1538, tier: 1, rank: 2 }, { team: 5669, tier: 2, rank: 1 }, { team: 1323, tier: 3, rank: 1 }] }, ids.student),
      record(51, 'pick_list', null, { entries: [{ team: 1538, tier: 1, rank: 1 }, { team: 4414, tier: 1, rank: 2 }, { team: 5669, tier: 2, rank: 1 }, { team: 1323, tier: 'dnp', rank: 1 }] }, ids.student2),
    ]
    return {
      scouting_records: records,
      scouting_revisions: records.map((r, i) => ({ record_id: r.id, event_id: EVENT, member_id: r.member_id, changed_by: r.member_id, version: 1, snapshot: structuredClone(r), created_at: at })),
      scouting_operations: [],
      scouting_delivery: [{ id: id(200), record_id: id(30), event_id: EVENT, record_version: 1, status: 'failed', error: 'Fixture: Discord unavailable. The scouting note is saved.', created_at: at, updated_at: at }],
    }
  },
  visible: {
    scouting_records: eligible,
    scouting_revisions: eligible,
    scouting_operations: () => false,
    scouting_delivery: eligible,
  },
  rpcs: {
    scouting_can_access: ctx => ok(eligible(ctx)),
    scouting_can_manage: ctx => ok(manages(ctx, ctx.args.p_event)),
    scouting_roster: ctx => manages(ctx, ctx.args.p_event) ? ok(rows(ctx.db, 'profiles').filter(p => p.approved && p.status === 'active' && (!rows(ctx.db, 'member_roles').some(r => r.member_id === p.id && r.role === 'parent') || rows(ctx.db, 'member_roles').some(r => r.member_id === p.id && ['admin','mentor','lead'].includes(r.role)))).map(p => ({ id:p.id, full_name:p.full_name, nickname:p.nickname }))) : fail('Scouting manager required.', '42501'),
    scouting_save: save,
  },
  functions: {
    'scouting-dispatch': ({ body, persona, engine, now }) => {
      if (!persona || persona.isParent) return fail('Not permitted.', '42501')
      const changed = engine.updateRows('scouting_delivery', r => r.record_id === body?.record_id && ['queued', 'failed', 'not_configured'].includes(r.status), { status: 'not_configured', error: 'Discord is not configured in fixture mode.', updated_at: stamp(now) })
      return ok({ status: 'not_configured', sent: false, count: changed.length })
    },
  },
}
