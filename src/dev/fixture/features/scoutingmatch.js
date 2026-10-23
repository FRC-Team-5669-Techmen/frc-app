// Fixture: the REBUILT match fields (supabase/migrations/0027_scouting_match_fields.sql,
// ledger 0017). The validation itself is ported into features/scouting.js's
// save (it answers only while 0027 is applied); this file adds the field list
// function, so the page knows 0027 is there, and seeds observations carrying
// match fields for the team view and the pick-list filters. Proven on SQL by
// 0027_scouting_match_fields_rls_test.sql and mutants-0027.mjs.
const EVENT = '16000000-0000-4000-8000-000000000001'
const id = (n) => `22700000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const MATCH_FIELD_LIST = { version: 1, counts: ['auto_fuel', 'teleop_fuel', 'teleop_missed'], yes_no: ['auto_climb', 'shuttled', 'died', 'tipped', 'stuck', 'broke'], defense: ['none', 'some', 'most'], ratings: ['defense_rating', 'driver_skill'], tower: ['none', 'level1', 'level2', 'level3', 'failed', 'did_not_see'], notes: ['fouls'] }

export default {
  migration: '0027',
  creates: { rpcs: ['scouting_match_fields'] },
  // Team 1538 in three matches by Riley and the mentor: two scouts on qm5
  // (median per match), a got-stuck match, a level 2 and a level 3 climb.
  seed: ({ ids, now }) => {
    const at = new Date(now).toISOString()
    const obs = (n, member, match, m) => ({ id: id(n), event_id: EVENT, member_id: member, kind: 'observation', team_number: 1538, match_key: match, version: 1, created_at: at, updated_at: at,
      payload: { answers: {}, notes: '', source: 'live', video_url: '', match: m } })
    const rows = [
      obs(1, ids.student2, 'qm5', { auto_fuel: 3, teleop_fuel: 14, tower: 'level2', stuck: 'no', died: 'no', driver_skill: 4, defense: 'none' }),
      obs(2, ids.mentor, 'qm5', { auto_fuel: 5, teleop_fuel: 18, tower: 'level2', stuck: 'no', driver_skill: 3 }),
      obs(3, ids.student2, 'qm9', { auto_fuel: 2, teleop_fuel: 9, tower: 'failed', stuck: 'yes', died: 'no', defense: 'some', defense_rating: 3, fouls: 'G204 pin' }),
      obs(4, ids.student2, 'qm14', { auto_fuel: 4, teleop_fuel: 22, tower: 'level3', stuck: 'no', shuttled: 'yes', driver_skill: 5 }),
    ]
    return {
      scouting_records: rows,
      scouting_revisions: rows.map((r) => ({ record_id: r.id, event_id: EVENT, member_id: r.member_id, changed_by: r.member_id, version: 1, snapshot: structuredClone(r), created_at: at })),
    }
  },
  rpcs: { scouting_match_fields: () => ({ data: MATCH_FIELD_LIST, error: null }) },
}
